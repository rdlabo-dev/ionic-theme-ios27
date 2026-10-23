import UIKit

/// A toolbar shares the page animation's clock, including interactive reversal.
/// Existing glass surfaces survive; only their content and geometry interpolate.
@MainActor
final class NativeUIToolbarTransition {
    let id: Int
    let controlIds: Set<String>
    private var updates: [(CGFloat) -> Void] = []
    private var restorations: [() -> Void] = []
    private(set) var progress: CGFloat = 0

    @available(iOS 26.0, *)
    init(_ transition: NativeUIToolbarTransitionSnapshot, sources: [NativeUIControl], controls: [String: UIView],
         scale: CGFloat, origin: CGPoint, rendering: NativeUIControlRendering) {
        id = transition.id
        controlIds = Set(transition.sourceIds + transition.destination.map(\.id))
        let outgoing = sources.filter { transition.sourceIds.contains($0.id) }
        var remaining = transition.destination
        func bounds(_ node: NativeUIControl) -> CGRect {
            CGRect(x: origin.x + node.frame.x * scale, y: origin.y + node.frame.y * scale,
                   width: node.frame.width * scale, height: node.frame.height * scale)
        }
        for source in outgoing {
            guard let view = controls[source.id] else { continue }
            let match = remaining.firstIndex { $0.transitionId != nil && $0.transitionId == source.transitionId }
            guard let match else {
                // A removed surface exits in place instead of switching to the
                // moving Web page. Keep the same clock so cancellation reverses it.
                let alpha = view.alpha
                let interactive = view.isUserInteractionEnabled
                view.isUserInteractionEnabled = false
                updates.append { value in view.alpha = alpha * (1 - value) }
                restorations.append {
                    view.alpha = alpha
                    view.isUserInteractionEnabled = interactive
                }
                continue
            }
            let destination = remaining.remove(at: match)
            let originalFrame = view.frame
            let sourceGlass = source.kind == .buttons || source.items.first?.content.buttonFill != .clear
            let targetGlass = destination.kind == .buttons || destination.items.first?.content.buttonFill != .clear
            let container: UIView
            if let button = view as? UIButton {
                let configuration = button.configuration
                var empty = configuration
                empty?.title = nil
                empty?.image = nil
                button.configuration = empty
                let sourceConfiguration = empty
                let targetConfiguration: UIButton.Configuration = targetGlass ? .glass() : .plain()
                var showingDestination = false
                updates.append { value in
                    guard sourceGlass != targetGlass, showingDestination != (value > 0) else { return }
                    showingDestination = value > 0
                    button.configuration = showingDestination ? targetConfiguration : sourceConfiguration
                }
                let labels = button.subviews.filter { $0 is UILabel }.map { ($0, $0.isHidden) }
                labels.forEach { $0.0.isHidden = true }
                restorations.append { labels.forEach { $0.0.isHidden = $0.1 } }
                container = button
                restorations.append { button.configuration = configuration }
            } else if let glass = view as? UIVisualEffectView {
                container = glass.contentView
                let originalEffect = glass.effect
                var showingDestination = false
                updates.append { value in
                    guard sourceGlass != targetGlass, showingDestination != (value > 0) else { return }
                    showingDestination = value > 0
                    glass.effect = showingDestination && !targetGlass ? nil : originalEffect
                }
                restorations.append { glass.effect = originalEffect }
                let children = container.subviews.map { ($0, $0.isHidden) }
                children.forEach { $0.0.isHidden = true }
                restorations.append { children.forEach { $0.0.isHidden = $0.1 } }
            } else { continue }
            let from = bounds(source), to = bounds(destination)
            updates.append { value in
                view.frame = Self.interpolate(from, to, value)
                if view is UIVisualEffectView { view.layer.cornerRadius = view.bounds.height / 2 }
            }
            restorations.append { view.frame = originalFrame }
            var targetItems = destination.items
            for item in source.items {
                let index = targetItems.firstIndex { $0.content.transitionId != nil && $0.content.transitionId == item.content.transitionId }
                let target = index.map { targetItems.remove(at: $0) }
                addContent(item, target, to: container, fromSurface: from, toSurface: to, scale: scale, rtl: destination.rtl, rendering: rendering)
            }
            for item in targetItems { addContent(nil, item, to: container, fromSurface: from, toSurface: to, scale: scale, rtl: destination.rtl, rendering: rendering) }
        }
        // New destinations use their final native view from the first frame through
        // commit. The normal control update reuses it when the page takes ownership.
        for destination in remaining {
            guard let view = controls[destination.id] else { continue }
            let originalAlpha = view.alpha
            let originalTransform = view.transform
            let interactive = view.isUserInteractionEnabled
            view.isUserInteractionEnabled = false
            updates.append { value in
                view.alpha = originalAlpha * value
                view.transform = originalTransform.scaledBy(x: max(0.001, value), y: max(0.001, value))
            }
            restorations.append {
                view.alpha = originalAlpha
                view.transform = originalTransform
                view.isUserInteractionEnabled = interactive
            }
        }
        setProgress(0)
    }

