import UIKit
import WebKit

/// One fixed DOM fallback and its native view. The plugin retains this registration.
/// Existing notifyListeners events drive projection; no public plugin method is intercepted.
public final class NativeUIProjection: NSObject, WKScriptMessageHandler {
    public struct ReceiveListeners {
        public struct Projection {
            public let native: [String]
            public let web: [String]
            public let none: [String]
            public init(native: [String] = [], web: [String] = [], none: [String] = []) {
                self.native = native; self.web = web; self.none = none
            }
        }
        public let update: [String]
        public let projection: Projection
        public let match: [String: Any]
        public init(update: [String] = [], projection: Projection = .init(), match: [String: Any] = [:]) {
            self.update = update; self.projection = projection; self.match = match
        }
        fileprivate var configuration: [String: Any] {
            ["update": update, "projection": ["native": projection.native, "web": projection.web, "none": projection.none], "match": match]
        }
    }
    private weak var webView: WKWebView?
    private let views: () -> [String: UIView]
    private let snapshots: NativeUICoveredSnapshots
    private let scrolling = NativeUIScrollBindings()
    private var masks: [String: CAShapeLayer] = [:]
    private let id = "nativeUI" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
    private let origins: Set<String>
    private let canCapture: () -> Bool
    private var script: WKUserScript?
    private var documentID: String?
    private var destination = "native"
    private var connected = false
    private var restoreAccepted = true
    private var hiddenByProjection: [UIView] = []
    private var visible = true
    private var closed = false
    private struct Anchor { let native: CGRect; let image: CGRect }
    private var anchors: [String: [String: Anchor]] = [:]
    private var captured: [String: [String: UIView]] = [:]

