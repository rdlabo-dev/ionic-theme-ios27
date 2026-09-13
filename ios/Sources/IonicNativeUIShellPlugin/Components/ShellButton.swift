import Capacitor
import UIKit

enum ShellButton {
    // These Ionic components share the same native UIButton presentation.
    static let kinds = ["ion-button", "ion-back-button", "ion-menu-button"]

    @available(iOS 26.0, *)
    static func make(_ node: JSObject, rendering: ShellRendering, activate: @escaping (String) -> Void) -> UIButton {
        let control = render((node["items"] as! [JSObject])[0], glass: true, rendering: rendering, activate: activate)
        control.semanticContentAttribute = node["rtl"] as? Bool == true ? .forceRightToLeft : .forceLeftToRight
        return control
    }

    @available(iOS 26.0, *)
    static func render(_ item: JSObject, glass: Bool, existing: UIButton? = nil, rendering: ShellRendering, activate: @escaping (String) -> Void) -> UIButton {
        var configuration: UIButton.Configuration = glass ? .glass() : .plain()
        configuration.title = item["label"] as? String
        configuration.image = rendering.image(item)
        configuration.imagePadding = 4
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4)
        configuration.imagePlacement = item["iconPosition"] as? String == "trailing" ? .trailing : .leading
        configuration.baseForegroundColor = rendering.color(item["color"] as? String)
        configuration.titleLineBreakMode = .byTruncatingTail
        let size = item["fontSize"] as? Double ?? 17
        let weight = item["fontWeight"] as? Double ?? 400
        configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var outgoing = incoming
            outgoing.font = UIFont.systemFont(ofSize: size, weight: weight >= 600 ? .semibold : weight >= 500 ? .medium : .regular)
            return outgoing
        }
        let button = existing ?? UIButton(configuration: configuration)
        if existing != nil { button.configuration = configuration }
        button.titleLabel?.numberOfLines = 1
        button.isEnabled = item["disabled"] as? Bool != true
        button.accessibilityLabel = item["accessibilityLabel"] as? String
        button.accessibilityIdentifier = item["id"] as? String
        if item["selected"] as? Bool == true { button.accessibilityTraits.insert(.selected) }
        if let badge = item["badge"] as? String, !badge.isEmpty {
            button.accessibilityValue = badge
            let label = UILabel()
            label.text = badge
            label.font = .systemFont(ofSize: 11, weight: .semibold)
            label.textColor = .white
            label.backgroundColor = .systemRed
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
        if existing == nil {
            button.addAction(UIAction { _ in activate(item["id"] as! String) }, for: .touchUpInside)
        }
        return button
    }
}
