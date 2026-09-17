import UIKit

enum ShellTabBar {
    struct Anchor: Decodable, Equatable {
        let x: Double
        let y: Double
        var isValid: Bool { [0, 0.5, 1].contains(x) && [0, 1].contains(y) }
    }

    /// Optimistic tab selection until the Web selected state catches up (or times out).
    struct PendingSelection: Equatable {
        var id: String
        var until: CFAbsoluteTime
        static func start(_ id: String, ttl: CFTimeInterval = 1) -> PendingSelection {
            PendingSelection(id: id, until: CFAbsoluteTimeGetCurrent() + ttl)
        }
    }

    static let kind = ShellComponent.tabBar

    static func make(_ node: ShellControl, rendering: ShellRendering, delegate: UITabBarDelegate) -> UITabBar {
        let control = UITabBar()
        configureLayout(control)
#if DEBUG
        NSLog("[Native UI Shell] Created UITabBar %@", node.id)
#endif
        control.delegate = delegate
        update(control, node: node, rendering: rendering)
        return control
    }

    static func configureLayout(_ tabBar: UITabBar) {
        // The reader accepts icon-top tabs. Keep that layout local to the native
        // bar instead of letting the iPad idiom turn it into inline items.
        if #available(iOS 17.0, *) {
            tabBar.traitOverrides.horizontalSizeClass = .compact
            tabBar.traitOverrides.verticalSizeClass = .regular
        }
        tabBar.itemPositioning = .fill
    }

    static func update(_ tabBar: UITabBar, node: ShellControl, rendering: ShellRendering) {
        var pending: PendingSelection?
        update(tabBar, node: node, rendering: rendering, pendingSelection: &pending)
    }

    static func update(_ tabBar: UITabBar, node: ShellControl, rendering: ShellRendering,
                       pendingSelection: inout PendingSelection?) {
        let items = node.items
        let ids = items.map(\.id)
        // Keep UIKit's item identities and interaction state across DOM selection updates.
        if tabBar.items?.map({ $0.accessibilityIdentifier ?? "" }) != ids {
            tabBar.items = items.map { item in
                let tab = UITabBarItem(title: item.content.label, image: rendering.image(item.content), tag: 0)
                tab.accessibilityIdentifier = item.id
                return tab
            }
        }
        let nativeItems = tabBar.items ?? []
        for (tab, item) in zip(nativeItems, items) {
            let title = item.content.label
            if tab.title != title { tab.title = title }
            let icon = rendering.image(item.content)
            if tab.image !== icon { tab.image = icon }
            if tab.selectedImage !== icon { tab.selectedImage = icon }
            tab.isEnabled = !item.content.disabled
            tab.accessibilityLabel = item.content.accessibilityLabel
            applyTypography(item.content, to: tab)
            applyBadge(item.content.badge, to: tab, rendering: rendering)
        }
        let domSelected = zip(nativeItems, items).first { $0.1.content.selected }
        let selectedItem = domSelected?.0
        if let pending = pendingSelection {
            let pendingItem = zip(nativeItems, items).first { $0.1.id == pending.id }
            let expired = CFAbsoluteTimeGetCurrent() >= pending.until
            let unavailable = pendingItem == nil || pendingItem!.1.content.disabled
            if unavailable || expired {
                // Ionic rejected the tap, the item vanished, or the echo timed out.
                pendingSelection = nil
                if tabBar.selectedItem !== selectedItem { tabBar.selectedItem = selectedItem }
            } else if domSelected?.1.id == pending.id {
                pendingSelection = nil
                if tabBar.selectedItem !== selectedItem { tabBar.selectedItem = selectedItem }
            } else if tabBar.selectedItem !== pendingItem!.0 {
                // Keep the optimistic native selection until the Web selected state catches up.
                tabBar.selectedItem = pendingItem!.0
            }
        } else if tabBar.selectedItem !== selectedItem {
            tabBar.selectedItem = selectedItem
        }
        tabBar.semanticContentAttribute = node.rtl ? .forceRightToLeft : .forceLeftToRight
        tabBar.accessibilityIdentifier = node.id
    }

    static func applyTypography(_ content: ShellItemContent, to item: UITabBarItem) {
        let weight: UIFont.Weight
        switch content.fontWeight {
        case ..<150: weight = .ultraLight
        case ..<250: weight = .thin
        case ..<350: weight = .light
        case ..<450: weight = .regular
        case ..<550: weight = .medium
        case ..<650: weight = .semibold
        case ..<750: weight = .bold
        case ..<850: weight = .heavy
        default: weight = .black
        }
        let font = UIFont.systemFont(ofSize: content.fontSize, weight: weight)
        for state in [UIControl.State.normal, .selected] {
            if item.titleTextAttributes(for: state)?[.font] as? UIFont != font {
                item.setTitleTextAttributes([.font: font], for: state)
            }
        }
    }

    static func applyBadge(_ badge: ShellBadge?, to item: UITabBarItem, rendering: ShellRendering) {
        // nil removes a badge; an empty string keeps the native notification dot.
        item.badgeValue = badge?.value
        item.accessibilityValue = badge?.value
        item.badgeColor = badge.map { rendering.color($0.color) }
        let attributes = badge.map { [NSAttributedString.Key.foregroundColor: rendering.color($0.textColor)] }
        item.setBadgeTextAttributes(attributes, for: .normal)
        item.setBadgeTextAttributes(attributes, for: .selected)
    }

    static func fit(_ tabBar: UITabBar, node: ShellControl, bounds: CGRect) -> Bool {
        // Place a new bar before asking UIKit for its safe-area-dependent size.
        // Measuring at the initial zero frame makes a restored iPad bar 5pt shorter.
        if tabBar.bounds.isEmpty {
            tabBar.frame = bounds
            tabBar.layoutIfNeeded()
        }
        let fitted = tabBar.sizeThatFits(bounds.size)
        var size = CGSize(width: bounds.width,
                          height: max(bounds.height, fitted.height))
        if tabBar.bounds.size != size { tabBar.bounds.size = size }
        tabBar.layoutIfNeeded()
        // UIKit's tab content occupies only part of UITabBar's outer frame.
        // Align that content to ion-tab-bar, whose CSS already owns placement.
        guard var content = contentFrame(tabBar) else {
            return false
        }
        // Reserve ion-tab-bar's width for the tab content, excluding UIKit's outer gutters.
        // UIKit can cap the content width for a small number of items.
        // Do not keep expanding the outer frame beyond its natural size.
        size.width = min(bounds.width + tabBar.bounds.width - content.width,
                         max(bounds.width, fitted.width))
        if abs(tabBar.bounds.width - size.width) > 0.1 {
            tabBar.bounds.size = size
            tabBar.layoutIfNeeded()
            guard let measured = contentFrame(tabBar) else {
                return false
            }
            content = measured
        }
        // UIKit owns the adaptive platter size, including changes after badge/title updates.
        // Preserve the DOM placement anchor instead of requiring identical item widths.
        let anchor = node.tabBarAnchor
        let x = anchor?.x ?? 0
        let y = anchor?.y ?? 0
        let center = CGPoint(x: bounds.minX + (bounds.width - content.width) * x - content.minX + size.width / 2,
                             y: bounds.minY + (bounds.height - content.height) * y - content.minY + size.height / 2)
        if tabBar.center != center { tabBar.center = center }
        return true
    }

    private static func contentFrame(_ tabBar: UITabBar) -> CGRect? {
        func containsControl(_ view: UIView) -> Bool {
            view is UIControl || view.subviews.contains(where: containsControl)
        }
        return tabBar.subviews
            .filter { !$0.isHidden && $0.alpha > 0 && containsControl($0) }
            .map { $0.frame }
            .filter { !$0.isEmpty }
            .reduce(nil) { (result: CGRect?, frame) in result.map { $0.union(frame) } ?? frame }
    }
}