    public convenience init(webView: WKWebView?, plugin: String, projectionSelector: String,
                receiveListeners: ReceiveListeners = .init(),
                allowedOrigins: Set<String> = ["capacitor://localhost", "https://localhost", "http://localhost"],
                canCapture: @escaping () -> Bool = { true }, view: @escaping () -> UIView?) throws {
        try self.init(webView: webView, plugin: plugin, projectionSelector: projectionSelector,
                      receiveListeners: receiveListeners, allowedOrigins: allowedOrigins,
                      canCapture: canCapture, snapshots: NativeUICoveredSnapshots(), view: view)
    }
    init(webView: WKWebView?, plugin: String, projectionSelector: String,
         receiveListeners: ReceiveListeners = .init(),
         allowedOrigins: Set<String> = ["capacitor://localhost", "https://localhost", "http://localhost"],
         canCapture: @escaping () -> Bool = { true }, snapshots: NativeUICoveredSnapshots,
         view: @escaping () -> UIView?) throws {
        self.snapshots = snapshots
        guard let webView else { throw ProjectionError.missingWebView }
        self.webView = webView; self.views = { view().map { ["view": $0] } ?? [:] }; self.origins = allowedOrigins; self.canCapture = canCapture
        super.init()
        precondition(Thread.isMainThread)
        guard !projectionSelector.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw ProjectionError.invalidConfiguration }
        let config: [String: Any] = ["id": id, "plugin": plugin, "projectionSelector": projectionSelector,
                                     "receiveListeners": receiveListeners.configuration]
        let json = String(data: try JSONSerialization.data(withJSONObject: config), encoding: .utf8)!
        let allowed = String(data: try JSONSerialization.data(withJSONObject: Array(allowedOrigins)), encoding: .utf8)!
        let runtime = try Self.runtime()
        let source = "if (\(allowed).includes(location.origin)) { if (!globalThis.CapacitorNativeUIEngineRuntime) { \(runtime) } CapacitorNativeUIEngineRuntime.start(\(json)).catch(console.error); }"
        let script = WKUserScript(source: source, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        self.script = script
        webView.configuration.userContentController.add(WeakProjectionHandler(self), name: id)
        webView.configuration.userContentController.addUserScript(script)
        webView.evaluateJavaScript(source, completionHandler: nil)
    }
    private enum ProjectionError: Error { case missingWebView, invalidConfiguration, missingRuntime }
    private static func runtime() throws -> String {
        #if SWIFT_PACKAGE
        let bundle = Bundle.module
        #else
        let containing = Bundle(for: NativeUIProjection.self)
        let bundle = containing.url(forResource: "CapacitorNativeUIEngine", withExtension: "bundle").flatMap(Bundle.init(url:)) ?? containing
        #endif
        guard let url = bundle.url(forResource: "native-ui-engine", withExtension: "js") else { throw ProjectionError.missingRuntime }
        return try String(contentsOf: url, encoding: .utf8)
    }
    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        let defaultPort = origin.port == 0 || (origin.protocol == "https" && origin.port == 443) || (origin.protocol == "http" && origin.port == 80)
        guard origins.contains("\(origin.protocol)://\(origin.host)" + (defaultPort ? "" : ":\(origin.port)")),
              !closed, message.frameInfo.isMainFrame, let webView,
              let text = message.body as? String, let data = text.data(using: .utf8),
              let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let key = message["key"] as? String, key.hasPrefix(id + ":"),
              let request = message["request"] as? [String: Any] else { return }
        let page = key.split(separator: ":").dropFirst().first.map(String.init)
        if documentID != page { snapshots.reset(); scrolling.reset(); captured.removeAll(); anchors.removeAll(); documentID = page }
        let complete: ([String: Any]) -> Void = { [weak self] value in
            guard let self, !self.closed, self.documentID == page else { return }
            self.reply(key, value)
        }
        let token = request["token"] as? String ?? ""
        switch request["action"] as? String {
        case "connect":
            if !connected { destination = views().values.contains(where: { !$0.isHidden }) ? "native" : "none"; connected = true }
            complete(["destination": destination])
        case "destination":
            if let next = request["destination"] as? String, ["native", "web", "none"].contains(next) { destination = next; connected = true }
            complete([:])
        case "track":
            scrolling.reset()
            for (id, mask) in masks { if views()[id]?.layer.mask === mask { views()[id]?.layer.mask = nil } }
            masks.removeAll()
            guard let raw = request["scroll"] as? [String: Any], let width = request["viewportWidth"] as? Double, width.isFinite, width > 0,
                  let data = try? JSONSerialization.data(withJSONObject: raw),
                  let placement = try? JSONDecoder().decode(NativeUIScrollPlacement.self, from: data), placement.isValid else {
                complete(["tracked": false]); return
            }
            let scale = webView.bounds.width / width
            let current = views()
            guard !current.isEmpty, current.values.allSatisfy({ $0.layer.mask == nil }) else { complete(["tracked": false]); return }
            let nodes = current.map { id, view -> NativeUIScrollNode in
                let frame = view.convert(view.bounds, to: webView)
                return NativeUIScrollNode(id: id, scroll: NativeUIScrollPlacement(id: placement.id,
                    offsetX: placement.offsetX, offsetY: placement.offsetY, viewport: placement.viewport, clip: placement.clip,
                    contentWidth: placement.contentWidth, contentHeight: placement.contentHeight,
                    frame: NativeUIFrame(x: frame.minX/scale-placement.viewport.x+placement.offsetX,
                        y: frame.minY/scale-placement.viewport.y+placement.offsetY, width: frame.width/scale, height: frame.height/scale)))
            }
            let rejected = scrolling.replace(nodes, in: webView, scale: scale) { [weak self, weak webView] id, frame, clip in
                guard let self, let webView, self.visible, !self.snapshots.hidesNativeControls,
                      let view = self.views()[id], current[id] === view, let parent = view.superview else { return }
                let old = view.convert(view.bounds, to: webView)
                let from = parent.convert(CGPoint(x: old.midX, y: old.midY), from: webView)
                let to = parent.convert(CGPoint(x: frame.midX, y: frame.midY), from: webView)
                view.transform.tx += to.x-from.x; view.transform.ty += to.y-from.y
                let mask = self.masks[id] ?? CAShapeLayer()
                self.masks[id] = mask
                mask.frame = view.bounds
                mask.path = UIBezierPath(rect: clip.isNull ? .zero : view.convert(clip, from: webView).intersection(view.bounds)).cgPath
                view.layer.mask = mask
            }
            complete(["tracked": rejected.isEmpty])
        case "prepare":
            guard visible, canCapture(), let ids = request["ids"] as? [String], let width = request["viewportWidth"] as? Double, width.isFinite, width > 0,
                  let window = webView.window else { complete([:]); return }
            let selected = views().filter { ids.contains($0.key) }
            guard selected.count == ids.count else { complete([:]); return }
            snapshots.observe(window) { [weak self] active in self?.reply(nil, ["active": active]) }
            snapshots.prepare(frames: { [weak self, weak webView] in
                guard let self, let webView, self.visible, self.canCapture() else { return [:] }
                let current = self.views()
                guard selected.allSatisfy({ current[$0.key] === $0.value && !$0.value.isHidden && $0.value.window != nil }) else { return [:] }
                return selected.mapValues { $0.convert($0.bounds, to: webView) }
            }, in: webView, viewportWidth: width) { [weak self] result in
                if let self, let token = result["token"] as? String, let parts = result["parts"] as? [[String: Any]] {
                    self.captured[token] = selected
                    let scale = webView.bounds.width / width
                    var entries: [String: Anchor] = [:]
                    for part in parts {
                        guard let ids = part["ids"] as? [String], let x = part["x"] as? CGFloat, let y = part["y"] as? CGFloat,
                              let w = part["width"] as? CGFloat, let h = part["height"] as? CGFloat else { continue }
                        let image = CGRect(x: x*scale, y: y*scale, width: w*scale, height: h*scale)
                        for id in ids { if let view = selected[id] { entries[id] = Anchor(native: view.convert(view.bounds, to: webView), image: image) } }
                    }
                    self.anchors[token] = entries
                }
                complete(result)
            }
        case "cover":
            let selected = captured[token] ?? [:], current = views()
            let valid = visible && canCapture() && !selected.isEmpty && selected.allSatisfy { current[$0.key] === $0.value }
            restoreAccepted = true
            complete(["shown": valid && snapshots.cover(token, in: webView, views: Array(Dictionary(grouping: selected.values, by: { ObjectIdentifier($0) }).values.compactMap { $0.first }), transient: true)])
        case "restore":
            restoreAccepted = false
            guard let width = request["viewportWidth"] as? Double, width.isFinite, width > 0,
                  let parts = request["parts"] as? [[String: Any]] else { complete(["shown": false]); return }
            var frames: [String: CGRect] = [:]
            let scale = webView.bounds.width / width
            for part in parts {
                guard let ids = part["ids"] as? [String], let x = part["x"] as? Double, let y = part["y"] as? Double,
                      let w = part["width"] as? Double, let h = part["height"] as? Double,
                      [x,y,w,h].allSatisfy({ $0.isFinite }), w > 0, h > 0 else { complete(["shown": false]); return }
                for id in ids { frames[id] = CGRect(x: x*scale, y: y*scale, width: w*scale, height: h*scale) }
            }
            guard Set(frames.keys) == snapshots.identifiers(for: token), !frames.isEmpty else { complete(["shown": false]); return }
            let current = views()
            // Preserve renderer-owned constraints. Translation follows the corresponding DOM's movement.
            for (id, frame) in frames {
                guard let view = current[id], captured[token]?[id] === view, let anchor = anchors[token]?[id] else { complete(["shown": false]); return }
                let old = view.convert(view.bounds, to: webView)
                guard abs(old.width-anchor.native.width) < 0.1, abs(old.height-anchor.native.height) < 0.1,
                      abs(frame.width-anchor.image.width) < 0.1, abs(frame.height-anchor.image.height) < 0.1 else { complete(["shown": false]); return }
            }
            for (id, frame) in frames {
                guard let view = current[id], let parent = view.superview, let anchor = anchors[token]?[id] else { continue }
                let old = view.convert(view.bounds, to: webView)
                let from = parent.convert(CGPoint(x: old.midX, y: old.midY), from: webView)
                let to = parent.convert(CGPoint(x: anchor.native.midX+frame.minX-anchor.image.minX,
                                               y: anchor.native.midY+frame.minY-anchor.image.minY), from: webView)
                view.transform.tx += to.x-from.x; view.transform.ty += to.y-from.y
            }
            restoreAccepted = snapshots.restore(in: webView, token: token, frames: frames)
            complete(["shown": restoreAccepted])
        case "resume":
            guard restoreAccepted else { reply(key, [:], error: "Native UI geometry changed"); return }
            snapshots.restoreControls(); snapshots.finishCovering()
            webView.window?.layoutIfNeeded()
            CATransaction.begin()
            CATransaction.setCompletionBlock { complete([:]) }
            views().values.forEach { $0.setNeedsDisplay() }
            CATransaction.commit()
        case "visibility":
            visible = request["visible"] as? Bool ?? false
            snapshots.restoreControls()
            if visible {
                hiddenByProjection.forEach { $0.isHidden = false }; hiddenByProjection.removeAll()
            } else {
                for view in views().values where !view.isHidden {
                    hiddenByProjection.append(view); view.isHidden = true
                }
            }
            complete([:])
        case "painted": snapshots.retireCopy(token); complete([:])
        case "restored": snapshots.retireCopy(token, entry: false); complete([:])
        case "release": snapshots.release(token); captured.removeValue(forKey: token); anchors.removeValue(forKey: token); complete([:])
        case "reset": snapshots.reset(); captured.removeAll(); anchors.removeAll(); complete([:])
        default: complete([:])
        }
    }
    private func reply(_ key: String?, _ value: [String: Any], error: String? = nil) {
        guard !closed else { return }
        let values: [Any] = [id, key as Any? ?? NSNull(), value, error as Any? ?? NSNull()]
        guard let data = try? JSONSerialization.data(withJSONObject: values), let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("globalThis.CapacitorNativeUIEngineRuntime?.receive(...\(json))", completionHandler: nil)
    }
    /// Call with the plugin's teardown. Does not destroy the renderer's views or DOM.
    deinit { destroy() }
    public func destroy() {
        guard !closed else { return }
        closed = true
        webView?.evaluateJavaScript("globalThis.CapacitorNativeUIEngineRuntime?.stop('\(id)')", completionHandler: nil)
        if let controller = webView?.configuration.userContentController {
            controller.removeScriptMessageHandler(forName: id)
            let remaining = controller.userScripts.filter { $0 !== script }
            controller.removeAllUserScripts()
            remaining.forEach { controller.addUserScript($0) }
        }
        snapshots.reset(); scrolling.reset(); captured.removeAll(); anchors.removeAll()
        if destination != "none" { hiddenByProjection.forEach { $0.isHidden = false } }
        hiddenByProjection.removeAll()
        for (id, mask) in masks { if views()[id]?.layer.mask === mask { views()[id]?.layer.mask = nil } }
        masks.removeAll()
    }
}
private final class WeakProjectionHandler: NSObject, WKScriptMessageHandler {
    weak var owner: NativeUIProjection?
    init(_ owner: NativeUIProjection) { self.owner = owner }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        owner?.userContentController(controller, didReceive: message)
    }
}
