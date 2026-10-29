import WebViewNativeUIEngine
import Capacitor
import UIKit
import SwiftUI
import WebKit

@objc(NativeUIPlugin)
public class NativeUIPlugin: CAPPlugin, CAPBridgedPlugin, UITabBarDelegate {
    public let identifier = "NativeUIPlugin"
    public let jsName = "NativeUI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "completeExtensionAction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "coveredSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getWebViewMetrics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVerticalBarsGeometry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setToolbarTransitionProgress", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getConnectionState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dismissOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopOverlays", returnType: CAPPluginReturnPromise)
    ]
    private let coveredSnapshots = NativeUICoveredSnapshots()
    private var snapshotControls: [NativeUIControl] = []
    private var overlays: NativeUIOverlayController?
    private var toolbarTransition: NativeUIToolbarTransition?
    private var host: NativeUIHost?
    private var verticalBars: NativeUIVerticalBarsControlling?
    private var controls: [String: UIView] = [:]
    private var searchControllers: [String: NativeUISearchControlling] = [:]
    private var extensionControllers: [String: NativeUIExtensionController] = [:]
    private var extensionSessions: [String: UUID] = [:]
    private let scrollBindings = NativeUIScrollBindings()
    private var extensionNodes: [String: NativeUIControl] = [:]
    private let extensionActions = NativeUIExtensionActions()
    private var fingerprints: [String: NativeUIControl] = [:]
    private let rendering = NativeUIControlRendering()
    private var configurationGeneration = 0
    private var connectionSession = UUID().uuidString
    private var modalAnimationID: Int?
    private var revision = 0
    private var sequence = 0
    private var keyboardVisible = false
    private var pendingTabSelections: [String: NativeUITabBar.PendingSelection] = [:]
    private var pendingTabExpiryWorks: [String: DispatchWorkItem] = [:]
    private var restoreTopEdge: (() -> Void)?
    private var observers: [NSObjectProtocol] = []
    private var lastWebViewRadius: Double?
    private var lastVerticalBarEdge: String?

    public override func load() {
        #if canImport(UIKit, _underlyingVersion: 9127.0.85) && !targetEnvironment(macCatalyst)
        if #available(iOS 27.1, *), let webView = bridge?.webView {
            webView.registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge) { [weak self] (_: WKWebView, _: UITraitCollection) in
                self?.notifyWebViewMetricsChange()
            }
        }
        #endif
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
                let suspend = name == UIApplication.didEnterBackgroundNotification
                if suspend {
                    self.resetCoveredSnapshots()
                    self.host?.isHidden = true
                    self.verticalBars?.view.isHidden = true
                    self.extensionControllers.values.forEach { $0.view.isHidden = true }
                }
                var searchOwnsKeyboard = self.verticalBars?.ownsKeyboardChrome == true
                self.searchControllers.values.forEach { controller in
                    if controller.ownsKeyboardChrome { searchOwnsKeyboard = true }
                    if suspend { controller.surface.isHidden = true }
                }
                if keyboard {
                    if !searchOwnsKeyboard {
                        self.bridge?.triggerWindowJSEvent(eventName: "nativeUIRefresh")
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
                self?.bridge?.triggerWindowJSEvent(eventName: "nativeUIRefresh", data: name == UIApplication.didBecomeActiveNotification ? "{\"retireSearch\":true}" : "{}")
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
                self.overlays = NativeUIOverlayController(source: source, owner: owner) { [weak self] id, action in
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
                    self?.bridge?.triggerWindowJSEvent(eventName: "nativeUIRefresh")
                }
                return true
            }) { presented in
                if presented { call.resolve() } else { call.reject("Native Vertical Bars anchor unavailable") }
            }
        }
    }

    @objc func getConnectionState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.reject("Plugin released"); return }
            var state: JSObject = [
                "session": self.connectionSession, "revision": self.revision, "sequence": self.sequence,
                "surfaces": ["horizontal": self.host?.window != nil, "vertical": self.verticalBars?.view.window != nil],
                "listeners": ["activate", "search", "overlay", "webViewMetricsChange", "snapshotInteraction"].filter { self.hasListeners($0) }
            ]
            if let overlay = self.overlays?.connectionState { state["overlay"] = overlay.mapValues { $0 as JSValue } }
            call.resolve(state)
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
        var metrics: JSObject = ["radius": Double(webView.effectiveRadius(corner: .topLeft)), "verticalBarEdge": NSNull()]
        #if canImport(UIKit, _underlyingVersion: 9127.0.85) && !targetEnvironment(macCatalyst)
        if #available(iOS 27.1, *) {
            switch webView.traitCollection.verticalBarEdge {
            case .leading: metrics["verticalBarEdge"] = "leading"
            case .trailing: metrics["verticalBarEdge"] = "trailing"
            default: break
            }
        }
        #endif
        return metrics
    }

    private func notifyWebViewMetricsChange() {
        let metrics = webViewMetrics() ?? ["radius": 0]
        let radius = metrics["radius"] as? Double ?? 0
        let edge = metrics["verticalBarEdge"] as? String
        guard radius != lastWebViewRadius || edge != lastVerticalBarEdge else { return }
        lastVerticalBarEdge = edge
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
                self.resetCoveredSnapshots()
                self.removeControls()
                self.revision = 0
                self.connectionSession = UUID().uuidString
                if #available(iOS 26.0, *) {
                    self.bridge?.webView?.layoutIfNeeded()
                    // Ionic already paints the header edge; a second native effect can
                    // add a dark scrim when the OS and Web themes differ.
                    if call.getBool("suppressScrollEdgeEffect") == true, let effect = self.bridge?.webView?.scrollView.topEdgeEffect {
                        let hidden = effect.isHidden
                        effect.isHidden = true
                        self.restoreTopEdge = { [weak effect] in effect?.isHidden = hidden }
                    }
                    call.resolve(["supported": true, "extensions": NativeUI.names, "modalAnimation": true, "connectionState": true, "coveredSnapshots": true, "nativeScroll": true])
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

    private func resetCoveredSnapshots() {
        coveredSnapshots.reset()
    }

    @objc func coveredSnapshot(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let webView = self.bridge?.webView else { call.reject("WebView unavailable"); return }
            if call.getString("action") == "prepare", let window = webView.window {
                self.coveredSnapshots.observe(window) { [weak self] active in
                    self?.notifyListeners("snapshotInteraction", data: ["active": active])
                }
            }
            let measure: (Set<String>, Int) -> [String: CGRect] = { [weak self, weak webView] ids, revision in
                guard let self, let webView, revision == self.revision,
                      !self.keyboardVisible, self.toolbarTransition == nil else { return [:] }
                let nodes = self.snapshotControls.filter { ids.contains($0.id) }
                guard nodes.count == ids.count else { return [:] }
                let itemIDs = Set(nodes.flatMap { $0.items.map(\.id) } + nodes.filter { $0.extensionContent?.tabBarId != nil }.map(\.id) + ["BackButton", "__tabBar"])
                var measured = self.verticalBars.map { NativeUIVerticalBarsGeometry.measure(in: $0.view, relativeTo: webView, ids: itemIDs) } ?? [:]
                self.verticalBars?.measuredFrames(relativeTo: webView).forEach { measured[$0.key] = $0.value.frame }
                var frames: [String: CGRect] = [:]
                for node in nodes {
                    if node.extensionContent?.tabBarId != nil {
                        frames[node.id] = measured[node.id]
                    } else if node.placement == .verticalBars {
                        if node.kind == .tabBar { frames[node.id] = measured["__tabBar"] }
                        else {
                            let rects = node.items.compactMap { measured[node.kind == .backButton ? "BackButton" : $0.id] }
                            if rects.count == node.items.count { frames[node.id] = rects.reduce(CGRect.null) { $0.union($1) } }
                        }
                    } else if let view = self.controls[node.id], !view.isHidden, view.window != nil {
                        let surfaces: [UIView]
                        if let fab = view as? NativeUIFab { surfaces = fab.buttons.values.filter { !$0.isHidden } }
                        else { surfaces = [view] }
                        if !surfaces.isEmpty {
                            frames[node.id] = surfaces.reduce(CGRect.null) { $0.union($1.convert($1.bounds, to: webView)) }
                        }
                    }
                }
                if frames.count != ids.count, let rail = self.verticalBars {
                    let railNodes = self.snapshotControls.filter { $0.placement == .verticalBars }
                    let components = NativeUIVerticalBarsGeometry.componentFrames(in: rail.view, relativeTo: webView, controls: railNodes)
                    for node in nodes where frames[node.id] == nil { frames[node.id] = components[node.id] }
                }
                return frames
            }
            let views: (Set<String>) -> [UIView]? = { ids in
                let railIDs = Set(self.snapshotControls.filter { $0.placement == .verticalBars }.map(\.id))
                // A shared rail can only retire when every one of its controls has a prepared image.
                guard Set(self.snapshotControls.map(\.id)).isSuperset(of: ids),
                      ids.isDisjoint(with: railIDs) || ids.isSuperset(of: railIDs) else {
                    return nil
                }
                var views = Array(self.controls.filter { ids.contains($0.key) }.values)
                if !railIDs.isEmpty, ids.isSuperset(of: railIDs), let rail = self.verticalBars { views.append(rail.view) }
                return views
            }
            self.coveredSnapshots.handle(call.options as? [String: Any] ?? [:], in: webView, frames: measure, views: views, complete: { call.resolve($0) })
        }
    }

    @objc func getVerticalBarsGeometry(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let webView = self.bridge?.webView, let rail = self.verticalBars,
                  let width = call.getDouble("viewportWidth"), width.isFinite, width > 0,
                  webView.bounds.width > 0 else { call.resolve(["items": [:]]); return }
            let scale = width / webView.bounds.width
            let ids = Set(call.getArray("ids", String.self) ?? [])
            let measured = NativeUIVerticalBarsGeometry.measure(in: rail.view, relativeTo: webView, ids: ids)
            var items = measured.mapValues { frame in
                ["x": frame.minX * scale, "y": frame.minY * scale,
                 "width": frame.width * scale, "height": frame.height * scale]
            }
            for (id, surface) in rail.measuredFrames(relativeTo: webView) where ids.contains(id) {
                items[id] = ["x": surface.frame.minX * scale, "y": surface.frame.minY * scale,
                             "width": surface.frame.width * scale, "height": surface.frame.height * scale,
                             "cornerRadius": surface.cornerRadius * scale]
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

    @MainActor private func extensionContent(_ node: NativeUIControl, viewportWidth: CGFloat, scale: CGFloat) throws -> AnyView {
        guard let data = node.extensionContent else { throw NativeUIError.unavailable }
        let session = extensionSessions[node.id] ?? UUID()
        extensionSessions[node.id] = session
        let actions = NativeUIActions(availableNames: Set(data.actions.keys)) { [weak self] name in
            guard let self, self.extensionNodes[node.id] == node, self.extensionSessions[node.id] == session, let target = data.actions[name] else {
                throw NativeUIError.unavailable
            }
            try await self.extensionActions.perform(owner: node.id) { request in
                self.sequence += 1
                self.notifyListeners("activate", data: ["id": target, "revision": self.revision,
                    "sequence": self.sequence, "requestId": request])
            }
        }
        let context = NativeUIContext(node: node, viewportWidth: viewportWidth, pointsPerCSSPixel: scale)
        return AnyView(try NativeUI.content(data, actions: actions, context: context)
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
                self.resetCoveredSnapshots()
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
        else if let control { NativeUICrossfade.retire(control, duration: duration) }
        fingerprints.removeValue(forKey: id)
        pendingTabSelections.removeValue(forKey: id)
        pendingTabExpiryWorks.removeValue(forKey: id)?.cancel()
    }

    private func removeControls(duration: TimeInterval = 0) {
        scrollBindings.reset()
        snapshotControls = []
        toolbarTransition?.restore()
        toolbarTransition = nil
        extensionActions.cancel()
        extensionNodes.removeAll()
        extensionSessions.removeAll()
        Array(controls.keys).forEach { removeControl($0, duration: duration) }
        host?.removeFromSuperview()
        host = nil
        verticalBars?.detach(duration: duration)
        verticalBars = nil
        modalAnimationID = nil
        rendering.clear()
        pendingTabSelections.removeAll()
        pendingTabExpiryWorks.values.forEach { $0.cancel() }
        pendingTabExpiryWorks.removeAll()
    }

    private func syncTabBar(_ tabBar: UITabBar, id: String, node: NativeUIControl) {
        var pending = pendingTabSelections[id]
        NativeUITabBar.update(tabBar, node: node, rendering: rendering, pendingSelection: &pending)
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

    @objc func setToolbarTransitionProgress(_ call: CAPPluginCall) {
        guard let id = call.getInt("id"), let progress = call.getDouble("progress"), progress.isFinite, (0...1).contains(progress) else {
            call.reject("Invalid toolbar progress"); return
        }
        DispatchQueue.main.async { [weak self] in
            if let transition = self?.toolbarTransition, transition.id == id { transition.setProgress(progress) }
            call.resolve()
        }
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
            guard let snapshot = try? call.decode(NativeUISnapshot.self), snapshot.isValid else {
                call.reject("Invalid control snapshot"); return
            }
            self.coveredSnapshots.restoreControls()
            if snapshot.coveredSnapshotToken == nil && self.coveredSnapshots.covering {
                _ = self.coveredSnapshots.restore(in: webView)
            }
            defer {
                if snapshot.coveredSnapshotToken == nil {
                    self.coveredSnapshots.finishCovering()
                }
            }
            if self.toolbarTransition?.id != snapshot.toolbarTransition?.id {
                self.toolbarTransition?.restore()
                self.toolbarTransition = nil
            }
            self.notifyWebViewMetricsChange()
            let duration = NativeUICrossfade.duration(snapshot.transitionDuration)
            var tabBarWidths: [String: CGFloat] = [:]
            var existing = Set(self.controls.keys)
            let pendingVerticalNavigation = snapshot.verticalBarNavigationPhase != nil && self.verticalBars != nil
            let verticalBars = snapshot.controls.filter { $0.placement == .verticalBars }
            let accessories = snapshot.controls.filter { $0.extensionContent?.tabBarId != nil }
            var snapshots = snapshot.controls.filter { $0.placement != .verticalBars && $0.extensionContent?.tabBarId == nil }
            if let transition = snapshot.toolbarTransition {
                let sources = snapshots.filter { transition.sourceIds.contains($0.id) }
                snapshots += transition.destination.filter { target in
                    !snapshots.contains { $0.id == target.id } &&
                    !sources.contains { $0.transitionId != nil && $0.transitionId == target.transitionId }
                }
            }
            let extensionIDs = Set(snapshot.controls.filter { $0.kind == .extension }.map(\.id))
            for id in Array(self.extensionNodes.keys) where !extensionIDs.contains(id) {
                self.extensionActions.cancel(owner: id)
                self.extensionNodes.removeValue(forKey: id)
                self.extensionSessions.removeValue(forKey: id)
            }
            let verticalSearchActive = verticalBars.contains { $0.search.map { $0.available && $0.active } ?? false }
            let width = snapshot.viewportWidth
            self.revision = next
            if !pendingVerticalNavigation && snapshots.isEmpty && verticalBars.isEmpty && accessories.isEmpty && (snapshot.toolbarTransition?.destination.isEmpty ?? true) {
                self.removeControls(duration: duration)
                call.resolve(["revision": next]); return
            }
            let scale = webView.bounds.width / width
            existing.formUnion(NativeUIButton.reassociate(snapshots, controls: &self.controls, fingerprints: &self.fingerprints))
            let retained = Set(snapshots.map(\.id))
            for id in Array(self.controls.keys) where !retained.contains(id) {
                self.removeControl(id, duration: duration)
            }
            var rejectedControls: [String] = []
            // Rebind only on a layout snapshot, never on native scroll ticks.
            rejectedControls += self.scrollBindings.replace(
                snapshots.map { NativeUIScrollNode(id: $0.id, scroll: $0.scroll) }, in: webView, scale: scale
            ) { [weak self, weak webView] id, frame, clip in
                guard let self, let webView, !self.coveredSnapshots.hidesNativeControls, !self.keyboardVisible,
                      self.extensionNodes[id]?.scroll != nil, let controller = self.extensionControllers[id], let parent = controller.view.superview else { return }
                controller.place(webView.convert(frame, to: parent), clip: clip.isNull ? .null : webView.convert(clip, to: parent))
            }
            var fabs: [(NativeUIFab, NativeUIControl)] = []
            var searches: [(NativeUISearchControlling, NativeUIControl, CGRect, CGRect, UIView?, Bool)] = []
            var rejectedSearches: [String] = []
            let enteringVerticalBars = self.verticalBars == nil
            if (verticalBars.isEmpty && !pendingVerticalNavigation) || (self.keyboardVisible && !verticalSearchActive) {
                self.verticalBars?.detach(duration: duration)
                self.verticalBars = nil
                self.modalAnimationID = nil
                if self.keyboardVisible { rejectedControls.append(contentsOf: verticalBars.map(\.id)) }
            } else if let owner = self.bridge?.viewController {
                let rail = self.verticalBars ?? NativeUIVerticalBarsController(
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
                rail.view.isHidden = false
                if enteringVerticalBars && snapshot.modalAnimation == nil { NativeUICrossfade.enter(rail.view, duration: duration) }
            } else {
                rejectedControls.append(contentsOf: verticalBars.map(\.id))
            }
            // A system tab host has one accessory slot. Ambiguous owners stay on the Web.
            var accessoryContent: AnyView?
            for node in accessories {
                guard #available(iOS 26.1, *), accessories.count == 1, !self.keyboardVisible, self.verticalBars != nil,
                      verticalBars.filter({ $0.kind == .tabBar }).map(\.id) == [node.extensionContent!.tabBarId!],
                      let content = try? self.extensionContent(node, viewportWidth: width, scale: scale) else {
                    rejectedControls.append(node.id)
                    self.extensionNodes.removeValue(forKey: node.id)
                    self.extensionSessions.removeValue(forKey: node.id)
                    self.extensionActions.cancel(owner: node.id)
                    continue
                }
                self.extensionNodes[node.id] = node
                accessoryContent = AnyView(content.background(NativeUICoveredSnapshotAnchor(id: node.id)))
            }
            // Publish toolbar, tabs and accessory together so the hosting tree receives
            // one animation transaction. The shell owns only the initial crossfade.
            self.verticalBars?.apply(verticalBars, rendering: self.rendering, edge: snapshot.verticalBarEdge ?? "right",
                                     animated: !enteringVerticalBars && snapshot.modalAnimation == nil && !self.coveredSnapshots.covering, accessory: accessoryContent, navigation: snapshot.verticalBarNavigation ?? [], navigationPhase: snapshot.verticalBarNavigationPhase)
            self.verticalBars?.view.isUserInteractionEnabled = snapshot.modalAnimation == nil
            if let layer = self.verticalBars?.view.layer {
                if let motion = snapshot.modalAnimation {
                    if self.modalAnimationID != motion.id {
                        self.modalAnimationID = motion.id
                        let translate = CABasicAnimation(keyPath: "transform.translation.y")
                        translate.fromValue = motion.fromY * scale
                        translate.toValue = 0
                        let opacity = CABasicAnimation(keyPath: "opacity")
                        opacity.fromValue = motion.opacity
                        opacity.toValue = 1
                        let group = CAAnimationGroup()
                        group.animations = [translate, opacity]
                        group.duration = motion.duration / 1000
                        translate.duration = group.duration
                        opacity.duration = group.duration
                        group.timingFunction = CAMediaTimingFunction(controlPoints: Float(motion.easing[0]), Float(motion.easing[1]), Float(motion.easing[2]), Float(motion.easing[3]))
                        let elapsed = max(0, Date().timeIntervalSince1970 - motion.startedAt / 1000)
                        group.beginTime = layer.convertTime(CACurrentMediaTime(), from: nil) - elapsed
                        layer.add(group, forKey: "native-ui-modal-entry")
                    }
                } else {
                    self.modalAnimationID = nil
                    layer.removeAnimation(forKey: "native-ui-modal-entry")
                }
            }

            if snapshots.isEmpty && (snapshot.toolbarTransition?.destination.isEmpty ?? true) {
                self.host?.removeFromSuperview()
                self.host = nil
                self.snapshotControls = snapshot.controls.filter { !rejectedControls.contains($0.id) }
                call.resolve(["revision": next, "rejectedControls": rejectedControls])
                return
            }
            let host = self.host ?? NativeUIHost()
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
                        if !rejectedControls.contains(id) { rejectedControls.append(id) }
                    }
                    // Only native search owns its keyboard; other controls return to Web.
                    if self.keyboardVisible && self.searchControllers[id]?.ownsKeyboard != true {
                        reject(); continue
                    }
                    let local = node.frame.rect
                    let bounds = webView.convert(CGRect(x: local.minX * scale, y: local.minY * scale,
                                                       width: local.width * scale, height: local.height * scale), to: parent)
                    if node.kind == .extension {
                        if rejectedControls.contains(id) { reject(); continue }
                        guard let owner = self.bridge?.viewController, let content = try? self.extensionContent(node, viewportWidth: width, scale: scale) else {
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
                            let controller = NativeUIExtensionController(content: content, owner: owner)
                            self.extensionControllers[id] = controller
                            self.controls[id] = controller.view
                        }
                        self.extensionNodes[id] = node
                        self.extensionControllers[id]?.place(parent.convert(bounds, to: owner.view))
                        self.controls[id]?.overrideUserInterfaceStyle = node.dark ? .dark : .light
                        continue
                    }
                    if let search = node.search {
                        guard let owner = self.bridge?.viewController else { rejectedSearches.append(id); continue }
                        let controller: NativeUISearchControlling
                        let previousCover = self.controls[id]
                        let replacing = self.searchControllers[id]
                        if let existing = replacing { controller = existing }
                        else {
                            // Keep the ordinary UITabBar cover until the search controller applies.
                            controller = NativeUISearchController()
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
                        if node.kind == NativeUIFab.kind {
                            let fab = (self.controls[id] as? NativeUIFab) ?? NativeUIFab()
                            if fab.superview == nil { host.addSubview(fab) }
                            self.controls[id] = fab
                            fabs.append((fab, node))
                        } else if NativeUIButton.kinds.contains(node.kind), let button = self.controls[id] as? UIButton {
                            _ = NativeUIButton.make(node, existing: button, rendering: self.rendering,
                                                    activate: { [weak self] id in self?.activate(id) })
                        } else if let segment = self.controls[id] as? NativeUISegment, node.kind == NativeUISegment.kind {
                            segment.update(node, scale: scale, rendering: self.rendering)
                        } else if let tabBar = self.controls[id] as? UITabBar, node.kind == NativeUITabBar.kind {
                            self.syncTabBar(tabBar, id: id, node: node)
                        } else {
                            guard let control = NativeUIComponents.make(node, scale: scale, rendering: self.rendering, tabDelegate: self,
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
                        guard NativeUITabBar.fit(tabBar, node: node, bounds: bounds) else { reject(); continue }
                        if let content = NativeUITabBar.contentFrame(tabBar) { tabBarWidths[id] = content.width / scale }
                    } else if control.frame != bounds && !(self.toolbarTransition?.controlIds.contains(id) ?? false) {
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
                    if let measured = controller.restingTabWidth { tabBarWidths[id] = measured / scale }
                    controller.surface.isHidden = self.keyboardVisible && !controller.ownsKeyboard
                }
            }
            self.scrollBindings.update()
            for (id, control) in self.controls where !existing.contains(id) && self.searchControllers[id] == nil {
                NativeUICrossfade.enter(control, duration: duration)
            }
            if let prepared = snapshot.toolbarTransition {
                if self.toolbarTransition == nil {
                    let origin = webView.convert(webView.bounds.origin, to: host)
                    self.toolbarTransition = NativeUIToolbarTransition(prepared, sources: snapshots, controls: self.controls,
                        scale: scale, origin: origin, rendering: self.rendering)
                } else if let transition = self.toolbarTransition { transition.setProgress(transition.progress) }
            }
            self.snapshotControls = snapshot.controls.filter { !rejectedControls.contains($0.id) }
            let complete = {
                var result: [String: Any] = ["revision": next, "rejectedSearches": rejectedSearches, "rejectedControls": rejectedControls, "tabBarWidths": tabBarWidths]
                if let transition = self.toolbarTransition { result["toolbarTransition"] = transition.id }
                call.resolve(result)
            }
            if let coordinator = searches.first?.0.transitionCoordinator,
               coordinator.animate(alongsideTransition: nil, completion: { _ in complete() }) { return }
            complete()

        }
    }

    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard item.isEnabled, let itemId = item.accessibilityIdentifier else { return }
        if let controlId = controls.first(where: { $0.value === tabBar })?.key {
            let pending = NativeUITabBar.PendingSelection.start(itemId)
            pendingTabSelections[controlId] = pending
            schedulePendingTabExpiry(controlId, until: pending.until)
        }
        activate(itemId)
    }

    private func searchChanged(_ id: String, phase: NativeUISearchPhase, value: String,
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
