import Capacitor
import UIKit
import WebKit

@objc(IonicNativeUIShellPlugin)
public class IonicNativeUIShellPlugin: CAPPlugin, CAPBridgedPlugin, UITabBarDelegate {
    public let identifier = "IonicNativeUIShellPlugin"
    public let jsName = "IonicNativeUIShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDeviceLayout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startDeviceLayoutMonitoring", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopDeviceLayoutMonitoring", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]
    private var host: ShellHost?
    private var verticalBars: ShellVerticalBarsControlling?
    private var controls: [String: UIView] = [:]
    private var searchControllers: [String: ShellSearchControlling] = [:]
    private var fingerprints: [String: ShellControl] = [:]
    private let rendering = ShellRendering()
    private var revision = 0
    private var sequence = 0
    private var keyboardVisible = false
    private var pendingTabSelections: [String: ShellTabBar.PendingSelection] = [:]
    private var pendingTabExpiryWorks: [String: DispatchWorkItem] = [:]
    private var restoreTopEdge: (() -> Void)?
    private var observers: [NSObjectProtocol] = []
    private var lastVerticalBarEdge: String?
    private var lastVerticalBarInset: CGFloat = 0
    private var verticalBarPlacementObserved = false
    private weak var observedVerticalBarView: UIView?
    private var unregisterVerticalBarObservation: (() -> Void)?
    private weak var observedHingeView: UIView?
    private var hingeInteraction: UIInteraction?
    private var hingeStatus: String?
    private var deviceLayoutMonitoring = 0
    private var lastDeviceLayout: String?

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
                }
                var searchOwnsKeyboard = false
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
                    self.notifyVerticalBarPlacementChange()
                }
            })
        }
        for name in [UIApplication.didBecomeActiveNotification, UIResponder.keyboardDidHideNotification,
                     UIDevice.orientationDidChangeNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                if name == UIResponder.keyboardDidHideNotification { self?.keyboardVisible = false }
                self?.bridge?.triggerWindowJSEvent(eventName: "nativeUIShellRefresh", data: name == UIApplication.didBecomeActiveNotification ? "{\"retireSearch\":true}" : "{}")
                if name == UIApplication.didBecomeActiveNotification { self?.notifyWebViewMetricsChange() }
                if name == UIApplication.didBecomeActiveNotification { self?.notifyVerticalBarPlacementChange() }
                if name == UIApplication.didBecomeActiveNotification { self?.refreshHingeStatus() }
            })
        }
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    private func stopDeviceLayoutObservation() {
        unregisterVerticalBarObservation?()
        unregisterVerticalBarObservation = nil
        observedVerticalBarView = nil
        if let interaction = hingeInteraction {
            observedHingeView?.removeInteraction(interaction)
        }
        hingeInteraction = nil
        observedHingeView = nil
    }

    private func webViewMetrics() -> JSObject? {
        guard #available(iOS 26.0, *), let webView = bridge?.webView else { return nil }
        webView.layoutIfNeeded()
        return ["radius": Double(webView.effectiveRadius(corner: .topLeft))]
    }

    private func notifyWebViewMetricsChange() {
        notifyDeviceLayoutChange()
    }

    private func deviceLayout() -> JSObject {
        var layout: JSObject = ["placement": verticalBarPlacement(),
                                "webViewMetrics": webViewMetrics() ?? ["radius": 0]]
        layout["hingeStatus"] = hingeStatus ?? NSNull()
        return layout
    }

    private func notifyDeviceLayoutChange() {
        guard deviceLayoutMonitoring > 0 else { return }
        let layout = deviceLayout()
        let fingerprint = "\(verticalBarEdge() ?? "none"):\(verticalBarInset(for: verticalBarEdge())):\(hingeStatus ?? "none"):\(webViewMetrics()?["radius"] ?? 0)"
        guard fingerprint != lastDeviceLayout else { return }
        lastDeviceLayout = fingerprint
        notifyListeners("deviceLayoutChange", data: layout)
    }

    @objc func getDeviceLayout(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.observeVerticalBarPlacement()
            self?.observeHingeStatus()
            self?.refreshHingeStatus()
            DispatchQueue.main.async {
                call.resolve(self?.deviceLayout() ?? ["placement": ["edge": NSNull(), "inset": 0], "hingeStatus": NSNull(), "webViewMetrics": ["radius": 0]])
                if self?.deviceLayoutMonitoring == 0 { self?.stopDeviceLayoutObservation() }
            }
        }
    }

    @objc func startDeviceLayoutMonitoring(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.deviceLayoutMonitoring += 1
            self?.lastDeviceLayout = nil
            self?.observeVerticalBarPlacement()
            self?.observeHingeStatus()
            self?.refreshHingeStatus()
            call.resolve()
        }
    }

    @objc func stopDeviceLayoutMonitoring(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            if let self, self.deviceLayoutMonitoring > 0 {
                self.deviceLayoutMonitoring -= 1
                if self.deviceLayoutMonitoring == 0 {
                    self.lastDeviceLayout = nil
                    self.stopDeviceLayoutObservation()
                }
            }
            call.resolve()
        }
    }

    // Logical edge in the reading direction, matching UIVerticalBarEdge.
    private func verticalBarEdge() -> String? {
        #if canImport(UIKit, _underlyingVersion: 9127.0.85) && !targetEnvironment(macCatalyst)
        if #available(iOS 27.1, *), let webView = bridge?.webView {
            switch webView.traitCollection.verticalBarEdge {
            case .leading: return "leading"
            case .trailing: return "trailing"
            default: break
            }
        }
        #endif
        // Toolchains older than the verticalBarEdge trait still expose the rail
        // as a deep safe-area inset on the physical edge (iPhone Duo reserves
        // ~80pt; ordinary iPhones stay below 70pt even in landscape).
        guard let webView = bridge?.webView else { return nil }
        webView.layoutIfNeeded()
        let rtl = webView.effectiveUserInterfaceLayoutDirection == .rightToLeft
        if webView.safeAreaInsets.right >= 70 { return rtl ? "leading" : "trailing" }
        if webView.safeAreaInsets.left >= 70 { return rtl ? "trailing" : "leading" }
        return nil
    }

    private func verticalBarInset(for edge: String?) -> CGFloat {
        guard let edge, let webView = bridge?.webView else { return 0 }
        webView.layoutIfNeeded()
        let rtl = webView.effectiveUserInterfaceLayoutDirection == .rightToLeft
        let physicalRight = (edge == "trailing") != rtl
        return physicalRight ? webView.safeAreaInsets.right : webView.safeAreaInsets.left
    }

    private func verticalBarPlacement() -> JSObject {
        if let edge = verticalBarEdge() { return ["edge": edge, "inset": Double(verticalBarInset(for: edge))] }
        return ["edge": NSNull(), "inset": 0]
    }

    private func notifyVerticalBarPlacementChange() {
        let edge = verticalBarEdge()
        let inset = verticalBarInset(for: edge)
        guard !verticalBarPlacementObserved || edge != lastVerticalBarEdge || abs(inset - lastVerticalBarInset) > 0.5 else { return }
        verticalBarPlacementObserved = true
        lastVerticalBarEdge = edge
        lastVerticalBarInset = inset
        notifyDeviceLayoutChange()
    }

    private func observeVerticalBarPlacement() {
        #if canImport(UIKit, _underlyingVersion: 9127.0.85) && !targetEnvironment(macCatalyst)
        if #available(iOS 27.1, *), let webView = bridge?.webView, observedVerticalBarView !== webView {
            unregisterVerticalBarObservation?()
            observedVerticalBarView = webView
            let traits: [UITrait] = [UITraitLayoutDirection.self] + UITraitCollection.systemTraitsAffectingVerticalBarEdge
            let registration = webView.registerForTraitChanges(traits) { [weak self] (_: UIView, _: UITraitCollection) in
                self?.notifyVerticalBarPlacementChange()
            }
            unregisterVerticalBarObservation = { [weak webView] in webView?.unregisterForTraitChanges(registration) }
        }
        #endif
        notifyVerticalBarPlacementChange()
    }

    private func observeHingeStatus() {
        #if canImport(UIKit, _underlyingVersion: 9127.0.85) && !targetEnvironment(macCatalyst)
        if #available(iOS 27.1, *), let webView = bridge?.webView, observedHingeView !== webView {
            if let interaction = hingeInteraction {
                observedHingeView?.removeInteraction(interaction)
            }
            observedHingeView = webView
            let interaction = UIHingeInteraction { [weak self] _, update in
                let status: String?
                switch update.hinge?.status {
                case .closed: status = "closed"
                case .partiallyOpen: status = "partiallyOpen"
                case .fullyOpen: status = "fullyOpen"
                default: status = nil
                }
                guard status != self?.hingeStatus else { return }
                self?.hingeStatus = status
                self?.notifyDeviceLayoutChange()
            }
            hingeInteraction = interaction
            webView.addInteraction(interaction)
        }
        #endif
    }

    private func refreshHingeStatus() {
        #if canImport(UIKit, _underlyingVersion: 9127.0.85) && !targetEnvironment(macCatalyst)
        if #available(iOS 27.1, *), let interaction = hingeInteraction as? UIHingeInteraction {
            interaction.isEnabled = false
            interaction.isEnabled = true
        }
        #endif
    }

    @objc func configure(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.observeVerticalBarPlacement()
            // A new JS context starts revision numbering again (live reload / navigation).
            self?.restoreTopEdge?()
            self?.restoreTopEdge = nil
            self?.removeControls()
            self?.revision = 0
            if #available(iOS 26.0, *) {
                self?.bridge?.webView?.layoutIfNeeded()
                // Ionic already paints the header edge; a second native effect can
                // add a dark scrim when the OS and Web themes differ.
                if call.getBool("verticalBarsOnly") != true, let effect = self?.bridge?.webView?.scrollView.topEdgeEffect {
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

    private func removeControl(_ id: String, duration: TimeInterval = 0) {
        searchControllers.removeValue(forKey: id)?.detach()
        if let control = controls.removeValue(forKey: id) { ShellCrossfade.retire(control, duration: duration) }
        fingerprints.removeValue(forKey: id)
        pendingTabSelections.removeValue(forKey: id)
        pendingTabExpiryWorks.removeValue(forKey: id)?.cancel()
    }

    private func removeControls(duration: TimeInterval = 0) {
        Array(controls.keys).forEach { removeControl($0, duration: duration) }
        host?.removeFromSuperview()
        host = nil
        verticalBars?.detach()
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
            let duration = ShellCrossfade.duration(snapshot.transitionDuration)
            let existing = Set(self.controls.keys)
            let verticalBars = snapshot.controls.filter { $0.placement == .verticalBars }
            let snapshots = snapshot.controls.filter { $0.placement != .verticalBars }
            let width = snapshot.viewportWidth
            self.revision = next
            if snapshots.isEmpty && verticalBars.isEmpty {
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
            if verticalBars.isEmpty || self.keyboardVisible {
                self.verticalBars?.detach()
                self.verticalBars = nil
                if self.keyboardVisible { rejectedControls.append(contentsOf: verticalBars.map(\.id)) }
            } else if let owner = self.bridge?.viewController {
                let rail = self.verticalBars ?? ShellVerticalBarsController(activate: { [weak self] id in self?.activate(id) })
                self.verticalBars = rail
                rail.attach(to: owner, in: owner.view)
                rail.apply(verticalBars, rendering: self.rendering, edge: snapshot.verticalBarEdge ?? "right")
                rail.view.isHidden = false
            } else {
                rejectedControls.append(contentsOf: verticalBars.map(\.id))
            }
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

    private func activate(_ id: String) {
        sequence += 1
        notifyListeners("activate", data: ["id": id, "revision": revision, "sequence": sequence])

    }
}
