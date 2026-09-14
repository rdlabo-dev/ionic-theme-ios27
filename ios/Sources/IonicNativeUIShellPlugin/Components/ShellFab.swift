import UIKit

final class ShellFab: UIView {
    static let kind = ShellComponent.fab
    var buttons: [String: UIButton] = [:]
    var content: [String: ShellItemContent] = [:]
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }

    @available(iOS 26.0, *)
    func apply(_ node: ShellControl, scale: CGFloat, rendering: ShellRendering, activate: @escaping (String) -> Void) {
        let items = node.items
        let retained = Set(items.map(\.id))
        var lostFocus = false
        for id in Array(self.buttons.keys) where !retained.contains(id) {
            lostFocus = lostFocus || self.buttons[id]?.accessibilityElementIsFocused() == true
            self.buttons.removeValue(forKey: id)?.removeFromSuperview()
            self.content.removeValue(forKey: id)
        }
        self.accessibilityIdentifier = node.id
        for item in items {
            let id = item.id
            let artwork = item.content.fabArtwork
            let previous = self.buttons[id]
            let button = previous ?? ShellButton.render(artwork, glass: true, rendering: rendering, activate: activate)
            if previous == nil {
                self.buttons[id] = button
                self.addSubview(button)
#if DEBUG
                NSLog("[Native UI Shell] Created FAB button %@ %p", id, unsafeBitCast(button, to: Int.self))
#endif
            } else if self.content[id] != artwork {
                let changedIcon = self.content[id]?.selected != item.content.selected
                let duration = UIAccessibility.isReduceMotionEnabled ? 0 : min(item.content.iconTransition ?? 0, 1)
                if changedIcon, let imageView = button.imageView, duration > 0 {
                    UIView.transition(with: imageView, duration: duration,
                                      options: [.transitionCrossDissolve, .beginFromCurrentState, .allowUserInteraction]) {
                        _ = ShellButton.render(artwork, glass: true, existing: button, rendering: rendering, activate: activate)
                    }
                } else {
                    UIView.performWithoutAnimation { _ = ShellButton.render(artwork, glass: true, existing: button, rendering: rendering, activate: activate) }
                }
            }
            self.content[id] = artwork
            button.accessibilityTraits.remove(.selected)
            if id == items.first?.id && items.count > 1 {
                button.accessibilityValue = item.content.selected
                    ? NSLocalizedString("Expanded", comment: "FAB accessibility state")
                    : NSLocalizedString("Collapsed", comment: "FAB accessibility state")
            } else {
                button.accessibilityValue = nil
            }
            let hidden = item.visible == false
            if hidden && !button.isHidden && button.accessibilityElementIsFocused() { lostFocus = true }
            button.isHidden = hidden
            button.isUserInteractionEnabled = button.isEnabled && !hidden
            button.semanticContentAttribute = node.rtl ? .forceRightToLeft : .forceLeftToRight
            let rect = item.frame.rect
            let frame = CGRect(x: rect.minX * scale, y: rect.minY * scale, width: rect.width * scale, height: rect.height * scale)
            if button.frame != frame { button.frame = frame }
        }
        let ordered = items.compactMap { self.buttons[$0.id] }.filter { !$0.isHidden }
        self.accessibilityElements = ordered
        if lostFocus, let main = ordered.first, main.isEnabled, self.window != nil {
            UIAccessibility.post(notification: .layoutChanged, argument: main)
        }
    }
}

extension ShellItemContent {
    var fabArtwork: Self {
        var artwork = self
        if selected {
            artwork.icon = closeIcon
            artwork.iconWidth = closeIconWidth
            artwork.iconHeight = closeIconHeight
            artwork.label = ""
        }
        return artwork
    }
}
