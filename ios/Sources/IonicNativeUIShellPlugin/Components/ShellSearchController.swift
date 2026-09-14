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
    var ownsKeyboard: Bool { search.searchBar.searchTextField.isFirstResponder }
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
            child.navigationItem.preferredSearchBarPlacement = .integrated
            let navigation = UINavigationController(rootViewController: child)
            navigation.view.backgroundColor = .clear
            return navigation
        }
        searchTab.automaticallyActivatesSearch = false
        inputDelegate.clear = { [weak self] in self?.emit(.clear) }
    }

    func attach(to parent: UIViewController, in container: UIView) {
        parent.addChild(self)
        container.addSubview(surface)
        surface.addSubview(view)
        didMove(toParent: parent)
    }

    func detach() {
        closing = true
        search.isActive = false
        willMove(toParent: nil)
        surface.removeFromSuperview()
        view.removeFromSuperview()
        removeFromParent()
    }

    func apply(_ snapshot: ShellControl, webFrame: CGRect, barFrame: CGRect, triggerFrame: CGRect,
               rendering: ShellRendering) -> Bool {
        loadViewIfNeeded()
        guard let configuration = snapshot.search else { return false }
        self.configuration = configuration
        let available = configuration.available
        let active = available && configuration.active
        // UIKit may clear the field while changing tabs. Retiring must not
        // advance native editing beyond the last input accepted by Ionic.
        if !active { closing = true }
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
        if tabs.map(\.identifier) != requested.map(\.identifier) { tabs = requested; lastLayout = "" }
        for item in items {
            if let nativeItem = ordinary[item.id]?.viewController?.tabBarItem {
                ShellTabBar.applyBadge(item.content.badge, to: nativeItem, rendering: rendering)
            }
        }
        // This is a public iOS 27 property; dynamic dispatch also supports apps built with SDK 26.
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
        surface.frame = webFrame
        surface.isHidden = false
        surface.overrideUserInterfaceStyle = snapshot.dark ? .dark : .light
        view.semanticContentAttribute = snapshot.rtl ? .forceRightToLeft : .forceLeftToRight
        // Only measure the resting tabs. UIKit owns all frames during search and keyboard movement.
        let layout = "\(webFrame):\(barFrame):\(triggerFrame):\(available):\(snapshot.rtl)"
        if !active && lastLayout != layout {
            closing = true
            search.isActive = false
            selectedTab = ordinary[selectedID] ?? requested.first
            view.frame = surface.bounds
            view.layoutIfNeeded()
            guard fit(barFrame: surface.convert(barFrame, from: surface.superview), triggerFrame: surface.convert(triggerFrame, from: surface.superview),
                      available: available, anchor: snapshot.tabBarAnchor) else { return false }
            lastLayout = layout
        }
        let wanted = active ? searchTab : ordinary[selectedID]
        if selectedTab !== wanted { selectedTab = wanted }
        closing = !active
        if !active { search.isActive = false }
        else if configuration.focused && !search.searchBar.searchTextField.isFirstResponder {
            search.isActive = true
            search.searchBar.searchTextField.becomeFirstResponder()
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
        if let targetSearch,
           let control = searchControl {
            let rect = control.convert(control.bounds, to: surface)
            return abs(rect.midX - targetSearch) <= 1 && abs(rect.midY - triggerFrame.midY) <= 1
        }
        return true
    }

    func tabBarController(_ tabBarController: UITabBarController, shouldSelectTab tab: UITab) -> Bool {
        guard let configuration else { return false }
        let active = configuration.active
        if tab === searchTab { activate?(configuration.trigger.id) }
        else if active && tab.identifier == selectedID { activate?(configuration.closeId) }
        else { activate?(tab.identifier) }
        return false
    }

    private func emit(_ phase: ShellSearchPhase) {
        guard !closing, let configuration else { return }
        editingSequence = changed?(configuration.id, phase, search.searchBar.text ?? "", search.searchBar.searchTextField.markedTextRange != nil, valueVersion) ?? editingSequence
    }
    func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) { emit(.input) }
    func searchBarTextDidBeginEditing(_ searchBar: UISearchBar) { emit(.focus) }
    func searchBarTextDidEndEditing(_ searchBar: UISearchBar) { emit(.blur) }
    func searchBarSearchButtonClicked(_ searchBar: UISearchBar) { emit(.commit) }
    func searchBarCancelButtonClicked(_ searchBar: UISearchBar) {
        closing = true
        if let configuration { activate?(configuration.closeId) }
    }
}
