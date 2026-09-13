import Capacitor
import UIKit

enum ShellTabBar {
    static let kind = "ion-tab-bar"

    static func make(_ node: JSObject, rendering: ShellRendering, delegate: UITabBarDelegate) -> UITabBar {
        let control = UITabBar()
        control.itemPositioning = .fill
#if DEBUG
        NSLog("[Native UI Shell] Created UITabBar %@", node["id"] as? String ?? "")
#endif
        control.delegate = delegate
        update(control, node: node, rendering: rendering)
        return control
    }

    static func update(_ tabBar: UITabBar, node: JSObject, rendering: ShellRendering) {
        let items = node["items"] as! [JSObject]
        let ids = items.map { $0["id"] as! String }
        // Keep UIKit's item identities and interaction state across DOM selection updates.
        if tabBar.items?.map({ $0.accessibilityIdentifier ?? "" }) != ids {
            tabBar.items = items.map { item in
                let tab = UITabBarItem(title: item["label"] as? String, image: rendering.image(item), tag: 0)
                tab.accessibilityIdentifier = item["id"] as? String
                return tab
            }
        }
        for (tab, item) in zip(tabBar.items!, items) {
            let title = item["label"] as? String
            if tab.title != title { tab.title = title }
            let icon = rendering.image(item)
            if tab.image !== icon { tab.image = icon }
            if tab.selectedImage !== icon { tab.selectedImage = icon }
            tab.isEnabled = item["disabled"] as? Bool != true
            tab.accessibilityLabel = item["accessibilityLabel"] as? String
            let badge = item["badge"] as? String
            tab.badgeValue = badge?.isEmpty == false ? badge : nil
        }
        let selected = items.firstIndex { $0["selected"] as? Bool == true }
        let selectedItem = selected.map { tabBar.items![$0] }
        if tabBar.selectedItem !== selectedItem { tabBar.selectedItem = selectedItem }
        tabBar.semanticContentAttribute = node["rtl"] as? Bool == true ? .forceRightToLeft : .forceLeftToRight
        tabBar.accessibilityIdentifier = node["id"] as? String
    }

    static func fit(_ tabBar: UITabBar, node: JSObject, bounds: CGRect) -> Bool {
        let fitted = tabBar.sizeThatFits(bounds.size)
        var size = CGSize(width: tabBar.bounds.width > 0 ? tabBar.bounds.width : bounds.width,
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
        // Some UIKit layouts cap the platter width (notably on iPad).
        // Keep the original Web bar instead of changing its item widths.
        guard abs(content.width - bounds.width) <= 1 else {
            return false
        }
        let anchor = node["tabBarAnchor"] as? JSObject
        let x = anchor?["x"] as? Double ?? 0
        let y = anchor?["y"] as? Double ?? 0
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