    @available(iOS 26.0, *)
    private func addContent(_ source: NativeUIItem?, _ destination: NativeUIItem?, to host: UIView,
                            fromSurface: CGRect, toSurface: CGRect, scale: CGFloat, rtl: Bool, rendering: NativeUIControlRendering) {
        var from = (source ?? destination)!.frame.rect.applying(CGAffineTransform(scaleX: scale, y: scale))
        var to = (destination ?? source)!.frame.rect.applying(CGAffineTransform(scaleX: scale, y: scale))
        // Preserve window position where possible. When a numbered surface moves
        // past another action, grow/shrink its extra items from inside that surface.
        func contained(_ rect: CGRect, in size: CGSize) -> CGRect {
            let halfWidth = min(rect.width, size.width) / 2
            let halfHeight = min(rect.height, size.height) / 2
            let center = CGPoint(x: min(max(rect.midX, halfWidth), size.width - halfWidth),
                                 y: min(max(rect.midY, halfHeight), size.height - halfHeight))
            return CGRect(x: center.x - rect.width / 2, y: center.y - rect.height / 2, width: rect.width, height: rect.height)
        }
        if source == nil {
            from = contained(to.offsetBy(dx: toSurface.minX - fromSurface.minX, dy: toSurface.minY - fromSurface.minY), in: fromSurface.size)
        }
        if destination == nil {
            to = contained(from.offsetBy(dx: fromSurface.minX - toSurface.minX, dy: fromSurface.minY - toSurface.minY), in: toSurface.size)
        }
        let unchanged = source.map { from in destination.map { to in
            let a = from.content, b = to.content
            return a.label == b.label && a.icon == b.icon && a.iconWidth == b.iconWidth && a.iconHeight == b.iconHeight &&
                a.fontSize == b.fontSize && a.fontWeight == b.fontWeight && a.color == b.color && a.badge == b.badge &&
                a.disabled == b.disabled && a.selected == b.selected && a.iconPosition == b.iconPosition &&
                a.imagePadding == b.imagePadding && a.contentInsetLeading == b.contentInsetLeading &&
                a.contentInsetTrailing == b.contentInsetTrailing && a.iconTemplate == b.iconTemplate
        } ?? false } ?? false
        for (item, incoming) in [(source, false), (unchanged ? nil : destination, true)] {
            guard let item else { continue }
            let content = NativeUIButton.render(item.content, glass: false, rendering: rendering, activate: { _ in })
            content.semanticContentAttribute = rtl ? .forceRightToLeft : .forceLeftToRight
            content.isUserInteractionEnabled = false
            content.accessibilityElementsHidden = true
            host.addSubview(content)
            updates.append { value in
                let position = Self.interpolate(from, to, value)
                // Native matched items keep their own text width while their centres move.
                // Resizing both labels would truncate the destination until the transition ends.
                content.bounds = CGRect(origin: .zero, size: (incoming ? to : from).size)
                content.center = CGPoint(x: position.midX, y: position.midY)
                // Matched native toolbar content adopts the destination as playback starts.
                // Crossfading both glyphs superimposes Menu/Back and old/new titles.
                if source == nil || destination == nil {
                    // New/removed native items grow/shrink within the changing shared surface.
                    let amount = incoming ? value : 1 - value
                    content.transform = CGAffineTransform(scaleX: max(0.001, amount), y: max(0.001, amount))
                    content.alpha = amount > 0 ? 1 : 0
                } else {
                    content.alpha = unchanged ? 1 : incoming ? (value > 0 ? 1 : 0) : (value == 0 ? 1 : 0)
                }
            }
            restorations.append { content.removeFromSuperview() }
        }
    }

    static func interpolate(_ from: CGRect, _ to: CGRect, _ value: CGFloat) -> CGRect {
        CGRect(x: from.minX + (to.minX - from.minX) * value, y: from.minY + (to.minY - from.minY) * value,
               width: from.width + (to.width - from.width) * value, height: from.height + (to.height - from.height) * value)
    }

    func setProgress(_ value: CGFloat) {
        progress = min(1, max(0, value))
        UIView.performWithoutAnimation { updates.forEach { $0(progress) } }
    }

    func restore() {
        UIView.performWithoutAnimation { restorations.reversed().forEach { $0() } }
        restorations.removeAll()
        updates.removeAll()
    }
}
