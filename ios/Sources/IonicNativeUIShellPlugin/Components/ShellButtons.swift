import Capacitor
import UIKit

enum ShellButtons {
    static let kind = "ion-buttons"

    @available(iOS 26.0, *)
    static func make(_ node: JSObject, scale: CGFloat, rendering: ShellRendering, activate: @escaping (String) -> Void) -> UIView {
        let items = node["items"] as! [JSObject]
        let rtl = node["rtl"] as? Bool == true
        let effect = UIGlassEffect(style: .regular)
        let control = UIVisualEffectView(effect: effect)
        control.layer.cornerRadius = (node["height"] as? Double ?? 48) * scale / 2
        control.clipsToBounds = true
        control.accessibilityIdentifier = node["id"] as? String
        for item in items {
            let button = ShellButton.render(item, glass: false, rendering: rendering, activate: activate)
            button.semanticContentAttribute = rtl ? .forceRightToLeft : .forceLeftToRight
            let rect = shellRect(item)!
            button.frame = CGRect(x: rect.minX * scale, y: rect.minY * scale, width: rect.width * scale, height: rect.height * scale)
            control.contentView.addSubview(button)
        }
        return control
    }
}
