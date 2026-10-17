import UIKit

private final class ShellSegmentElement: UIAccessibilityElement {
    var activate: (() -> Bool)?
    override func accessibilityActivate() -> Bool { activate?() ?? false }
}

final class ShellSegment: UISegmentedControl {
    static let kind = ShellComponent.segment
    var labels: [String] = []
    private var items: [ShellItem] = []
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
        guard !node.items.isEmpty else { return nil }
        let control = ShellSegment(items: [])
        control.isAccessibilityElement = false
        control.apportionsSegmentWidthsByContent = false
        control.update(node, scale: scale, rendering: rendering)
        control.addAction(UIAction { [weak control] _ in
            guard let control, control.items.indices.contains(control.selectedSegmentIndex) else { return }
            activate(control.items[control.selectedSegmentIndex].id)
        }, for: .valueChanged)
        return control
    }

    @available(iOS 26.0, *)
    func update(_ node: ShellControl, scale: CGFloat, rendering: ShellRendering) {
        let previous = items
        let rebuilt = previous.map(\.id) != node.items.map(\.id)
        if rebuilt {
            removeAllSegments()
            for index in node.items.indices { insertSegment(withTitle: "", at: index, animated: false) }
        }
        if let first = node.items.first, previous.first?.content.fontSize != first.content.fontSize {
            setTitleTextAttributes([.font: UIFont.systemFont(ofSize: first.content.fontSize, weight: .medium)], for: .normal)
        }
        let direction: UISemanticContentAttribute = node.rtl ? .forceRightToLeft : .forceLeftToRight
        if semanticContentAttribute != direction { semanticContentAttribute = direction }
        // Ionic button frames exclude their margins. Distribute the full track
        // width so UIKit's fixed segment widths do not shrink the projected track.
        let totalItemWidth = node.items.reduce(0.0) { $0 + $1.frame.width }
        let widthScale = totalItemWidth > 0 ? node.frame.width / totalItemWidth * scale : scale
        for (index, item) in node.items.enumerated() {
            let old = rebuilt ? nil : previous[index].content
            let content = item.content
            if old?.label != content.label || old?.icon != content.icon ||
                old?.iconWidth != content.iconWidth || old?.iconHeight != content.iconHeight ||
                old?.iconTemplate != content.iconTemplate || old?.color != content.color {
                let image = rendering.image(content)
                setImage(image, forSegmentAt: index)
                setTitle(image == nil ? content.label : nil, forSegmentAt: index)
            }
            if isEnabledForSegment(at: index) == content.disabled { setEnabled(!content.disabled, forSegmentAt: index) }
            let width = item.frame.width * widthScale
            if widthForSegment(at: index) != width { setWidth(width, forSegmentAt: index) }
        }
        items = node.items
        labels = items.map { $0.content.accessibilityLabel }
        accessibilityIdentifier = node.id
        let selected = items.firstIndex { $0.content.selected } ?? UISegmentedControl.noSegment
        // A native tap has already selected this index. Reassigning it can interrupt
        // UIKit's in-flight lens animation when the Web selection echoes back.
        if selectedSegmentIndex != selected { selectedSegmentIndex = selected }
        setNeedsLayout()
    }
}
