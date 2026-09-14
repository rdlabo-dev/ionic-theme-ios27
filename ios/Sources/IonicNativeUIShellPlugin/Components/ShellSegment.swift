import UIKit

private final class ShellSegmentElement: UIAccessibilityElement {
    var activate: (() -> Bool)?
    override func accessibilityActivate() -> Bool { activate?() ?? false }
}

final class ShellSegment: UISegmentedControl {
    static let kind = ShellComponent.segment
    var labels: [String] = []
    override func layoutSubviews() {
        super.layoutSubviews()
        let total = (0..<numberOfSegments).reduce(CGFloat.zero) { $0 + widthForSegment(at: $1) }
        var x: CGFloat = 0
        accessibilityElements = labels.prefix(numberOfSegments).enumerated().map { index, label in
            let width = total > 0 ? bounds.width * widthForSegment(at: index) / total : bounds.width / CGFloat(numberOfSegments)
            let element = ShellSegmentElement(accessibilityContainer: self)
            element.accessibilityLabel = label
            element.accessibilityTraits = [.button]
            if index == selectedSegmentIndex { element.accessibilityTraits.insert(.selected) }
            if !isEnabledForSegment(at: index) { element.accessibilityTraits.insert(.notEnabled) }
            let origin = effectiveUserInterfaceLayoutDirection == .rightToLeft ? bounds.width - x - width : x
            element.accessibilityFrameInContainerSpace = CGRect(x: origin, y: 0, width: width, height: bounds.height)
            element.activate = { [weak self] in
                guard let self, self.isEnabledForSegment(at: index) else { return false }
                self.selectedSegmentIndex = index
                self.sendActions(for: .valueChanged)
                self.setNeedsLayout()
                return true
            }
            x += width
            return element
        }
    }

    @available(iOS 26.0, *)
    static func make(_ node: ShellControl, scale: CGFloat, rendering: ShellRendering, activate: @escaping (String) -> Void) -> UISegmentedControl? {
        let items = node.items
        guard let firstItem = items.first else { return nil }
        let rtl = node.rtl
        let control = ShellSegment(items: items.map { rendering.image($0.content) as Any? ?? $0.content.label })
        control.labels = items.map { $0.content.accessibilityLabel }
        control.isAccessibilityElement = false
        control.setTitleTextAttributes([.font: UIFont.systemFont(ofSize: firstItem.content.fontSize, weight: .medium)], for: .normal)
        control.semanticContentAttribute = rtl ? .forceRightToLeft : .forceLeftToRight
        control.apportionsSegmentWidthsByContent = false
        for (index, item) in items.enumerated() {
            control.setEnabled(!item.content.disabled, forSegmentAt: index)
            control.setWidth(item.frame.width * scale, forSegmentAt: index)
            if item.content.selected { control.selectedSegmentIndex = index }
        }
        control.accessibilityIdentifier = node.id
        control.addAction(UIAction { [weak control] _ in
            guard let control, items.indices.contains(control.selectedSegmentIndex) else { return }
            activate(items[control.selectedSegmentIndex].id)
        }, for: .valueChanged)
        return control
    }
}
