import UIKit

struct ShellSearch: Decodable, Equatable {
    let id: String
    let field: ShellItemContent
    let trigger: ShellItem
    let closeId: String
    let active: Bool
    let available: Bool
    let focused: Bool
    let value: String
    let placeholder: String
    let disabled: Bool
    let editSequence: Int
    let valueVersion: Int

    var isValid: Bool {
        !id.isEmpty && !closeId.isEmpty && field.isValid && trigger.isValid && editSequence >= 0 && valueVersion >= 0
    }
}

enum ShellSearchPhase: String { case input, focus, blur, clear, commit }

// A controller's empty content must not intercept the existing WebView.
final class ShellSearchHost: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let hit = super.hitTest(point, with: event) else { return nil }
        var ancestor: UIView? = hit
        while let current = ancestor, current !== self {
            if current is UIControl || current is UISearchBar || current is UITabBar { return hit }
            ancestor = current.superview
        }
        return nil
    }
}

// Preserve UISearchBar's delegate while returning its clear action to Ionic.
final class ShellSearchInputDelegate: NSObject, UITextFieldDelegate {
    weak var original: UITextFieldDelegate?
    var clear: (() -> Void)?
    override func responds(to selector: Selector!) -> Bool {
        super.responds(to: selector) || original?.responds(to: selector) == true
    }
    override func forwardingTarget(for selector: Selector!) -> Any? { original }
    func textFieldShouldClear(_ textField: UITextField) -> Bool { clear?(); return false }
}

// Lets the plugin registry retain iOS 26-gated search controllers without
// availability-gated stored properties, mirroring ShellVerticalBarsControlling.
protocol ShellSearchControlling: AnyObject {
    var surface: ShellSearchHost { get }
    var ownsKeyboard: Bool { get }
    var ownsKeyboardChrome: Bool { get }
    var transitionCoordinator: UIViewControllerTransitionCoordinator? { get }
    var activate: ((String) -> Void)? { get set }
    var changed: ((String, ShellSearchPhase, String, Bool, Int) -> Int)? { get set }
    func attach(to parent: UIViewController, in container: UIView)
    func detach()
    func apply(_ snapshot: ShellControl, webFrame: CGRect, barFrame: CGRect, triggerFrame: CGRect, rendering: ShellRendering) -> Bool
}

@available(iOS 26.0, *)
final class ShellSearchController: UITabBarController, UITabBarControllerDelegate, UISearchBarDelegate, ShellSearchControlling {
    // Wire stays active+focused; local session drives chrome (idle / presented / focused).
    private enum Session: Equatable { case idle, presented, focused }

