import UIKit

final class ShellTabsHost: UIView {
    weak var accessoryContent: UIView?
    weak var tabBar: UITabBar?

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard !isHidden, alpha > 0.01, isUserInteractionEnabled else { return nil }
        if let accessoryContent {
            let local = convert(point, to: accessoryContent)
            if let hit = accessoryContent.hitTest(local, with: event) { return hit }
            if accessoryContent.point(inside: local, with: event) { return accessoryContent }
            // UITabAccessory wraps content in a glass platter; keep body taps on the content view.
            if let chrome = accessoryContent.superview, chrome !== self, chrome.bounds.height > 0, chrome.bounds.height <= 120 {
                let chromeLocal = convert(point, to: chrome)
                if chrome.point(inside: chromeLocal, with: event) {
                    return accessoryContent.hitTest(local, with: event) ?? accessoryContent
                }
            }
        }
        if let tabBar {
            let local = convert(point, to: tabBar)
            if tabBar.point(inside: local, with: event), let hit = tabBar.hitTest(local, with: event) {
                return hit
            }
        }
        return nil
    }
}

/// Overlay that owns a real `UITabBarController` so `UITabAccessory` can project.
/// The tab controller's view must be a direct subview of this overlay's view.
@available(iOS 26.0, *)
final class ShellTabsController: UIViewController, UITabBarControllerDelegate {
    var activate: ((String) -> Void)?
    var selectedID = ""
    let surface = ShellTabsHost()

    private let barController = UITabBarController()
    private let content = ShellTabAccessoryContentView()
    private var ordinary: [String: UITab] = [:]
    private var pendingSelection: ShellTabBar.PendingSelection?
    private var pendingExpiryWork: DispatchWorkItem?
    private var artworkLoad: URLSessionDataTask?
    private var playId = ""
    private var artworkId = ""
    private var tapId = ""
    private var tabBar: UITabBar { barController.tabBar }

