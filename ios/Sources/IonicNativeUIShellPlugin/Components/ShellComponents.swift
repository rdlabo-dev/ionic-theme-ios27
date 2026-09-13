import Capacitor
import UIKit

// Static composition of supported wire kinds. Component files own their names and rendering.
enum ShellComponents {
    static let supported = Set(ShellButton.kinds + [ShellButtons.kind, ShellTabBar.kind, ShellSegment.kind, ShellFab.kind])

    @available(iOS 26.0, *)
    static func make(_ node: JSObject, scale: CGFloat, rendering: ShellRendering,
                     tabDelegate: UITabBarDelegate, activate: @escaping (String) -> Void) -> UIView? {
        let kind = node["kind"] as! String
        if ShellButton.kinds.contains(kind) { return ShellButton.make(node, rendering: rendering, activate: activate) }
        switch kind {
        case ShellButtons.kind: return ShellButtons.make(node, scale: scale, rendering: rendering, activate: activate)
        case ShellTabBar.kind: return ShellTabBar.make(node, rendering: rendering, delegate: tabDelegate)
        case ShellSegment.kind: return ShellSegment.make(node, scale: scale, rendering: rendering, activate: activate)
        case ShellFab.kind: return ShellFab()
        default: return nil
        }
    }
}
