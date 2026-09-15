import UIKit
import WebKit

// Verification-only host for reference-shell Components/Shared.
// This path exercises native rendering components only; it does not verify the
// Capacitor bridge, plugin handoff, revision sync, or production runtime.

enum ShellReference {
    static func decodeControls(_ body: Any) -> [ShellControl]? {
        guard JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body),
              let nodes = try? JSONDecoder().decode([ShellControl].self, from: data)
        else { return nil }
        let valid = nodes.filter(\.isValid)
        return valid.count == nodes.count && !valid.isEmpty ? valid : nil
    }

    @available(iOS 26.0, *)
    static func install(_ nodes: [ShellControl], on host: UIView, above web: WKWebView,
                        rendering: ShellRendering, tabDelegate: UITabBarDelegate,
                        activate: @escaping (String) -> Void) -> [UIView] {
        var installed: [UIView] = []
        for node in nodes {
            guard let control = ShellComponents.make(node, scale: 1, rendering: rendering,
                                                    tabDelegate: tabDelegate, activate: activate)
            else { continue }
            let bounds = web.convert(node.frame.rect, to: host)
            host.insertSubview(control, aboveSubview: web)
            if let tabBar = control as? UITabBar {
                guard ShellTabBar.fit(tabBar, node: node, bounds: bounds) else {
                    control.removeFromSuperview()
                    continue
                }
            } else {
                control.frame = bounds
            }
            control.overrideUserInterfaceStyle = node.dark ? .dark : .light
            installed.append(control)
            let escaped = node.id.replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            web.evaluateJavaScript(
                "(() => { const el = document.getElementById('\(escaped)'); if (!el) return;" +
                " el.style.visibility = 'hidden'; el.style.pointerEvents = 'none'; })()")
        }
        return installed
    }
}
