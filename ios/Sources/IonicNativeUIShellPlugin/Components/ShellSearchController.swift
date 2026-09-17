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

@available(iOS 26.0, *)
final class ShellSearchController: UITabBarController, UITabBarControllerDelegate, UISearchBarDelegate {
    // Wire stays active+focused; local session drives chrome (idle / presented / focused).
    private enum Session: Equatable { case idle, presented, focused }

    let surface = ShellSearchHost()
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
    private var lockedWebFrame: CGRect? // frozen while search is active
    private var session: Session = .idle
    private var focusWork: DispatchWorkItem?
    private var pendingSelection: ShellTabBar.PendingSelection? // optimistic ordinary tab
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

    deinit { focusWork?.cancel() }

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

    private func resolveOrdinarySelection(_ items: [ShellItem], fallback: UITab?) {
        let domSelected = ordinary[selectedID] ?? fallback
        guard let pending = pendingSelection else {
            if selectedTab !== domSelected { selectedTab = domSelected }
            return
        }
        let pendingTab = ordinary[pending.id]
        let expired = CFAbsoluteTimeGetCurrent() >= pending.until
        let unavailable = pendingTab == nil || (items.first { $0.id == pending.id }?.content.disabled ?? true)
        if unavailable || expired {
            pendingSelection = nil
            selectedTab = domSelected
        } else if selectedID == pending.id {
            pendingSelection = nil
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
        pendingSelection = nil
        applySession(.idle, selectingSearchTab: false)
        willMove(toParent: nil)
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
        if !active {
            closing = true
            if lockedWebFrame != nil {
                lockedWebFrame = nil
                lastLayout = ""
            }
        }
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
        if active {
            if tabs.isEmpty { tabs = requested }
        } else if wasActive || tabs.isEmpty || tabs.map(\.identifier) != requested.map(\.identifier) {
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
        if active {
            if lockedWebFrame == nil {
                lockedWebFrame = surface.bounds.isEmpty ? webFrame : surface.frame
            }
            if let lockedWebFrame, surface.frame != lockedWebFrame { surface.frame = lockedWebFrame }
        } else {
            surface.frame = webFrame
        }
        surface.isHidden = false
        surface.overrideUserInterfaceStyle = snapshot.dark ? .dark : .light
        view.semanticContentAttribute = snapshot.rtl ? .forceRightToLeft : .forceLeftToRight
        closing = !active
        let layout = "\(webFrame):\(barFrame):\(triggerFrame):\(available):\(snapshot.rtl)"
        if !active {
            applySession(.idle, selectingSearchTab: false)
            resolveOrdinarySelection(items, fallback: requested.first)
            if lastLayout != layout {
                view.frame = surface.bounds
                view.layoutIfNeeded()
                guard fit(barFrame: surface.convert(barFrame, from: surface.superview),
                          triggerFrame: surface.convert(triggerFrame, from: surface.superview),
                          available: available, anchor: snapshot.tabBarAnchor) else { return false }
                lastLayout = layout
            }
        } else {
            pendingSelection = nil
            applySession(wanted, selectingSearchTab: !wasActive)
        }
        return true
    }

    private func fit(barFrame: CGRect, triggerFrame: CGRect, available: Bool, anchor: ShellTabBar.Anchor?) -> Bool {
        func descendants(_ view: UIView) -> [UIView] { [view] + view.subviews.flatMap(descendants) }
        let groups = tabBar.subviews.filter { descendants($0).contains { $0 is UIControl } }
        guard ordinary.count > 1,
              let group = groups.first(where: { descendants($0).filter { $0 is UIControl }.count >= ordinary.count }) else { return false }
        let searchControl = groups.filter { $0 !== group }.flatMap(descendants).first { $0 is UIControl }
        let rect = group.convert(group.bounds, to: surface)
        let x = anchor?.x ?? 0
        let dx = barFrame.minX + (barFrame.width - rect.width) * x - rect.minX
        var frame = view.frame
        frame.origin.x += dx
        frame.size.height += barFrame.maxY - rect.maxY
        var targetSearch: CGFloat?
        if available {
            guard let control = searchControl else { return false }
            let target = triggerFrame.midX
            targetSearch = target
            frame.size.width += target - control.convert(control.bounds, to: surface).midX - dx
        } else {
            frame.size.width += barFrame.width - rect.width
        }
        view.frame = frame
        view.layoutIfNeeded()
        let final = group.convert(group.bounds, to: surface)
        guard abs(final.minX + final.width * x - (barFrame.minX + barFrame.width * x)) <= 1,
              abs(final.maxY - barFrame.maxY) <= 1 else { return false }
        if let targetSearch, let control = searchControl {
            let rect = control.convert(control.bounds, to: surface)
            return abs(rect.midX - targetSearch) <= 1 && abs(rect.midY - triggerFrame.midY) <= 1
        }
        return true
    }

    func tabBarController(_ tabBarController: UITabBarController, shouldSelectTab tab: UITab) -> Bool {
        guard let configuration else { return false }
        if tab === searchTab {
            pendingSelection = nil
            activate?(configuration.trigger.id)
            return true
        }
        if configuration.active {
            if tab.identifier == selectedID { activate?(configuration.closeId) }
            else { activate?(tab.identifier) }
            return false
        }
        pendingSelection = .start(tab.identifier)
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
