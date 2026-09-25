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
private final class ShellSearchInputDelegate: NSObject, UITextFieldDelegate {
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

    private final class IdleBarDelegate: NSObject, UITabBarDelegate {
        var select: ((String) -> Void)?
        func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
            guard item.isEnabled, let id = item.accessibilityIdentifier else { return }
            select?(id)
        }
    }

    let surface = ShellSearchHost()
    /// Ordinary `UITabBar` chrome while searchable is registered but the session is idle.
    /// Matches `ShellTabBar.fit` so Index/Album resting tabs do not jump.
    private let idleBar = UITabBar()
    private let idleBarDelegate = IdleBarDelegate()
    /// Resting search trigger pinned to the Web FAB while `available && !active`.
    private var searchTrigger: UIButton?
    private let search = UISearchController(searchResultsController: nil)
    private let inputDelegate = ShellSearchInputDelegate()
    private var searchTab: UISearchTab!
    private var ordinary: [String: UITab] = [:]
    private var configuration: ShellSearch?
    private var selectedID = ""
    private var closing = false
    private var editingSequence = 0
    private var valueVersion = -1
    private var lastLayout = ""
    private var layoutItems: [ShellItemContent] = []
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
        ShellTabBar.configureLayout(idleBar)
        // Must not use self as idleBar.delegate — UITabBarController asserts item↔VC pairing.
        idleBar.delegate = idleBarDelegate
        idleBarDelegate.select = { [weak self] id in
            self?.armPendingSelection(id)
            self?.activate?(id)
        }
        idleBar.isHidden = true
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
            // No later apply: revert idle chrome + controller selection to the last DOM selected id.
            if let item = self.idleBar.items?.first(where: { $0.accessibilityIdentifier == self.selectedID }) {
                self.idleBar.selectedItem = item
            }
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
        if idleBar.superview !== surface { surface.addSubview(idleBar) }
        didMove(toParent: parent)
    }

    func detach() {
        closing = true
        lockedWebFrame = nil
        clearPendingSelection()
        applySession(.idle, selectingSearchTab: false)
        willMove(toParent: nil)
        idleBar.removeFromSuperview()
        searchTrigger?.removeFromSuperview()
        searchTrigger = nil
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
        let previousAvailable = self.configuration?.available
        let wasActive = self.configuration.map { $0.available && $0.active } ?? false
        self.configuration = configuration
        let available = configuration.available
        let active = available && configuration.active
        let wanted = wantedSession(active: active, focused: configuration.focused)
        let items = snapshot.items
        let content = items.map(\.content)
        if layoutItems != content {
            layoutItems = content
            lastLayout = ""
        }
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
        if !active, wasActive || tabs.isEmpty || tabs.map(\.identifier) != requested.map(\.identifier) {
            // Leave / availability flips rebuild tabs (UISearchTab morph cleanup when leaving).
            tabs = requested
            lastLayout = ""
        }
        for item in items {
            if let nativeItem = ordinary[item.id]?.viewController?.tabBarItem {
                nativeItem.accessibilityLabel = item.content.accessibilityLabel
                ShellTabBar.applyTypography(item.content, to: nativeItem)
                ShellTabBar.applyBadge(item.content.badge, to: nativeItem, rendering: rendering)
            }
        }
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
        let layout = "\(webFrame):\(barFrame):\(triggerFrame):\(available):\(snapshot.rtl)"
        // Resting keeps closing=true so hidden UISearchBar noise cannot emit; clear it while active.
        closing = !active
        surface.isHidden = false
        surface.overrideUserInterfaceStyle = snapshot.dark ? .dark : .light
        if active {
            // UISearchTab session owns the bar + keyboard; freeze Web layout for the session.
            if tabs.isEmpty || tabs.map(\.identifier) != requested.map(\.identifier) {
                tabs = requested
            }
            let reveal = {
                self.idleBar.isHidden = true
                self.searchTrigger?.isHidden = true
                self.view.isHidden = false
                self.view.frame = self.surface.bounds
            }
            if !wasActive {
                UIView.transition(with: surface, duration: 0.35, options: [.transitionCrossDissolve, .beginFromCurrentState], animations: reveal)
            } else {
                reveal()
            }
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
        idleBar.semanticContentAttribute = snapshot.rtl ? .forceRightToLeft : .forceLeftToRight
        if lockedWebFrame != nil {
            lockedWebFrame = nil
            lastLayout = ""
        }
        applySession(.idle, selectingSearchTab: false)

        // Resting chrome: ordinary UITabBar (+ FAB trigger when available). UISearchTab stays off-screen.
        if idleBar.superview !== surface { surface.addSubview(idleBar) }
        let localBar = surface.convert(barFrame, from: surface.superview)
        let localTrigger = surface.convert(triggerFrame, from: surface.superview)
        // Apply optimistic selection to the visible idle bar before reconciling the hidden controller.
        ShellTabBar.update(idleBar, node: snapshot, rendering: rendering, pendingSelection: &pendingSelection)
        resolveOrdinarySelection(items, fallback: requested.first)
        if !available {
            searchTrigger?.removeFromSuperview()
            searchTrigger = nil
        } else {
            let triggerButton = ShellButton.render(configuration.trigger.content, glass: true, existing: searchTrigger, rendering: rendering) { [weak self] id in
                self?.activate?(id)
            }
            if searchTrigger !== triggerButton {
                searchTrigger?.removeFromSuperview()
                searchTrigger = triggerButton
                surface.addSubview(triggerButton)
            }
            triggerButton.frame = localTrigger
        }

        let revealResting = {
            self.view.isHidden = true
            self.idleBar.isHidden = false
            self.idleBar.overrideUserInterfaceStyle = snapshot.dark ? .dark : .light
            self.searchTrigger?.isHidden = !available
            self.searchTrigger?.overrideUserInterfaceStyle = snapshot.dark ? .dark : .light
        }
        let animateChrome = wasActive || (previousAvailable != nil && previousAvailable != available)
        if animateChrome {
            UIView.transition(with: surface, duration: 0.35, options: [.transitionCrossDissolve, .beginFromCurrentState], animations: revealResting)
        } else {
            revealResting()
        }
        if lastLayout != layout {
            guard ShellTabBar.fit(idleBar, node: snapshot, bounds: localBar) else { return false }
            lastLayout = layout
        }
        return true
    }

    func tabBarController(_ tabBarController: UITabBarController, shouldSelectTab tab: UITab) -> Bool {
        guard let configuration else { return false }
        if tab === searchTab {
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
