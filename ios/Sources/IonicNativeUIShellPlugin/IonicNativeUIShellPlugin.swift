import Capacitor
import UIKit
import WebKit

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
    private var fingerprints: [String: ShellControl] = [:]
    private let rendering = ShellRendering()
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
        rendering.clear()
    }

    @objc func update(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.reject("Plugin released"); return }
            guard #available(iOS 26.0, *) else { call.reject("Requires iOS 26"); return }
            let next = call.getInt("revision") ?? 0
            guard next > self.revision else { call.resolve(["revision": self.revision]); return }
            guard let webView = self.bridge?.webView, let parent = webView.superview else {
                call.reject("WebView unavailable"); return
            }
            // Decode and validate the entire batch before changing visible controls.
            guard let snapshot = try? call.decode(ShellSnapshot.self), snapshot.isValid else {
                call.reject("Invalid control snapshot"); return
            }
            let snapshots = snapshot.controls
            let width = snapshot.viewportWidth
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
            let retained = Set(snapshots.map(\.id))
            for id in Array(self.controls.keys) where !retained.contains(id) {
                self.removeControl(id)
            }
            var rejectedControls: [String] = []
            var fabs: [(ShellFab, ShellControl)] = []
            var searches: [(ShellSearchController, ShellControl, CGRect, CGRect)] = []
            var rejectedSearches: [String] = []
            UIView.performWithoutAnimation {
                if host.superview !== parent { parent.addSubview(host) }
                for node in snapshots {
                    let id = node.id
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
                    let local = node.frame.rect
                    let bounds = webView.convert(CGRect(x: local.minX * scale, y: local.minY * scale,
                                                       width: local.width * scale, height: local.height * scale), to: parent)
                    if let search = node.search {
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
                                self.notifyListeners("search", data: ["id": id, "phase": phase.rawValue, "value": value,
                                    "composing": composing, "valueVersion": valueVersion, "sequence": self.sequence, "revision": self.revision])
                                return self.sequence
                            }
                            controller.attach(to: owner, in: owner.view)
                            self.searchControllers[id] = controller
                            self.controls[id] = controller.surface
                        }
                        let trigger = search.trigger.frame.rect
                        let searchBarFrame = webView.convert(CGRect(x: webView.bounds.minX + local.minX * scale,
                            y: webView.bounds.minY + local.minY * scale, width: local.width * scale, height: local.height * scale), to: owner.view)
                        let triggerFrame = webView.convert(CGRect(x: webView.bounds.minX + trigger.minX * scale,
                            y: webView.bounds.minY + trigger.minY * scale, width: trigger.width * scale, height: trigger.height * scale), to: owner.view)
                        searches.append((controller, node, searchBarFrame, triggerFrame))
                        continue
                    } else if self.searchControllers[id] != nil {
                        self.removeControl(id)
                    }
                    if self.fingerprints[id] != node {
                        if node.kind == ShellFab.kind {
                            let fab = (self.controls[id] as? ShellFab) ?? ShellFab()
                            if fab.superview == nil { host.addSubview(fab) }
                            self.controls[id] = fab
                            fabs.append((fab, node))
                        } else if let tabBar = self.controls[id] as? UITabBar, node.kind == ShellTabBar.kind {
                            ShellTabBar.update(tabBar, node: node, rendering: self.rendering)
                        } else {
                            self.controls.removeValue(forKey: id)?.removeFromSuperview()
                            let control = ShellComponents.make(node, scale: scale, rendering: self.rendering, tabDelegate: self,
                                activate: { [weak self] id in self?.activate(id) })
                            self.controls[id] = control
                            host.addSubview(control)
                        }
                        self.fingerprints[id] = node
                    }
                    let control = self.controls[id]!
                    if let tabBar = control as? UITabBar {
                        guard ShellTabBar.fit(tabBar, node: node, bounds: bounds) else { reject(); continue }
                    } else if control.frame != bounds {
                        control.frame = bounds
                    }
                    control.overrideUserInterfaceStyle = node.dark ? .dark : .light
                }
                host.isHidden = false
                host.layoutIfNeeded()
            }
            // FABs update in place. Only icon content animates; the glass surface
            // and Ionic's staggered child visibility keep their own identities.
            for (fab, node) in fabs {
                fab.apply(node, scale: scale, rendering: self.rendering, activate: { [weak self] id in self?.activate(id) })
            }
            for (controller, node, frame, triggerFrame) in searches {
                let webFrame = webView.convert(webView.bounds, to: controller.surface.superview)
                if !controller.apply(node, webFrame: webFrame, barFrame: frame, triggerFrame: triggerFrame, rendering: self.rendering) {
                    let id = node.id
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

    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard item.isEnabled, let id = item.accessibilityIdentifier else { return }
        activate(id)
    }

    private func activate(_ id: String) {
        sequence += 1
        notifyListeners("activate", data: ["id": id, "revision": revision, "sequence": sequence])

    }
}