    override func loadView() {
        surface.backgroundColor = .clear
        surface.isOpaque = false
        view = surface
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        view.isOpaque = false
        barController.delegate = self
        barController.view.backgroundColor = .clear
        barController.view.isOpaque = false
        tabBar.isTranslucent = true
        let appearance = UITabBarAppearance()
        appearance.configureWithTransparentBackground()
        tabBar.standardAppearance = appearance
        tabBar.scrollEdgeAppearance = appearance
        if #available(iOS 18.0, *) { barController.mode = .tabBar }
        barController.tabBarMinimizeBehavior = .never

        addChild(barController)
        view.addSubview(barController.view)
        barController.view.translatesAutoresizingMaskIntoConstraints = false
        barController.didMove(toParent: self)
        NSLayoutConstraint.activate([
            barController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            barController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            barController.view.topAnchor.constraint(equalTo: view.topAnchor),
            barController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        surface.tabBar = tabBar
        surface.accessoryContent = content
        content.onPlayPause = { [weak self] in
            guard let self, !self.playId.isEmpty else { return }
            self.activate?(self.playId)
        }
        content.onArtwork = { [weak self] in
            guard let self, !self.artworkId.isEmpty else { return }
            self.activate?(self.artworkId)
        }
        content.onTap = { [weak self] in
            guard let self, !self.tapId.isEmpty else { return }
            self.activate?(self.tapId)
        }
        registerForTraitChanges([UITraitTabAccessoryEnvironment.self]) { [weak self] (_: UITraitEnvironment, _: UITraitCollection) in
            self?.applyAccessoryEnvironment()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        applyAccessoryEnvironment()
    }

    func attach(to parent: UIViewController, in container: UIView) {
        loadViewIfNeeded()
        if self.parent !== parent {
            willMove(toParent: nil)
            view.removeFromSuperview()
            removeFromParent()
            parent.addChild(self)
            container.addSubview(view)
            view.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                view.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                view.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                view.topAnchor.constraint(equalTo: container.topAnchor),
                view.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            ])
            didMove(toParent: parent)
        } else if view.superview !== container {
            view.removeFromSuperview()
            container.addSubview(view)
            view.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                view.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                view.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                view.topAnchor.constraint(equalTo: container.topAnchor),
                view.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            ])
        }
        container.bringSubviewToFront(view)
        surface.isHidden = false
        view.isHidden = false
    }

    func detach() {
        pendingExpiryWork?.cancel()
        pendingExpiryWork = nil
        pendingSelection = nil
        artworkLoad?.cancel()
        artworkLoad = nil
        willMove(toParent: nil)
        view.removeFromSuperview()
        removeFromParent()
        barController.tabs = []
        ordinary.removeAll()
        selectedID = ""
        playId = ""
        tapId = ""
        content.reset()
        barController.setBottomAccessory(nil, animated: false)
    }

    func apply(tabBar node: ShellControl, accessory: ShellControl, rendering: ShellRendering) {
        loadViewIfNeeded()
        let items = node.items
        let ids = items.map(\.id)
        for id in Array(ordinary.keys) where !ids.contains(id) { ordinary.removeValue(forKey: id) }
        for item in items {
            let tab = ordinary[item.id] ?? UITab(title: "", image: nil, identifier: item.id) { _ in
                let child = UIViewController()
                child.view.backgroundColor = .clear
                child.view.isUserInteractionEnabled = false
                return child
            }
            tab.accessibilityIdentifier = item.id
            tab.title = item.content.label
            tab.image = rendering.image(item.content)
            tab.isEnabled = !item.content.disabled
            ordinary[item.id] = tab
            if item.content.selected { selectedID = item.id }
        }
        let requested = ids.compactMap { ordinary[$0] }
        if barController.tabs.map(\.identifier) != requested.map(\.identifier) {
            barController.tabs = requested
        }
        for item in items {
            if let nativeItem = ordinary[item.id]?.viewController?.tabBarItem {
                nativeItem.accessibilityLabel = item.content.accessibilityLabel
                ShellTabBar.applyTypography(item.content, to: nativeItem)
                ShellTabBar.applyBadge(item.content.badge, to: nativeItem, rendering: rendering)
            }
        }
        resolveSelection(items)
        playId = accessory.items.first?.id ?? ""
        artworkId = accessory.items.dropFirst().first?.id ?? ""
        tapId = accessory.id
        content.apply(accessory)
        loadArtwork(accessory.artworkUrl)
        barController.setBottomAccessory(UITabAccessory(contentView: content), animated: false)
        applyAccessoryEnvironment()
        surface.accessoryContent = content
        surface.tabBar = tabBar
        surface.isHidden = false
        view.isHidden = false
        overrideUserInterfaceStyle = node.dark ? .dark : .light
        barController.overrideUserInterfaceStyle = overrideUserInterfaceStyle
        view.semanticContentAttribute = node.rtl ? .forceRightToLeft : .forceLeftToRight
        barController.view.semanticContentAttribute = view.semanticContentAttribute
        tabBar.semanticContentAttribute = view.semanticContentAttribute
    }

    func tabBarController(_ tabBarController: UITabBarController, shouldSelectTab tab: UITab) -> Bool {
        guard tab.isEnabled else { return false }
        armPendingSelection(tab.identifier)
        activate?(tab.identifier)
        return true
    }

    private func applyAccessoryEnvironment() {
        content.setInlineLayout(traitCollection.tabAccessoryEnvironment == .inline)
    }

    private func resolveSelection(_ items: [ShellItem]) {
        let fallback = items.first { $0.content.selected }.flatMap { ordinary[$0.id] } ?? ordinary[selectedID]
        guard let pending = pendingSelection else {
            if let fallback, barController.selectedTab !== fallback { barController.selectedTab = fallback }
            return
        }
        let pendingTab = ordinary[pending.id]
        let expired = CFAbsoluteTimeGetCurrent() >= pending.until
        let unavailable = pendingTab == nil || (items.first { $0.id == pending.id }?.content.disabled ?? true)
        if unavailable || expired {
            pendingSelection = nil
            pendingExpiryWork?.cancel()
            pendingExpiryWork = nil
            if let fallback { barController.selectedTab = fallback }
        } else if selectedID == pending.id {
            pendingSelection = nil
            pendingExpiryWork?.cancel()
            pendingExpiryWork = nil
            if let fallback { barController.selectedTab = fallback }
        } else if let pendingTab, barController.selectedTab !== pendingTab {
            barController.selectedTab = pendingTab
        }
    }

    private func armPendingSelection(_ id: String) {
        pendingSelection = ShellTabBar.PendingSelection.start(id)
        pendingExpiryWork?.cancel()
        let delay = max(0, (pendingSelection?.until ?? 0) - CFAbsoluteTimeGetCurrent()) + 0.02
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.pendingExpiryWork = nil
            guard let pending = self.pendingSelection, CFAbsoluteTimeGetCurrent() >= pending.until else { return }
            self.pendingSelection = nil
            if let selected = self.ordinary[self.selectedID], self.barController.selectedTab !== selected {
                self.barController.selectedTab = selected
            }
        }
        pendingExpiryWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func loadArtwork(_ urlString: String?) {
        guard let urlString, !urlString.isEmpty else {
            artworkLoad?.cancel()
            content.currentArtworkUrl = nil
            content.setArtwork(nil)
            return
        }
        if urlString == content.currentArtworkUrl, content.hasArtwork { return }
        content.currentArtworkUrl = urlString
        artworkLoad?.cancel()
        if urlString.hasPrefix("data:image"),
           let comma = urlString.firstIndex(of: ","),
           let data = Data(base64Encoded: String(urlString[urlString.index(after: comma)...])),
           let image = UIImage(data: data) {
            content.setArtwork(image)
            return
        }
        if urlString.hasPrefix("file://"), let url = URL(string: urlString) {
            content.setArtwork(UIImage(contentsOfFile: url.path))
            return
        }
        guard let url = URL(string: urlString) else { return }
        let task = URLSession.shared.dataTask(with: url) { [weak content] data, _, _ in
            let image = data.flatMap { UIImage(data: $0) }
            DispatchQueue.main.async {
                guard content?.currentArtworkUrl == urlString else { return }
                content?.setArtwork(image)
            }
        }
        artworkLoad = task
        task.resume()
    }
}
