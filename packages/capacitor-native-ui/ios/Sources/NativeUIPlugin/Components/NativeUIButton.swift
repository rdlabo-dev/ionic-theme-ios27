import UIKit

enum NativeUIButton {
    private final class BadgeLabel: UILabel {}
    private static let activationID = UIAction.Identifier("native-ui-activate")

    /// Reuse an unambiguous presentation slot while keeping action IDs source-specific.
    @MainActor
    static func reassociate(_ nodes: [NativeUIControl], controls: inout [String: UIView],
                            fingerprints: inout [String: NativeUIControl]) -> Set<String> {
        func identity(_ node: NativeUIControl) -> String? {
            guard node.placement == nil, kinds.contains(node.kind), node.items.count == 1 else { return nil }
            return node.items[0].content.transitionId
        }
        let old = Dictionary(grouping: fingerprints.values.filter { identity($0) != nil }, by: { identity($0)! })
        let incoming = Dictionary(grouping: nodes.filter { identity($0) != nil }, by: { identity($0)! })
        let retained = Set(nodes.map(\.id))
        var reused = Set<String>()
        for (key, matches) in incoming {
            guard matches.count == 1, let node = matches.first, controls[node.id] == nil,
                  let previous = old[key], previous.count == 1, let source = previous.first,
                  !retained.contains(source.id), let button = controls[source.id] as? UIButton else { continue }
            controls.removeValue(forKey: source.id)
            fingerprints.removeValue(forKey: source.id)
            controls[node.id] = button
            reused.insert(node.id)
        }
        return reused
    }
    // These Ionic components share the same native UIButton presentation.
    static let kinds: [NativeUIComponent] = [.button, .backButton, .menuButton]

    @available(iOS 26.0, *)
    static func make(_ node: NativeUIControl, existing: UIButton? = nil, rendering: NativeUIControlRendering, activate: @escaping (String) -> Void) -> UIButton? {
        guard node.items.count == 1, let item = node.items.first else { return nil }
        let control = render(item.content, glass: item.content.buttonFill != .clear, existing: existing, rendering: rendering, activate: activate)
        control.semanticContentAttribute = node.rtl ? .forceRightToLeft : .forceLeftToRight
        return control
    }

    @available(iOS 26.0, *)
    static func render(_ item: NativeUIItemContent, glass: Bool, existing: UIButton? = nil, rendering: NativeUIControlRendering, activate: @escaping (String) -> Void) -> UIButton {
        var configuration: UIButton.Configuration = glass ? .glass() : .plain()
        configuration.title = item.label
        configuration.image = rendering.image(item)
        configuration.imagePadding = item.imagePadding ?? 4
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: item.contentInsetLeading ?? 4,
                                                            bottom: 0, trailing: item.contentInsetTrailing ?? 4)
        configuration.imagePlacement = item.iconPosition == .trailing ? .trailing : .leading
        configuration.baseForegroundColor = rendering.color(item.color)
        configuration.titleLineBreakMode = .byTruncatingTail
        let size = item.fontSize
        let weight = item.fontWeight
        configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var outgoing = incoming
            outgoing.font = UIFont.systemFont(ofSize: size, weight: weight >= 600 ? .semibold : weight >= 500 ? .medium : .regular)
            return outgoing
        }
        let button = existing ?? UIButton(configuration: configuration)
        if existing != nil { button.configuration = configuration }
        button.titleLabel?.numberOfLines = 1
        // Web and UIKit can differ by a fraction of a point in text measurement.
        // Absorb that rounding without widening the projected button.
        button.titleLabel?.adjustsFontSizeToFitWidth = true
        button.titleLabel?.minimumScaleFactor = 0.99
        button.isEnabled = !item.disabled
        button.accessibilityLabel = item.accessibilityLabel
        button.accessibilityIdentifier = item.id
        if item.selected { button.accessibilityTraits.insert(.selected) }
        else { button.accessibilityTraits.remove(.selected) }
        if item.disabled { button.accessibilityTraits.insert(.notEnabled) }
        else { button.accessibilityTraits.remove(.notEnabled) }
        button.subviews.filter { $0 is BadgeLabel }.forEach { $0.removeFromSuperview() }
        button.accessibilityValue = item.badge?.value
        if let badge = item.badge {
            let label = BadgeLabel()
            label.text = badge.value
            label.font = .systemFont(ofSize: 11, weight: .semibold)
            label.textColor = rendering.color(badge.textColor)
            label.backgroundColor = rendering.color(badge.color)
            label.textAlignment = .center
            label.layer.cornerRadius = 8
            label.clipsToBounds = true
            label.isAccessibilityElement = false
            label.translatesAutoresizingMaskIntoConstraints = false
            button.addSubview(label)
            NSLayoutConstraint.activate([
                label.centerXAnchor.constraint(equalTo: button.centerXAnchor, constant: 14),
                label.topAnchor.constraint(equalTo: button.topAnchor, constant: 1),
                label.widthAnchor.constraint(greaterThanOrEqualToConstant: max(16, label.intrinsicContentSize.width + 6)),
                label.heightAnchor.constraint(equalToConstant: 16)
            ])
        }
        button.removeAction(identifiedBy: activationID, for: .touchUpInside)
        button.addAction(UIAction(identifier: activationID) { _ in activate(item.id) }, for: .touchUpInside)
        return button
    }
}
