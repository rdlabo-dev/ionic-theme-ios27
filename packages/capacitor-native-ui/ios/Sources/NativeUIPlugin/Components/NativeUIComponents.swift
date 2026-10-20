import UIKit

// Static composition of supported wire kinds. Component files own their names and rendering.
enum NativeUIComponents {
    static let supported = Set(NativeUIButton.kinds + [NativeUIButtons.kind, NativeUITabBar.kind, NativeUISegment.kind, NativeUIFab.kind])

    @available(iOS 26.0, *)
    static func make(_ node: NativeUIControl, scale: CGFloat, rendering: NativeUIControlRendering,
                     tabDelegate: UITabBarDelegate, activate: @escaping (String) -> Void) -> UIView? {
        switch node.kind {
        case .button, .backButton, .menuButton: return NativeUIButton.make(node, rendering: rendering, activate: activate)
        case .buttons: return NativeUIButtons.make(node, scale: scale, rendering: rendering, activate: activate)
        case .tabBar: return NativeUITabBar.make(node, rendering: rendering, delegate: tabDelegate)
        case .segment: return NativeUISegment.make(node, scale: scale, rendering: rendering, activate: activate)
        case .fab: return NativeUIFab()
        case .extension: return nil // App-local SwiftUI content is hosted by the shell.
        }
    }
}