    let surface = ShellSearchHost()
    private var restingBarFrame: CGRect?
    private var restingBarAnchor: ShellTabBar.Anchor?
    private var fittingTabBar = false
    private let search = UISearchController(searchResultsController: nil)
    private let inputDelegate = ShellSearchInputDelegate()
    private var searchTab: UISearchTab!
    private var ordinary: [String: UITab] = [:]
    private var configuration: ShellSearch?
    private var selectedID = ""
    private var closing = false
    private var editingSequence = 0
    private var valueVersion = -1
    private var lockedWebFrame: CGRect? // frozen while search is active (width changes re-lock)
    private var session: Session = .idle
    private var focusWork: DispatchWorkItem?
    private var pendingSelection: ShellTabBar.PendingSelection? // optimistic ordinary tab
    private var pendingExpiryWork: DispatchWorkItem?
    var ownsKeyboard: Bool { search.searchBar.searchTextField.isFirstResponder }
    var ownsKeyboardChrome: Bool { session == .focused || ownsKeyboard }
    var activate: ((String) -> Void)?
    var changed: ((String, ShellSearchPhase, String, Bool, Int) -> Int)?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        surface.backgroundColor = .clear
        surface.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        delegate = self
        mode = .tabBar
        ShellTabBar.configureLayout(tabBar)
        search.obscuresBackgroundDuringPresentation = false
        search.hidesNavigationBarDuringPresentation = false
        search.searchBar.delegate = self
        search.searchBar.autocapitalizationType = .none
        search.searchBar.autocorrectionType = .no
        search.searchBar.spellCheckingType = .no
        search.searchBar.searchTextField.clearButtonMode = .always
        searchTab = UISearchTab { [weak self] _ in
            let child = UIViewController()
            child.view.backgroundColor = .clear
            child.definesPresentationContext = true
            child.navigationItem.searchController = self?.search
            child.navigationItem.hidesSearchBarWhenScrolling = false
            child.navigationItem.preferredSearchBarPlacement = .integrated
            let navigation = UINavigationController(rootViewController: child)
            navigation.view.backgroundColor = .clear
            return navigation
        }
        searchTab.automaticallyActivatesSearch = false
        inputDelegate.clear = { [weak self] in self?.emit(.clear) }
    }

    deinit {
        focusWork?.cancel()
        pendingExpiryWork?.cancel()
    }

    private func wantedSession(active: Bool, focused: Bool) -> Session {
        if !active { return .idle }
        return focused ? .focused : .presented
    }

    private func endEditing() {
        focusWork?.cancel()
        focusWork = nil
        if search.searchBar.searchTextField.isFirstResponder {
            search.searchBar.searchTextField.resignFirstResponder()
        }
        if search.isActive { search.isActive = false }
    }

    private func applySession(_ wanted: Session, selectingSearchTab: Bool) {
        if wanted == session && !selectingSearchTab { return }
        if wanted == .idle {
            endEditing()
            session = .idle
            return
        }
        if selectingSearchTab || selectedTab !== searchTab { selectedTab = searchTab }
        if wanted == .presented {
            if session == .focused { endEditing() }
            session = .presented
            return
        }
        session = .focused
        if !search.isActive { search.isActive = true }
        guard !search.searchBar.searchTextField.isFirstResponder, focusWork == nil else { return }
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.focusWork = nil
            guard self.session == .focused, !self.search.searchBar.searchTextField.isFirstResponder else { return }
            if !self.search.isActive { self.search.isActive = true }
            _ = self.search.searchBar.searchTextField.becomeFirstResponder()
        }
        focusWork = work
        DispatchQueue.main.async(execute: work)
    }

    private func armPendingSelection(_ id: String) {
        pendingSelection = .start(id)
        schedulePendingExpiry()
    }

    private func clearPendingSelection() {
        pendingExpiryWork?.cancel()
        pendingExpiryWork = nil
        pendingSelection = nil
    }

    private func schedulePendingExpiry() {
        pendingExpiryWork?.cancel()
        pendingExpiryWork = nil
        guard let pending = pendingSelection else { return }
        let delay = max(0, pending.until - CFAbsoluteTimeGetCurrent()) + 0.02
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.pendingExpiryWork = nil
            guard let pending = self.pendingSelection, CFAbsoluteTimeGetCurrent() >= pending.until else { return }
            self.pendingSelection = nil
            // Revert to the last DOM selection if Ionic did not accept the action.
            if let selected = self.ordinary[self.selectedID], self.selectedTab !== selected {
                self.selectedTab = selected
            }
        }
        pendingExpiryWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func resolveOrdinarySelection(_ items: [ShellItem], fallback: UITab?) {
        let domSelected = ordinary[selectedID] ?? fallback
        guard let pending = pendingSelection else {
            pendingExpiryWork?.cancel()
            pendingExpiryWork = nil
            if selectedTab !== domSelected { selectedTab = domSelected }
            return
        }
        let pendingTab = ordinary[pending.id]
        let expired = CFAbsoluteTimeGetCurrent() >= pending.until
        let unavailable = pendingTab == nil || (items.first { $0.id == pending.id }?.content.disabled ?? true)
        if unavailable || expired {
            clearPendingSelection()
            selectedTab = domSelected
        } else if selectedID == pending.id {
            clearPendingSelection()
            if selectedTab !== domSelected { selectedTab = domSelected }
        } else if selectedTab !== pendingTab {
            selectedTab = pendingTab
        }
    }

    func attach(to parent: UIViewController, in container: UIView) {
        parent.addChild(self)
        container.addSubview(surface)
        surface.addSubview(view)
        didMove(toParent: parent)
    }

    func detach() {
        closing = true
        lockedWebFrame = nil
        clearPendingSelection()
        applySession(.idle, selectingSearchTab: false)
        willMove(toParent: nil)
        restingBarFrame = nil
        surface.removeFromSuperview()
        view.removeFromSuperview()
        removeFromParent()
    }

    func apply(_ snapshot: ShellControl, webFrame: CGRect, barFrame: CGRect, triggerFrame: CGRect,
               rendering: ShellRendering) -> Bool {
        loadViewIfNeeded()
        guard let configuration = snapshot.search else { return false }
        if self.configuration?.id != configuration.id {
            editingSequence = 0
            valueVersion = -1
        }
        let wasActive = self.configuration.map { $0.available && $0.active } ?? false
        self.configuration = configuration
        let available = configuration.available
        let active = available && configuration.active
        let wanted = wantedSession(active: active, focused: configuration.focused)
        let items = snapshot.items
        let ids = items.map(\.id)
        for id in Array(ordinary.keys) where !ids.contains(id) { ordinary.removeValue(forKey: id) }
        for item in items {
            let id = item.id
            let tab = ordinary[id] ?? UITab(title: "", image: nil, identifier: id) { _ in
                let child = UIViewController()
                child.view.backgroundColor = .clear
                return child
            }
            tab.accessibilityIdentifier = id
            tab.title = item.content.label
            tab.image = rendering.image(item.content)
            tab.badgeValue = item.content.badge?.value
            tab.isEnabled = !item.content.disabled
            ordinary[id] = tab
            if item.content.selected { selectedID = id }
        }
        let trigger = configuration.trigger
        searchTab.accessibilityIdentifier = trigger.id
        searchTab.image = rendering.image(trigger.content)
        searchTab.isEnabled = !configuration.disabled
        let requested = ids.compactMap { ordinary[$0] } + (available ? [searchTab!] : [])
        if !active, tabs.isEmpty || tabs.map(\.identifier) != requested.map(\.identifier) {
            tabs = requested
        }
        for item in items {
            if let nativeItem = ordinary[item.id]?.viewController?.tabBarItem {
                nativeItem.accessibilityLabel = item.content.accessibilityLabel
                ShellTabBar.applyTypography(item.content, to: nativeItem)
                ShellTabBar.applyBadge(item.content.badge, to: nativeItem, rendering: rendering)
            }
        }
        searchTab.viewController?.tabBarItem.accessibilityLabel = trigger.content.accessibilityLabel
        let prominent = NSSelectorFromString("setProminentTabIdentifier:")
        if responds(to: prominent) { setValue(available ? searchTab.identifier : nil, forKey: "prominentTabIdentifier") }
        let field = configuration.field
        search.searchBar.searchTextField.accessibilityIdentifier = configuration.id
        search.searchBar.searchTextField.accessibilityLabel = field.accessibilityLabel
        search.searchBar.setImage(rendering.image(field), for: .search, state: .normal)
        search.searchBar.placeholder = configuration.placeholder
        search.searchBar.searchTextField.isEnabled = !configuration.disabled
        let nextValueVersion = configuration.valueVersion
        if nextValueVersion != valueVersion || configuration.editSequence >= editingSequence {
            valueVersion = nextValueVersion
            let value = configuration.value
            if search.searchBar.text != value { search.searchBar.text = value }
        }
        if search.searchBar.searchTextField.delegate !== inputDelegate {
            inputDelegate.original = search.searchBar.searchTextField.delegate
            search.searchBar.searchTextField.delegate = inputDelegate
        }
        // Resting keeps closing=true so hidden UISearchBar noise cannot emit; clear it while active.
        closing = !active
        surface.isHidden = false
        surface.overrideUserInterfaceStyle = snapshot.dark ? .dark : .light
        if active {
            // UISearchTab session owns the bar + keyboard; freeze Web layout for the session.
            if tabs.isEmpty || tabs.map(\.identifier) != requested.map(\.identifier) {
                tabs = requested
            }
            restingBarFrame = nil
            view.frame = surface.bounds
            let nextLock = surface.bounds.isEmpty ? webFrame : surface.frame
            if let locked = lockedWebFrame, abs(locked.width - webFrame.width) > 0.5 {
                // Rotation / size-class change: adopt the new width while still ignoring keyboard shrink.
                lockedWebFrame = webFrame
            } else if lockedWebFrame == nil {
                lockedWebFrame = nextLock
            }
            if let lockedWebFrame, surface.frame != lockedWebFrame { surface.frame = lockedWebFrame }
            clearPendingSelection()
            applySession(wanted, selectingSearchTab: !wasActive)
            return true
        }

        surface.frame = webFrame
        view.semanticContentAttribute = snapshot.rtl ? .forceRightToLeft : .forceLeftToRight
        tabBar.semanticContentAttribute = snapshot.rtl ? .forceRightToLeft : .forceLeftToRight
        tabBar.accessibilityIdentifier = snapshot.id
        if lockedWebFrame != nil {
            lockedWebFrame = nil
        }
        applySession(.idle, selectingSearchTab: false)

        view.frame = surface.bounds
        resolveOrdinarySelection(items, fallback: requested.first)
        restingBarFrame = surface.convert(barFrame, from: surface.superview)
        restingBarAnchor = snapshot.tabBarAnchor
        view.setNeedsLayout()
        view.layoutIfNeeded()
        return fitRestingTabBar()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if session == .idle { _ = fitRestingTabBar() }
    }

    /// Match the ordinary tab platter to the source ion-tab-bar by resizing
    /// the controller's view, so UIKit can keep managing its tab bar through
    /// search expansion and dismissal.
    private func fitRestingTabBar() -> Bool {
        guard let bounds = restingBarFrame, !fittingTabBar else { return true }
        fittingTabBar = true
        defer { fittingTabBar = false }
        tabBar.layoutIfNeeded()
        for _ in 0..<2 {
            let regions = ShellTabBar.contentViews(tabBar)
            func controlCount(_ view: UIView) -> Int {
                (view is UIControl ? 1 : 0) + view.subviews.reduce(0) { $0 + controlCount($1) }
            }
            // Ordinary tabs contain their item controls; Search contains one.
            // For a single tab, UIKit places ordinary tabs at the leading edge.
            let rtl = tabBar.effectiveUserInterfaceLayoutDirection == .rightToLeft
            guard let region = regions.max(by: {
                let lhs = controlCount($0), rhs = controlCount($1)
                if lhs != rhs { return lhs < rhs }
                return rtl ? $0.frame.midX < $1.frame.midX : $0.frame.midX > $1.frame.midX
            }) else { return false }
            let content = region.frame
            let contents = regions.map { $0.frame }
            let measured = tabBar.convert(content, to: surface)
            let width = bounds.width - measured.width
            let x = bounds.minX + (bounds.width - measured.width) * (restingBarAnchor?.x ?? 0) - measured.minX
            let y = bounds.minY + (bounds.height - measured.height) * (restingBarAnchor?.y ?? 0) - measured.minY
            // UIKit rounds the platter frame; a subpoint difference must not
            // keep invalidating its layout during search transitions.
            if abs(width) <= 0.5 && abs(x) <= 0.5 && abs(y) <= 0.5 { break }
            var frame = view.frame
            // The controller also contains the separate search button. Include
            // that space in its width limit without enlarging capped tab groups.
            let searchWidth = contents.filter { $0 != content }.reduce(CGFloat(0)) { $0 + $1.width }
            frame.size.width = min(frame.width + width, surface.bounds.width + searchWidth)
            frame.origin.x += x
            frame.origin.y += y
            if abs(frame.width - view.frame.width) <= 0.5 && abs(x) <= 0.5 && abs(y) <= 0.5 { break }
            view.frame = frame
            view.setNeedsLayout()
            view.layoutIfNeeded()
        }
        return true
    }

    func tabBarController(_ tabBarController: UITabBarController, shouldSelectTab tab: UITab) -> Bool {
        guard let configuration else { return false }
        if tab === searchTab {
            restingBarFrame = nil
            clearPendingSelection()
            activate?(configuration.trigger.id)
            return true
        }
        if configuration.active {
            if tab.identifier == selectedID { activate?(configuration.closeId) }
            else { activate?(tab.identifier) }
            return false
        }
        armPendingSelection(tab.identifier)
        if selectedTab !== tab { selectedTab = tab }
        activate?(tab.identifier)
        return true
    }

    private func emit(_ phase: ShellSearchPhase) {
        guard !closing, let configuration else { return }
        editingSequence = changed?(configuration.id, phase, search.searchBar.text ?? "", search.searchBar.searchTextField.markedTextRange != nil, valueVersion) ?? editingSequence
    }
    func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) { emit(.input) }
    func searchBarTextDidBeginEditing(_ searchBar: UISearchBar) {
        if session != .idle { session = .focused }
        emit(.focus)
    }
    func searchBarTextDidEndEditing(_ searchBar: UISearchBar) {
        if session == .focused { session = .presented }
        emit(.blur)
    }
    func searchBarSearchButtonClicked(_ searchBar: UISearchBar) { emit(.commit) }
    func searchBarCancelButtonClicked(_ searchBar: UISearchBar) {
        closing = true
        if let configuration { activate?(configuration.closeId) }
    }
}
