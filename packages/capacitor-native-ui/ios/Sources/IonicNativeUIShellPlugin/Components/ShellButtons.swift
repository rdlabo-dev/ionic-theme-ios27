import UIKit

enum ShellButtons {
    static let kind = ShellComponent.buttons

    @available(iOS 26.0, *)
    static func make(_ node: ShellControl, scale: CGFloat, rendering: ShellRendering, activate: @escaping (String) -> Void) -> UIView {
        let items = node.items
        let rtl = node.rtl
        let effect = UIGlassEffect(style: .regular)
        let control = UIVisualEffectView(effect: effect)
        control.layer.cornerRadius = node.frame.height * scale / 2
        control.clipsToBounds = true
        control.accessibilityIdentifier = node.id
        for item in items {
            let button = ShellButton.render(item.content, glass: false, rendering: rendering, activate: activate)
            button.semanticContentAttribute = rtl ? .forceRightToLeft : .forceLeftToRight
            let rect = item.frame.rect
            button.frame = CGRect(x: rect.minX * scale, y: rect.minY * scale, width: rect.width * scale, height: rect.height * scale)
            control.contentView.addSubview(button)
        }
        return control
    }
}
