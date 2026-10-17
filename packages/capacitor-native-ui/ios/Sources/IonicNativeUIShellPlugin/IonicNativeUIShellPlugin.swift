import Capacitor
import UIKit
import SwiftUI
import WebKit

@objc(IonicNativeUIShellPlugin)
public class IonicNativeUIShellPlugin: CAPPlugin, CAPBridgedPlugin, UITabBarDelegate {
    public let identifier = "IonicNativeUIShellPlugin"
    public let jsName = "IonicNativeUIShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "completeExtensionAction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getWebViewMetrics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVerticalBarsGeometry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dismissOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopOverlays", returnType: CAPPluginReturnPromise)
    ]
    private var overlays: ShellOverlayController?
    private var host: ShellHost?
    private var verticalBars: ShellVerticalBarsControlling?
    private var controls: [String: UIView] = [:]
    private var searchControllers: [String: ShellSearchControlling] = [:]
    private var extensionControllers: [String: ShellExtensionController] = [:]
    private var extensionSessions: [String: UUID] = [:]
    private var extensionNodes: [String: ShellControl] = [:]
    private let extensionActions = ShellExtensionActions()
    private var fingerprints: [String: ShellControl] = [:]
    private let rendering = ShellRendering()
    private var configurationGeneration = 0
    private var revision = 0
    private var sequence = 0
    private var keyboardVisible = false
    private var pendingTabSelections: [String: ShellTabBar.PendingSelection] = [:]
    private var pendingTabExpiryWorks: [String: DispatchWorkItem] = [:]
    private var restoreTopEdge: (() -> Void)?
    private var observers: [NSObjectProtocol] = []
    private var lastWebViewRadius: Double?

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
                if !keyboard {
                    self.host?.isHidden = true
                    self.verticalBars?.view.isHidden = true
                    self.extensionControllers.values.forEach { $0.view.isHidden = true }
                }
                var searchOwnsKeyboard = self.verticalBars?.ownsKeyboardChrome == true
                self.searchControllers.values.forEach { controller in
                    if controller.ownsKeyboardChrome { searchOwnsKeyboard = true }
                    if !keyboard { controller.surface.isHidden = true }
                }
                if keyboard {
                    if !searchOwnsKeyboard {
                        self.bridge?.triggerWindowJSEvent(eventName: "nativeUIShellRefresh")
                    }
                } else if name == UIDevice.orientationDidChangeNotification {
                    self.notifyWebViewMetricsChange()
                }
            })
        }
        for name in [UIApplication.didBecomeActiveNotification, UIResponder.keyboardDidHideNotification,
                     UIDevice.orientationDidChangeNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                if name == UIResponder.keyboardDidHideNotification { self?.keyboardVisible = false }
                self?.bridge?.triggerWindowJSEvent(eventName: "nativeUIShellRefresh", data: name == UIApplication.didBecomeActiveNotification ? "{\"retireSearch\":true}" : "{}")
                if name == UIApplication.didBecomeActiveNotification { self?.notifyWebViewMetricsChange() }
            })
        }
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    @objc func prepareOverlay(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let id = call.getString("id"),
                  let source = self.bridge?.webView, let owner = self.bridge?.viewController else {
                call.reject("Popover source unavailable"); return
            }
            if self.overlays == nil {
                self.overlays = ShellOverlayController(source: source, owner: owner) { [weak self] id, action in
                    self?.notifyListeners("overlay", data: ["id": id, "action": action])
                }
            }
            guard self.overlays?.prepare(id) == true else { call.reject("Popover already pending"); return }
            call.resolve()
        }
    }

    @objc func presentOverlay(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let overlays = self.overlays, let id = call.getString("id") else {
                call.reject("Popover not prepared"); return
            }
            overlays.present(id, options: call.getObject("presentation"), anchored: { [weak self] anchor, host, completion in
                guard let self, let rail = self.verticalBars,
                      rail.presentPopover(anchor: anchor, host: host, completion: completion) else { return false }
                let cancel = host.cancelAnchored
                host.cancelAnchored = { [weak self, weak rail] in
                    cancel?()
                    // Cancellation removed the rail; invalidate native ownership even
                    // if the next DOM snapshot is identical to the previous one.
                    if let self, let rail, self.verticalBars === rail { self.verticalBars = nil }
                    self?.bridge?.triggerWindowJSEvent(eventName: "nativeUIShellRefresh")
                }
                return true
            }) { presented in
                if presented { call.resolve() } else { call.reject("Native Vertical Bars anchor unavailable") }
            }
        }
    }

    @objc func dismissOverlay(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let overlays = self?.overlays, let id = call.getString("id") else { call.resolve(); return }
            overlays.dismiss(id, animated: call.getBool("animated") ?? false) { call.resolve() }
        }
    }

    @objc func closeOverlay(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let overlays = self?.overlays, let id = call.getString("id") else { call.resolve(); return }
            overlays.close(id) { call.resolve() }
        }
    }

    @objc func stopOverlays(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let overlays = self.overlays else { call.resolve(); return }
            overlays.stop {
                if self.overlays === overlays { self.overlays = nil }
                call.resolve()
            }
        }
    }

    private func webViewMetrics() -> JSObject? {
        guard #available(iOS 26.0, *), let webView = bridge?.webView else { return nil }
        webView.layoutIfNeeded()
        return ["radius": Double(webView.effectiveRadius(corner: .topLeft))]
    }

    private func notifyWebViewMetricsChange() {
        let metrics = webViewMetrics() ?? ["radius": 0]
        let radius = metrics["radius"] as? Double ?? 0
        guard radius != lastWebViewRadius else { return }
        lastWebViewRadius = radius
        notifyListeners("webViewMetricsChange", data: metrics)
    }

    @objc func getWebViewMetrics(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            call.resolve(self?.webViewMetrics() ?? ["radius": 0])
        }
    }

    @objc func configure(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.resolve(["supported": false]); return }
            self.configurationGeneration += 1
            let generation = self.configurationGeneration
            let configure = { [self] in
                guard generation == self.configurationGeneration else {
                    call.reject("Configuration superseded"); return
                }
                // A new JS context starts revision numbering again (live reload / navigation).
                self.restoreTopEdge?()
                self.restoreTopEdge = nil
                self.removeControls()
                self.revision = 0
                if #available(iOS 26.0, *) {
                    self.bridge?.webView?.layoutIfNeeded()
                    // Ionic already paints the header edge; a second native effect can
                    // add a dark scrim when the OS and Web themes differ.
                    if call.getBool("verticalBarsOnly") != true, let effect = self.bridge?.webView?.scrollView.topEdgeEffect {
                        let hidden = effect.isHidden
                        effect.isHidden = true
                        self.restoreTopEdge = { [weak effect] in effect?.isHidden = hidden }
                    }
                    call.resolve(["supported": true, "extensions": NativeUIShell.names])
                }
                else { call.resolve(["supported": false]) }
            }
            // A replacement JS context cannot close its predecessor's child window.
            // Finish dismissing it while its rail still owns the SwiftUI presentation.
            if let overlays = self.overlays {
                overlays.stop {
                    if self.overlays === overlays { self.overlays = nil }
                    configure()
                }
            } else { configure() }
        }
    }

    @objc func getVerticalBarsGeometry(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let webView = self.bridge?.webView, let rail = self.verticalBars,
                  let width = call.getDouble("viewportWidth"), width.isFinite, width > 0,
                  webView.bounds.width > 0 else { call.resolve(["items": [:]]); return }
            let scale = width / webView.bounds.width
            let ids = Set(call.getArray("ids", String.self) ?? [])
            let measured = ShellVerticalBarsGeometry.measure(in: rail.view, relativeTo: webView, ids: ids).merging(rail.measuredFrames(relativeTo: webView).filter { ids.contains($0.key) }) { _, swiftUI in swiftUI }
            let items = measured.mapValues { frame in
                ["x": frame.minX * scale, "y": frame.minY * scale,
                 "width": frame.width * scale, "height": frame.height * scale]
            }
            call.resolve(["revision": self.revision, "items": items])
        }
    }

    @objc func completeExtensionAction(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let request = call.getString("requestId"), let accepted = call.getBool("accepted") else {
                call.reject("Invalid extension acknowledgement"); return
            }
            self?.extensionActions.finish(request, error: accepted ? nil : NativeUIError.rejected)
            call.resolve()
        }
    }

    @MainActor private func extensionContent(_ node: ShellControl) throws -> AnyView {
        guard let data = node.extensionContent else { throw NativeUIError.unavailable }
        let session = extensionSessions[node.id] ?? UUID()
        extensionSessions[node.id] = session
        let actions = NativeUIActions { [weak self] name in
            guard let self, self.extensionNodes[node.id] == node, self.extensionSessions[node.id] == session, let target = data.actions[name] else {
                throw NativeUIError.unavailable
            }
            try await self.extensionActions.perform(owner: node.id) { request in
                self.sequence += 1
                self.notifyListeners("activate", data: ["id": target, "revision": self.revision,
                    "sequence": self.sequence, "requestId": request])
            }
        }
        return AnyView(try NativeUIShell.content(data, actions: actions)
            .environment(\.layoutDirection, node.rtl ? .rightToLeft : .leftToRight)
            .environment(\.colorScheme, node.dark ? .dark : .light)
            .id(node.id))
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

    private func removeControl(_ id: String, duration: TimeInterval = 0) {
        extensionActions.cancel(owner: id)
        extensionNodes.removeValue(forKey: id)
        extensionSessions.removeValue(forKey: id)
        let extensionController = extensionControllers.removeValue(forKey: id)
        searchControllers.removeValue(forKey: id)?.detach()
        let control = controls.removeValue(forKey: id)
        if let extensionController { extensionController.detach(duration: duration) }
        else if let control { ShellCrossfade.retire(control, duration: duration) }
        fingerprints.removeValue(forKey: id)
        pendingTabSelections.removeValue(forKey: id)
        pendingTabExpiryWorks.removeValue(forKey: id)?.cancel()
    }

    private func removeControls(duration: TimeInterval = 0) {
        extensionActions.cancel()
        extensionNodes.removeAll()
        extensionSessions.removeAll()
        Array(controls.keys).forEach { removeControl($0, duration: duration) }
        host?.removeFromSuperview()
        host = nil
        verticalBars?.detach(duration: duration)
        verticalBars = nil
        rendering.clear()
        pendingTabSelections.removeAll()
        pendingTabExpiryWorks.values.forEach { $0.cancel() }
        pendingTabExpiryWorks.removeAll()
    }

    private func syncTabBar(_ tabBar: UITabBar, id: String, node: ShellControl) {
        var pending = pendingTabSelections[id]
        ShellTabBar.update(tabBar, node: node, rendering: rendering, pendingSelection: &pending)
        if let pending {
            pendingTabSelections[id] = pending
        } else {
            pendingTabSelections.removeValue(forKey: id)
            pendingTabExpiryWorks.removeValue(forKey: id)?.cancel()
        }
    }

    private func schedulePendingTabExpiry(_ id: String, until: CFAbsoluteTime) {
        pendingTabExpiryWorks[id]?.cancel()
        let delay = max(0, until - CFAbsoluteTimeGetCurrent()) + 0.02
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.pendingTabExpiryWorks.removeValue(forKey: id)
            guard let pending = self.pendingTabSelections[id],
                  CFAbsoluteTimeGetCurrent() >= pending.until,
                  let tabBar = self.controls[id] as? UITabBar,
                  let node = self.fingerprints[id] else { return }
            self.syncTabBar(tabBar, id: id, node: node)
        }
        pendingTabExpiryWorks[id] = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
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
            self.notifyWebViewMetricsChange()
            let duration = ShellCrossfade.duration(snapshot.transitionDuration)
            let existing = Set(self.controls.keys)
            let verticalBars = snapshot.controls.filter { $0.placement == .verticalBars }
            let accessories = snapshot.controls.filter { $0.extensionContent?.tabBarId != nil }
            let snapshots = snapshot.controls.filter { $0.placement != .verticalBars && $0.extensionContent?.tabBarId == nil }
            let extensionIDs = Set(snapshot.controls.filter { $0.kind == .extension }.map(\.id))
            for id in Array(self.extensionNodes.keys) where !extensionIDs.contains(id) {
                self.extensionActions.cancel(owner: id)
                self.extensionNodes.removeValue(forKey: id)
                self.extensionSessions.removeValue(forKey: id)
            }
            let verticalSearchActive = verticalBars.contains { $0.search.map { $0.available && $0.active } ?? false }
            let width = snapshot.viewportWidth
            self.revision = next
            if snapshots.isEmpty && verticalBars.isEmpty && accessories.isEmpty {
                self.removeControls(duration: duration)
                call.resolve(["revision": next]); return
            }
            let scale = webView.bounds.width / width
            let retained = Set(snapshots.map(\.id))
            for id in Array(self.controls.keys) where !retained.contains(id) {
                self.removeControl(id, duration: duration)
            }
            var rejectedControls: [String] = []
            var fabs: [(ShellFab, ShellControl)] = []
            var searches: [(ShellSearchControlling, ShellControl, CGRect, CGRect, UIView?, Bool)] = []
            var rejectedSearches: [String] = []
            if verticalBars.isEmpty || (self.keyboardVisible && !verticalSearchActive) {
                self.verticalBars?.detach(duration: duration)
                self.verticalBars = nil
                if self.keyboardVisible { rejectedControls.append(contentsOf: verticalBars.map(\.id)) }
            } else if let owner = self.bridge?.viewController {
                let entering = self.verticalBars == nil
                let rail = self.verticalBars ?? ShellVerticalBarsController(
                    activate: { [weak self] id in self?.activate(id) },
                    changed: { [weak self] id, phase, value, composing, valueVersion in
                        self?.searchChanged(id, phase: phase, value: value, composing: composing, valueVersion: valueVersion) ?? 0
                    })
                self.verticalBars = rail
                rail.attach(to: owner, in: owner.view)
                if let frame = snapshot.verticalBarFrame {
                    rail.view.frame = webView.convert(frame.rect.applying(CGAffineTransform(scaleX: scale, y: scale)), to: owner.view)
                } else {
                    rail.view.frame = owner.view.bounds
                }
                // The shell owns the entry crossfade; later native updates keep SwiftUI motion.
                rail.apply(verticalBars, rendering: self.rendering, edge: snapshot.verticalBarEdge ?? "right", animated: !entering)
                rail.view.isHidden = false
                if entering { ShellCrossfade.enter(rail.view, duration: duration) }
            } else {
                rejectedControls.append(contentsOf: verticalBars.map(\.id))
            }
            // A system tab host has one accessory slot. Ambiguous owners stay on the Web.
            var accessoryContent: AnyView?
            for node in accessories {
                guard #available(iOS 26.1, *), accessories.count == 1, !self.keyboardVisible, self.verticalBars != nil,
                      verticalBars.filter({ $0.kind == .tabBar }).map(\.id) == [node.extensionContent!.tabBarId!],
                      let content = try? self.extensionContent(node) else {
                    rejectedControls.append(node.id)
                    self.extensionNodes.removeValue(forKey: node.id)
                    self.extensionSessions.removeValue(forKey: node.id)
                    self.extensionActions.cancel(owner: node.id)
                    continue
                }
                self.extensionNodes[node.id] = node
                accessoryContent = content
            }
            self.verticalBars?.setAccessory(accessoryContent)
            if snapshots.isEmpty {
                self.host?.removeFromSuperview()
                self.host = nil
                call.resolve(["revision": next, "rejectedControls": rejectedControls])
                return
            }
            let host = self.host ?? ShellHost()
            self.host = host
            host.frame = parent.bounds
            host.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            host.backgroundColor = .clear
            host.isAccessibilityElement = false
            UIView.performWithoutAnimation {
                if host.superview !== parent { parent.addSubview(host) }
                for node in snapshots {
                    let id = node.id
                    if node.kind != .extension, self.extensionControllers[id] != nil { self.removeControl(id) }
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
                    if self.keyboardVisible && self.searchControllers[id]?.ownsKeyboard != true {
                        reject(); continue
                    }
                    let local = node.frame.rect
                    let bounds = webView.convert(CGRect(x: local.minX * scale, y: local.minY * scale,
                                                       width: local.width * scale, height: local.height * scale), to: parent)
                    if node.kind == .extension {
                        guard let owner = self.bridge?.viewController, let content = try? self.extensionContent(node) else {
                            self.extensionNodes.removeValue(forKey: id)
                            self.extensionSessions.removeValue(forKey: id)
                            self.extensionActions.cancel(owner: id)
                            reject(); continue
                        }
                        if let controller = self.extensionControllers[id] {
                            controller.update(content)
                        } else {
                            if let previous = self.controls.removeValue(forKey: id) { previous.removeFromSuperview() }
                            self.searchControllers.removeValue(forKey: id)?.detach()
                            let controller = ShellExtensionController(content: content, owner: owner)
                            self.extensionControllers[id] = controller
                            self.controls[id] = controller.view
                        }
                        self.extensionNodes[id] = node
                        self.controls[id]?.frame = parent.convert(bounds, to: owner.view)
                        self.controls[id]?.isHidden = false
                        self.controls[id]?.overrideUserInterfaceStyle = node.dark ? .dark : .light
                        continue
                    }
                    if let search = node.search {
                        guard let owner = self.bridge?.viewController else { rejectedSearches.append(id); continue }
                        let controller: ShellSearchControlling
                        let previousCover = self.controls[id]
                        let replacing = self.searchControllers[id]
                        if let existing = replacing { controller = existing }
                        else {
                            // Keep the ordinary UITabBar cover until the search controller applies.
                            controller = ShellSearchController()
                            controller.activate = { [weak self] id in self?.activate(id) }
                            controller.changed = { [weak self] id, phase, value, composing, valueVersion in
                                self?.searchChanged(id, phase: phase, value: value, composing: composing, valueVersion: valueVersion) ?? 0
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
                        searches.append((controller, node, searchBarFrame, triggerFrame, previousCover, replacing == nil))
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
                        } else if let segment = self.controls[id] as? ShellSegment, node.kind == ShellSegment.kind {
                            segment.update(node, scale: scale, rendering: self.rendering)
                        } else if let tabBar = self.controls[id] as? UITabBar, node.kind == ShellTabBar.kind {
                            self.syncTabBar(tabBar, id: id, node: node)
                        } else {
                            guard let control = ShellComponents.make(node, scale: scale, rendering: self.rendering, tabDelegate: self,
                                activate: { [weak self] id in self?.activate(id) }) else { reject(); continue }
                            self.controls.removeValue(forKey: id)?.removeFromSuperview()
                            self.controls[id] = control
                            host.addSubview(control)
                        }
                        self.fingerprints[id] = node
                    } else if let tabBar = self.controls[id] as? UITabBar, self.pendingTabSelections[id] != nil {
                        // Resolve an in-flight native tap even when other fingerprint fields are unchanged.
                        self.syncTabBar(tabBar, id: id, node: node)
                    }
                    guard let control = self.controls[id] else { reject(); continue }
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
            for (controller, node, frame, triggerFrame, previousCover, created) in searches {
                let id = node.id
                let webFrame = webView.convert(webView.bounds, to: controller.surface.superview)
                if !controller.apply(node, webFrame: webFrame, barFrame: frame, triggerFrame: triggerFrame, rendering: self.rendering) {
                    if created {
                        self.searchControllers.removeValue(forKey: id)
                        controller.detach()
                        if let previousCover, previousCover.superview != nil {
                            self.controls[id] = previousCover
                        } else {
                            self.controls.removeValue(forKey: id)?.removeFromSuperview()
                            self.fingerprints.removeValue(forKey: id)
                            self.pendingTabSelections[id] = nil
                            self.pendingTabExpiryWorks.removeValue(forKey: id)?.cancel()
                        }
                    } else {
                        self.removeControl(id)
                    }
                    rejectedSearches.append(id)
                } else {
                    if created, let previousCover, previousCover !== controller.surface {
                        previousCover.removeFromSuperview()
                    }
                    controller.surface.isHidden = self.keyboardVisible && !controller.ownsKeyboard
                }
            }
            for (id, control) in self.controls where !existing.contains(id) && self.searchControllers[id] == nil {
                ShellCrossfade.enter(control, duration: duration)
            }
            let complete = { call.resolve(["revision": next, "rejectedSearches": rejectedSearches, "rejectedControls": rejectedControls]) }
            if let coordinator = searches.first?.0.transitionCoordinator,
               coordinator.animate(alongsideTransition: nil, completion: { _ in complete() }) { return }
            complete()

        }
    }

    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard item.isEnabled, let itemId = item.accessibilityIdentifier else { return }
        if let controlId = controls.first(where: { $0.value === tabBar })?.key {
            let pending = ShellTabBar.PendingSelection.start(itemId)
            pendingTabSelections[controlId] = pending
            schedulePendingTabExpiry(controlId, until: pending.until)
        }
        activate(itemId)
    }

    private func searchChanged(_ id: String, phase: ShellSearchPhase, value: String,
                               composing: Bool, valueVersion: Int) -> Int {
        sequence += 1
        notifyListeners("search", data: ["id": id, "phase": phase.rawValue, "value": value,
            "composing": composing, "valueVersion": valueVersion, "sequence": sequence, "revision": revision])
        return sequence
    }

    private func activate(_ id: String) {
        sequence += 1
        notifyListeners("activate", data: ["id": id, "revision": revision, "sequence": sequence])

    }
}
