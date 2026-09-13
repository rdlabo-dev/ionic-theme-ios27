import Capacitor
import UIKit

final class ShellFab: UIView {
    static let kind = "ion-fab"
    var buttons: [String: UIButton] = [:]
    var content: [String: NSDictionary] = [:]
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }

    @available(iOS 26.0, *)
    func apply(_ node: JSObject, scale: CGFloat, rendering: ShellRendering, activate: @escaping (String) -> Void) {
        let items = node["items"] as! [JSObject]
        let retained = Set(items.map { $0["id"] as! String })
        var lostFocus = false
        for id in Array(self.buttons.keys) where !retained.contains(id) {
            lostFocus = lostFocus || self.buttons[id]?.accessibilityElementIsFocused() == true
            self.buttons.removeValue(forKey: id)?.removeFromSuperview()
            self.content.removeValue(forKey: id)
        }
        self.accessibilityIdentifier = node["id"] as? String
        for item in items {
            let id = item["id"] as! String
            var artwork = item.filter { !["x", "y", "width", "height", "visible"].contains($0.key) }
            if item["selected"] as? Bool == true {
                artwork["icon"] = item["closeIcon"]
                artwork["iconWidth"] = item["closeIconWidth"]
                artwork["iconHeight"] = item["closeIconHeight"]
                artwork["label"] = ""
            }
            let previous = self.buttons[id]
            let button = previous ?? ShellButton.render(artwork, glass: true, rendering: rendering, activate: activate)
            if previous == nil {
                self.buttons[id] = button
                self.addSubview(button)
#if DEBUG
                NSLog("[Native UI Shell] Created FAB button %@ %p", id, unsafeBitCast(button, to: Int.self))
#endif
            } else if self.content[id] != artwork as NSDictionary {
                let changedIcon = self.content[id]?["selected"] as? Bool != item["selected"] as? Bool
                let duration = UIAccessibility.isReduceMotionEnabled ? 0 : min(item["iconTransition"] as? Double ?? 0, 1)
                if changedIcon, let imageView = button.imageView, duration > 0 {
                    UIView.transition(with: imageView, duration: duration,
                                      options: [.transitionCrossDissolve, .beginFromCurrentState, .allowUserInteraction]) {
                        _ = ShellButton.render(artwork, glass: true, existing: button, rendering: rendering, activate: activate)
                    }
                } else {
                    UIView.performWithoutAnimation { _ = ShellButton.render(artwork, glass: true, existing: button, rendering: rendering, activate: activate) }
                }
            }
            self.content[id] = artwork as NSDictionary
            button.accessibilityTraits.remove(.selected)
            if id == items.first?["id"] as? String && items.count > 1 {
                button.accessibilityValue = item["selected"] as? Bool == true
                    ? NSLocalizedString("Expanded", comment: "FAB accessibility state")
                    : NSLocalizedString("Collapsed", comment: "FAB accessibility state")
            } else {
                button.accessibilityValue = nil
            }
            let hidden = item["visible"] as? Bool == false
            if hidden && !button.isHidden && button.accessibilityElementIsFocused() { lostFocus = true }
            button.isHidden = hidden
            button.isUserInteractionEnabled = button.isEnabled && !hidden
            button.semanticContentAttribute = node["rtl"] as? Bool == true ? .forceRightToLeft : .forceLeftToRight
            let rect = shellRect(item)!
            let frame = CGRect(x: rect.minX * scale, y: rect.minY * scale, width: rect.width * scale, height: rect.height * scale)
            if button.frame != frame { button.frame = frame }
        }
        let ordered = items.compactMap { self.buttons[$0["id"] as! String] }.filter { !$0.isHidden }
        self.accessibilityElements = ordered
        if lostFocus, let main = ordered.first, main.isEnabled, self.window != nil {
            UIAccessibility.post(notification: .layoutChanged, argument: main)
        }
    }
}
