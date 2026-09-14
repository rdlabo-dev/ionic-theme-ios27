import UIKit

// Static composition of supported wire kinds. Component files own their names and rendering.
enum ShellComponents {
    static let supported = Set(ShellButton.kinds + [ShellButtons.kind, ShellTabBar.kind, ShellSegment.kind, ShellFab.kind])

    @available(iOS 26.0, *)
    static func make(_ node: ShellControl, scale: CGFloat, rendering: ShellRendering,
                     tabDelegate: UITabBarDelegate, activate: @escaping (String) -> Void) -> UIView? {
        switch node.kind {
        case .button, .backButton, .menuButton: return ShellButton.make(node, rendering: rendering, activate: activate)
        case .buttons: return ShellButtons.make(node, scale: scale, rendering: rendering, activate: activate)
        case .tabBar: return ShellTabBar.make(node, rendering: rendering, delegate: tabDelegate)
        case .segment: return ShellSegment.make(node, scale: scale, rendering: rendering, activate: activate)
        case .fab: return ShellFab()
        }
    }
}
