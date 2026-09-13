import Capacitor
import UIKit

private final class ShellSegmentElement: UIAccessibilityElement {
    var activate: (() -> Bool)?
    override func accessibilityActivate() -> Bool { activate?() ?? false }
}

final class ShellSegment: UISegmentedControl {
    static let kind = "ion-segment"
    var labels: [String] = []
    override func layoutSubviews() {
        super.layoutSubviews()
        let total = (0..<numberOfSegments).reduce(CGFloat.zero) { $0 + widthForSegment(at: $1) }
        var x: CGFloat = 0
        accessibilityElements = (0..<numberOfSegments).map { index in
            let width = total > 0 ? bounds.width * widthForSegment(at: index) / total : bounds.width / CGFloat(numberOfSegments)
            let element = ShellSegmentElement(accessibilityContainer: self)
            element.accessibilityLabel = labels[index]
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
    static func make(_ node: JSObject, scale: CGFloat, rendering: ShellRendering, activate: @escaping (String) -> Void) -> UISegmentedControl {
        let items = node["items"] as! [JSObject]
        let rtl = node["rtl"] as? Bool == true
        let control = ShellSegment(items: items.map { rendering.image($0) as Any? ?? ($0["label"] as? String ?? "") })
        control.labels = items.map { $0["accessibilityLabel"] as? String ?? "" }
        control.isAccessibilityElement = false
        control.setTitleTextAttributes([.font: UIFont.systemFont(ofSize: items[0]["fontSize"] as? Double ?? 15, weight: .medium)], for: .normal)
        control.semanticContentAttribute = rtl ? .forceRightToLeft : .forceLeftToRight
        control.apportionsSegmentWidthsByContent = false
        for (index, item) in items.enumerated() {
            control.setEnabled(item["disabled"] as? Bool != true, forSegmentAt: index)
            control.setWidth((item["width"] as? Double ?? 0) * scale, forSegmentAt: index)
            if item["selected"] as? Bool == true { control.selectedSegmentIndex = index }
        }
        control.accessibilityIdentifier = node["id"] as? String
        control.addAction(UIAction { [weak control] _ in
            guard let control, items.indices.contains(control.selectedSegmentIndex) else { return }
            activate(items[control.selectedSegmentIndex]["id"] as! String)
        }, for: .valueChanged)
        return control
    }
}
