import Capacitor
import UIKit
import WebKit

private final class ShellHost: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }
}

private final class ShellFab: UIView {
    var buttons: [String: UIButton] = [:]
    var content: [String: NSDictionary] = [:]
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }
}

private final class ShellSegmentElement: UIAccessibilityElement {
    var activate: (() -> Bool)?
    override func accessibilityActivate() -> Bool { activate?() ?? false }
}

private final class ShellSegment: UISegmentedControl {
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
}

@objc(IonicNativeUIShellPlugin)
public class IonicNativeUIShellPlugin: CAPPlugin, CAPBridgedPlugin, UITabBarDelegate {
    public let identifier = "IonicNativeUIShellPlugin"
    public let jsName = "IonicNativeUIShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]
    private var host: ShellHost?
    private var controls: [String: UIView] = [:]
    private var searchControllers: [String: UIViewController] = [:]
    private var fingerprints: [String: NSDictionary] = [:]
    private var images: [String: UIImage] = [:]
    private var revision = 0
    private var sequence = 0
    private var keyboardVisible = false
    private var restoreTopEdge: (() -> Void)?
    private var observers: [NSObjectProtocol] = []

    public override func load() {
        for name in [UIApplication.didEnterBackgroundNotification, UIResponder.keyboardWillChangeFrameNotification, UIResponder.keyboardWillHideNotification,
                     UIDevice.orientationDidChangeNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] notification in
                guard let self else { return }
                let keyboard = name == UIResponder.keyboardWillChangeFrameNotification || name == UIResponder.keyboardWillHideNotification
                if keyboard {
                    if name == UIResponder.keyboardWillHideNotification { self.keyboardVisible = false }
                    else if let window = self.bridge?.webView?.window,
                            let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect {
                        let local = window.convert(frame, from: window.screen.coordinateSpace)
                        let overlap = window.bounds.intersection(local)
                        self.keyboardVisible = !overlap.isNull && overlap.width > 0 && overlap.height > 0
                    }
                }
                if !keyboard { self.host?.isHidden = true }
                if #available(iOS 26.0, *) {
                    self.searchControllers.values.forEach {
                        guard let controller = $0 as? ShellSearchController else { return }
                        if !keyboard { controller.surface.isHidden = true }
                    }
                }
                if keyboard { self.bridge?.triggerWindowJSEvent(eventName: "nativeUIShellRefresh") }
            })
        }
        for name in [UIApplication.didBecomeActiveNotification, UIResponder.keyboardDidHideNotification,
                     UIDevice.orientationDidChangeNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                if name == UIResponder.keyboardDidHideNotification { self?.keyboardVisible = false }
                self?.bridge?.triggerWindowJSEvent(eventName: "nativeUIShellRefresh", data: name == UIApplication.didBecomeActiveNotification ? "{\"retireSearch\":true}" : "{}")
            })
        }
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    @objc func configure(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            // A new JS context starts revision numbering again (live reload / navigation).
            self?.restoreTopEdge?()
            self?.restoreTopEdge = nil
            self?.removeControls()
            self?.revision = 0
            if #available(iOS 26.0, *) {
                // Ionic already paints the header edge; a second native effect can
                // add a dark scrim when the OS and Web themes differ.
                if let effect = self?.bridge?.webView?.scrollView.topEdgeEffect {
                    let hidden = effect.isHidden
                    effect.isHidden = true
                    self?.restoreTopEdge = { [weak effect] in effect?.isHidden = hidden }
                }
                call.resolve(["supported": true])
            }
            else { call.resolve(["supported": false]) }
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.resolve(); return }
            let next = call.getInt("revision") ?? 0
            if next >= self.revision {
                self.revision = next
                self.restoreTopEdge?()
                self.restoreTopEdge = nil
                self.removeControls()
            }
            call.resolve()
        }
    }

    private func removeControl(_ id: String) {
        if #available(iOS 26.0, *) {
            (searchControllers.removeValue(forKey: id) as? ShellSearchController)?.detach()
        }
        controls.removeValue(forKey: id)?.removeFromSuperview()
        fingerprints.removeValue(forKey: id)
    }

    private func removeControls() {
        Array(controls.keys).forEach(removeControl)
        host?.removeFromSuperview()
        host = nil
        images.removeAll()
    }

    @objc func update(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.reject("Plugin released"); return }
            guard #available(iOS 26.0, *) else { call.reject("Requires iOS 26"); return }
            let next = call.getInt("revision") ?? 0
            guard next > self.revision else { call.resolve(["revision": self.revision]); return }
            guard let webView = self.bridge?.webView, let parent = webView.superview,
                  let width = call.getDouble("viewportWidth"), width.isFinite, width > 0,
                  let snapshots = call.getArray("controls", JSObject.self), snapshots.count <= 100 else {
                call.reject("Invalid snapshot"); return
            }
            // Validate the entire batch before changing visible controls.
            guard snapshots.allSatisfy({ node in
                guard let id = node["id"] as? String, !id.isEmpty,
                      let kind = node["kind"] as? String,
                      ["ion-button", "ion-buttons", "ion-back-button", "ion-menu-button", "ion-tab-bar", "ion-segment", "ion-fab"].contains(kind),
                      self.rect(node) != nil, let items = node["items"] as? [JSObject], !items.isEmpty else { return false }
                if node["search"] != nil {
                    guard kind == "ion-tab-bar", let search = node["search"] as? JSObject,
                          search["id"] is String, search["closeId"] is String,
                          let trigger = search["trigger"] as? JSObject, self.rect(trigger) != nil, trigger["id"] is String,
                          let field = search["field"] as? JSObject, field["id"] is String else { return false }
                }
                return items.count <= 30 && items.allSatisfy { self.rect($0) != nil && $0["id"] is String }
            }) else { call.reject("Unsupported control snapshot"); return }
            self.revision = next
            if snapshots.isEmpty {
                self.removeControls()
                call.resolve(["revision": next]); return
            }
            let host = self.host ?? ShellHost()
            self.host = host
            host.frame = parent.bounds
            host.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            host.backgroundColor = .clear
            host.isAccessibilityElement = false
            let scale = webView.bounds.width / width
            let retained = Set(snapshots.compactMap { $0["id"] as? String })
            for id in Array(self.controls.keys) where !retained.contains(id) {
                self.removeControl(id)
            }
            var rejectedControls: [String] = []
            var fabs: [(ShellFab, JSObject)] = []
            var searches: [(ShellSearchController, JSObject, CGRect, CGRect)] = []
            var rejectedSearches: [String] = []
            UIView.performWithoutAnimation {
                if host.superview !== parent { parent.addSubview(host) }
                for node in snapshots {
                    let id = node["id"] as! String
                    let previous = self.controls[id]
                    let previousBounds = previous?.bounds
                    let previousCenter = previous?.center
                    let reject = {
                        // Keep the old cover until JS paints Web and omits this ID.
                        if let previous, self.controls[id] === previous {
                            previous.bounds = previousBounds!
                            previous.center = previousCenter!
                            previous.layoutIfNeeded()
                        } else { self.removeControl(id) }
                        rejectedControls.append(id)
                    }
                    // Only native search owns its keyboard; other controls return to Web.
                    if self.keyboardVisible && (self.searchControllers[id] as? ShellSearchController)?.ownsKeyboard != true {
                        reject(); continue
                    }
                    let local = self.rect(node)!
                    let bounds = webView.convert(CGRect(x: local.minX * scale, y: local.minY * scale,
                                                       width: local.width * scale, height: local.height * scale), to: parent)
                    let fingerprint = node as NSDictionary
                    if node["search"] != nil {
                        guard let owner = self.bridge?.viewController else { rejectedSearches.append(id); continue }
                        let controller: ShellSearchController
                        if let existing = self.searchControllers[id] as? ShellSearchController { controller = existing }
                        else {
                            self.removeControl(id)
                            controller = ShellSearchController()
                            controller.activate = { [weak self] id in self?.activate(id) }
                            controller.changed = { [weak self] id, phase, value, composing, valueVersion in
                                guard let self else { return 0 }
                                self.sequence += 1
                                self.notifyListeners("search", data: ["id": id, "phase": phase, "value": value,
                                    "composing": composing, "valueVersion": valueVersion, "sequence": self.sequence, "revision": self.revision])
                                return self.sequence
                            }
                            controller.attach(to: owner, in: owner.view)
                            self.searchControllers[id] = controller
                            self.controls[id] = controller.surface
                        }
                        let trigger = self.rect((node["search"] as! JSObject)["trigger"] as! JSObject)!
                        let searchBarFrame = webView.convert(CGRect(x: webView.bounds.minX + local.minX * scale,
                            y: webView.bounds.minY + local.minY * scale, width: local.width * scale, height: local.height * scale), to: owner.view)
                        let triggerFrame = webView.convert(CGRect(x: webView.bounds.minX + trigger.minX * scale,
                            y: webView.bounds.minY + trigger.minY * scale, width: trigger.width * scale, height: trigger.height * scale), to: owner.view)
                        searches.append((controller, node, searchBarFrame, triggerFrame))
                        continue
                    } else if self.searchControllers[id] != nil {
                        self.removeControl(id)
                    }
                    if self.fingerprints[id] != fingerprint {
                        if node["kind"] as? String == "ion-fab" {
                            let fab = (self.controls[id] as? ShellFab) ?? ShellFab()
                            if fab.superview == nil { host.addSubview(fab) }
                            self.controls[id] = fab
                            fabs.append((fab, node))
                        } else if let tabBar = self.controls[id] as? UITabBar, node["kind"] as? String == "ion-tab-bar" {
                            self.updateTabBar(tabBar, node: node)
                        } else {
                            self.controls.removeValue(forKey: id)?.removeFromSuperview()
                            let control = self.makeControl(node, scale: scale)
                            self.controls[id] = control
                            host.addSubview(control)
                        }
                        self.fingerprints[id] = fingerprint
                    }
                    let control = self.controls[id]!
                    if let tabBar = control as? UITabBar {
                        let fitted = tabBar.sizeThatFits(bounds.size)
                        var size = CGSize(width: tabBar.bounds.width > 0 ? tabBar.bounds.width : bounds.width,
                                          height: max(bounds.height, fitted.height))
                        if tabBar.bounds.size != size { tabBar.bounds.size = size }
                        tabBar.layoutIfNeeded()
                        // UIKit's tab content occupies only part of UITabBar's outer frame.
                        // Align that content to ion-tab-bar, whose CSS already owns placement.
                        guard var content = self.tabContentFrame(tabBar) else {
                            reject(); continue
                        }
                        // Reserve ion-tab-bar's width for the tab content, excluding UIKit's outer gutters.
                        // UIKit can cap the content width for a small number of items.
                        // Do not keep expanding the outer frame beyond its natural size.
                        size.width = min(bounds.width + tabBar.bounds.width - content.width,
                                         max(bounds.width, fitted.width))
                        if abs(tabBar.bounds.width - size.width) > 0.1 {
                            tabBar.bounds.size = size
                            tabBar.layoutIfNeeded()
                            guard let measured = self.tabContentFrame(tabBar) else {
                                reject(); continue
                            }
                            content = measured
                        }
                        // Some UIKit layouts cap the platter width (notably on iPad).
                        // Keep the original Web bar instead of changing its item widths.
                        guard abs(content.width - bounds.width) <= 1 else {
                            reject(); continue
                        }
                        let anchor = node["tabBarAnchor"] as? JSObject
                        let x = anchor?["x"] as? Double ?? 0
                        let y = anchor?["y"] as? Double ?? 0
                        let center = CGPoint(x: bounds.minX + (bounds.width - content.width) * x - content.minX + size.width / 2,
                                             y: bounds.minY + (bounds.height - content.height) * y - content.minY + size.height / 2)
                        if tabBar.center != center { tabBar.center = center }
                    } else if control.frame != bounds {
                        control.frame = bounds
                    }
                    control.overrideUserInterfaceStyle = node["dark"] as? Bool == true ? .dark : .light
                }
                host.isHidden = false
                host.layoutIfNeeded()
            }
            // FABs update in place. Only icon content animates; the glass surface
            // and Ionic's staggered child visibility keep their own identities.
            for (fab, node) in fabs { self.updateFab(fab, node: node, scale: scale) }
            for (controller, node, frame, triggerFrame) in searches {
                let webFrame = webView.convert(webView.bounds, to: controller.surface.superview)
                if !controller.apply(node, webFrame: webFrame, barFrame: frame, triggerFrame: triggerFrame, image: self.image) {
                    let id = node["id"] as! String
                    self.removeControl(id)
                    rejectedSearches.append(id)
                } else {
                    controller.surface.isHidden = self.keyboardVisible && !controller.ownsKeyboard
                }
            }
            let complete = { call.resolve(["revision": next, "rejectedSearches": rejectedSearches, "rejectedControls": rejectedControls]) }
            if let coordinator = searches.first?.0.transitionCoordinator,
               coordinator.animate(alongsideTransition: nil, completion: { _ in complete() }) { return }
            complete()

        }
    }

    private func tabContentFrame(_ tabBar: UITabBar) -> CGRect? {
        func containsControl(_ view: UIView) -> Bool {
            view is UIControl || view.subviews.contains(where: containsControl)
        }
        return tabBar.subviews
            .filter { !$0.isHidden && $0.alpha > 0 && containsControl($0) }
            .map { $0.frame }
            .filter { !$0.isEmpty }
            .reduce(nil) { (result: CGRect?, frame) in result.map { $0.union(frame) } ?? frame }
    }

    private func rect(_ node: JSObject) -> CGRect? {
        guard let x = node["x"] as? Double, let y = node["y"] as? Double,
              let width = node["width"] as? Double, let height = node["height"] as? Double,
              [x, y, width, height].allSatisfy({ $0.isFinite }), width > 0, height > 0 else { return nil }
        return CGRect(x: x, y: y, width: width, height: height)
    }

    private func image(_ item: JSObject) -> UIImage? {
        guard let data = item["icon"] as? String, let width = item["iconWidth"] as? Double, width > 0 else { return nil }
        let template = item["iconTemplate"] as? Bool == true
        let key = (template ? "template:" : "original:") + data
        if let cached = images[key] { return cached }
        guard let bytes = Data(base64Encoded: data), let raw = UIImage(data: bytes), let cg = raw.cgImage else { return nil }
        let result = UIImage(cgImage: cg, scale: CGFloat(cg.width) / width, orientation: .up)
            .withRenderingMode(template ? .alwaysTemplate : .alwaysOriginal)
        if images.count >= 128 { images.removeAll() }
        images[key] = result
        return result
    }

    private func color(_ css: String?) -> UIColor {
        guard let css else { return .label }
        let numbers = css.components(separatedBy: CharacterSet(charactersIn: "0123456789.").inverted).compactMap(Double.init)
        guard numbers.count >= 3 else { return .label }
        return UIColor(red: numbers[0] / 255, green: numbers[1] / 255, blue: numbers[2] / 255,
                       alpha: numbers.count > 3 ? numbers[3] : 1)
    }

    @available(iOS 26.0, *)
    private func button(_ item: JSObject, glass: Bool, existing: UIButton? = nil) -> UIButton {
        var configuration: UIButton.Configuration = glass ? .glass() : .plain()
        configuration.title = item["label"] as? String
        configuration.image = image(item)
        configuration.imagePadding = 4
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4)
        configuration.imagePlacement = item["iconPosition"] as? String == "trailing" ? .trailing : .leading
        configuration.baseForegroundColor = color(item["color"] as? String)
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
            button.addAction(UIAction { [weak self] _ in self?.activate(item["id"] as! String) }, for: .touchUpInside)
        }
        return button
    }

    @available(iOS 26.0, *)
    private func updateFab(_ fab: ShellFab, node: JSObject, scale: CGFloat) {
        let items = node["items"] as! [JSObject]
        let retained = Set(items.map { $0["id"] as! String })
        var lostFocus = false
        for id in Array(fab.buttons.keys) where !retained.contains(id) {
            lostFocus = lostFocus || fab.buttons[id]?.accessibilityElementIsFocused() == true
            fab.buttons.removeValue(forKey: id)?.removeFromSuperview()
            fab.content.removeValue(forKey: id)
        }
        fab.accessibilityIdentifier = node["id"] as? String
        for item in items {
            let id = item["id"] as! String
            var artwork = item.filter { !["x", "y", "width", "height", "visible"].contains($0.key) }
            if item["selected"] as? Bool == true {
                artwork["icon"] = item["closeIcon"]
                artwork["iconWidth"] = item["closeIconWidth"]
                artwork["iconHeight"] = item["closeIconHeight"]
                artwork["label"] = ""
            }
            let previous = fab.buttons[id]
            let button = previous ?? self.button(artwork, glass: true)
            if previous == nil {
                fab.buttons[id] = button
                fab.addSubview(button)
#if DEBUG
                NSLog("[Native UI Shell] Created FAB button %@ %p", id, unsafeBitCast(button, to: Int.self))
#endif
            } else if fab.content[id] != artwork as NSDictionary {
                let changedIcon = fab.content[id]?["selected"] as? Bool != item["selected"] as? Bool
                let duration = UIAccessibility.isReduceMotionEnabled ? 0 : min(item["iconTransition"] as? Double ?? 0, 1)
                if changedIcon, let imageView = button.imageView, duration > 0 {
                    UIView.transition(with: imageView, duration: duration,
                                      options: [.transitionCrossDissolve, .beginFromCurrentState, .allowUserInteraction]) {
                        _ = self.button(artwork, glass: true, existing: button)
                    }
                } else {
                    UIView.performWithoutAnimation { _ = self.button(artwork, glass: true, existing: button) }
                }
            }
            fab.content[id] = artwork as NSDictionary
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
            let rect = self.rect(item)!
            let frame = CGRect(x: rect.minX * scale, y: rect.minY * scale, width: rect.width * scale, height: rect.height * scale)
            if button.frame != frame { button.frame = frame }
        }
        let ordered = items.compactMap { fab.buttons[$0["id"] as! String] }.filter { !$0.isHidden }
        fab.accessibilityElements = ordered
        if lostFocus, let main = ordered.first, main.isEnabled, fab.window != nil {
            UIAccessibility.post(notification: .layoutChanged, argument: main)
        }
    }

    @available(iOS 26.0, *)
    private func makeControl(_ node: JSObject, scale: CGFloat) -> UIView {
        let items = node["items"] as! [JSObject]
        let kind = node["kind"] as! String
        let rtl = node["rtl"] as? Bool == true
        if kind == "ion-button" || kind == "ion-back-button" || kind == "ion-menu-button" {
            let control = button(items[0], glass: true)
            control.semanticContentAttribute = rtl ? .forceRightToLeft : .forceLeftToRight
            return control
        }
        if kind == "ion-tab-bar" {
            let control = UITabBar()
            control.itemPositioning = .fill
#if DEBUG
            NSLog("[Native UI Shell] Created UITabBar %@", node["id"] as? String ?? "")
#endif
            control.delegate = self
            updateTabBar(control, node: node)
            return control
        }
        if kind == "ion-segment" {
            let control = ShellSegment(items: items.map { image($0) as Any? ?? ($0["label"] as? String ?? "") })
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
            control.addAction(UIAction { [weak self, weak control] _ in
                guard let control, items.indices.contains(control.selectedSegmentIndex) else { return }
                self?.activate(items[control.selectedSegmentIndex]["id"] as! String)
            }, for: .valueChanged)
            return control
        }
        let effect = UIGlassEffect(style: .regular)
        let control = UIVisualEffectView(effect: effect)
        control.layer.cornerRadius = (node["height"] as? Double ?? 48) * scale / 2
        control.clipsToBounds = true
        control.accessibilityIdentifier = node["id"] as? String
        for item in items {
            let button = button(item, glass: false)
            button.semanticContentAttribute = rtl ? .forceRightToLeft : .forceLeftToRight
            let rect = self.rect(item)!
            button.frame = CGRect(x: rect.minX * scale, y: rect.minY * scale, width: rect.width * scale, height: rect.height * scale)
            control.contentView.addSubview(button)
        }
        return control
    }

    private func updateTabBar(_ tabBar: UITabBar, node: JSObject) {
        let items = node["items"] as! [JSObject]
        let ids = items.map { $0["id"] as! String }
        // Keep UIKit's item identities and interaction state across DOM selection updates.
        if tabBar.items?.map({ $0.accessibilityIdentifier ?? "" }) != ids {
            tabBar.items = items.map { item in
                let tab = UITabBarItem(title: item["label"] as? String, image: image(item), tag: 0)
                tab.accessibilityIdentifier = item["id"] as? String
                return tab
            }
        }
        for (tab, item) in zip(tabBar.items!, items) {
            let title = item["label"] as? String
            if tab.title != title { tab.title = title }
            let icon = image(item)
            if tab.image !== icon { tab.image = icon }
            if tab.selectedImage !== icon { tab.selectedImage = icon }
            tab.isEnabled = item["disabled"] as? Bool != true
            tab.accessibilityLabel = item["accessibilityLabel"] as? String
            let badge = item["badge"] as? String
            tab.badgeValue = badge?.isEmpty == false ? badge : nil
        }
        let selected = items.firstIndex { $0["selected"] as? Bool == true }
        let selectedItem = selected.map { tabBar.items![$0] }
        if tabBar.selectedItem !== selectedItem { tabBar.selectedItem = selectedItem }
        tabBar.semanticContentAttribute = node["rtl"] as? Bool == true ? .forceRightToLeft : .forceLeftToRight
        tabBar.accessibilityIdentifier = node["id"] as? String
    }

    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard item.isEnabled, let id = item.accessibilityIdentifier else { return }
        activate(id)
    }

    private func activate(_ id: String) {
        sequence += 1
        notifyListeners("activate", data: ["id": id, "revision": revision, "sequence": sequence])

    }
}
