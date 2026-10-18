import SwiftUI
import UIKit

/// App-local SwiftUI renderers. Register once before enabling the shell from JavaScript.
@MainActor public enum NativeUIShell {
    private static var renderers: [String: (String, NativeUIActions, NativeUIContext) throws -> AnyView] = [:]

    /// The name must match defineNativeUI in the application's TypeScript source.
    public static func register<Props: Decodable, Content: View>(
        _ name: String, @ViewBuilder content: @escaping (Props, NativeUIActions) -> Content
    ) throws {
        try register(name) { (props: Props, actions: NativeUIActions, _: NativeUIContext) in
            content(props, actions)
        }
    }

    /// Receives source geometry and presentation state on every accepted snapshot.
    public static func register<Props: Decodable, Content: View>(
        _ name: String, @ViewBuilder content: @escaping (Props, NativeUIActions, NativeUIContext) -> Content
    ) throws {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, renderers[name] == nil else {
            throw NativeUIError.duplicateRegistration
        }
        renderers[name] = { json, actions, context in
            let props = try JSONDecoder().decode(Props.self, from: Data(json.utf8))
            return AnyView(content(props, actions, context))
        }
    }

    static var names: [String] { renderers.keys.sorted() }

    static func content(_ data: ShellExtension, actions: NativeUIActions, context: NativeUIContext) throws -> AnyView {
        guard let renderer = renderers[data.name] else { throw NativeUIError.unavailable }
        return try renderer(data.props, actions, context)
    }
}

/// Read-only metadata for a projected Web source. Shell still owns its placement.
public struct NativeUIContext {
    public enum Placement: String { case element, tabAccessory = "tab-accessory" }

    /// Opaque identity stable for this source's current lifetime; not its HTML id.
    public let sourceID: String
    /// getBoundingClientRect(), in CSS pixels relative to the Web viewport.
    public let sourceFrame: CGRect
    /// The same source rectangle in WKWebView-local UIKit points, not screen coordinates.
    public let sourceFrameInWebView: CGRect
    /// CSS viewport width used to convert the snapshot into native coordinates.
    public let viewportWidth: CGFloat
    /// UIKit points per CSS pixel. This is not the device's pixel density.
    public let pointsPerCSSPixel: CGFloat
    public let placement: Placement
    public let colorScheme: ColorScheme
    public let layoutDirection: LayoutDirection

    init(node: ShellControl, viewportWidth: CGFloat, pointsPerCSSPixel: CGFloat) {
        sourceID = node.id
        sourceFrame = node.frame.rect
        sourceFrameInWebView = node.frame.rect.applying(
            CGAffineTransform(scaleX: pointsPerCSSPixel, y: pointsPerCSSPixel))
        self.viewportWidth = viewportWidth
        self.pointsPerCSSPixel = pointsPerCSSPixel
        placement = node.extensionContent?.tabBarId == nil ? .element : .tabAccessory
        colorScheme = node.dark ? .dark : .light
        layoutDirection = node.rtl ? .rightToLeft : .leftToRight
    }
}

public enum NativeUIError: Error {
    case duplicateRegistration, unavailable, rejected, timedOut
}

/// Completion means the original Web element received its click, not that the
/// application's asynchronous work triggered by that click has finished.
@MainActor public struct NativeUIActions {
    let dispatch: (String) async throws -> Void
    /// Names of currently visible, enabled DOM targets supplied by the reader.
    public let availableNames: Set<String>

    init(availableNames: Set<String> = [], dispatch: @escaping (String) async throws -> Void) {
        self.availableNames = availableNames
        self.dispatch = dispatch
    }

    public func isAvailable(_ name: String) -> Bool { availableNames.contains(name) }

    public func activate(_ name: String) async throws {
        try Task.checkCancellation()
        try await dispatch(name)
    }
}

struct ShellExtension: Decodable, Equatable {
    let name: String
    let props: String
    let actions: [String: String]
    let tabBarId: String?

    var isValid: Bool {
        !name.isEmpty && props.utf8.count <= 262144 && actions.count <= 30 &&
        actions.allSatisfy { !$0.key.isEmpty && !$0.value.isEmpty } &&
        (tabBarId.map { !$0.isEmpty } ?? true) &&
        (try? JSONSerialization.jsonObject(with: Data(props.utf8))) is [String: Any]
    }
}

/// Owns pending native -> Web calls independently of the View's lifetime.
@MainActor final class ShellExtensionActions {
    private struct Pending {
        let owner: String
        let continuation: CheckedContinuation<Void, Error>
        let deadline: DispatchWorkItem
    }
    private var pending: [String: Pending] = [:]

    func perform(owner: String, timeout: TimeInterval = 4, send: (String) -> Void) async throws {
        let request = UUID().uuidString
        try await withTaskCancellationHandler {
            try Task.checkCancellation()
            try await withCheckedThrowingContinuation { continuation in
                let deadline = DispatchWorkItem { [weak self] in self?.finish(request, error: NativeUIError.timedOut) }
                pending[request] = Pending(owner: owner, continuation: continuation, deadline: deadline)
                DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: deadline)
                send(request)
            }
        } onCancel: {
            Task { @MainActor [weak self] in self?.finish(request, error: CancellationError()) }
        }
    }

    func finish(_ request: String, error: Error? = nil) {
        guard let call = pending.removeValue(forKey: request) else { return }
        call.deadline.cancel()
        if let error { call.continuation.resume(throwing: error) }
        else { call.continuation.resume() }
    }

    func cancel(owner: String? = nil) {
        for (request, call) in pending where owner == nil || call.owner == owner {
            finish(request, error: NativeUIError.unavailable)
        }
    }
}

/// Normal UIViewController containment keeps SwiftUI appearance and teardown intact.
@MainActor final class ShellExtensionController {
    let controller: UIHostingController<AnyView>
    var view: UIView { controller.view }

    init(content: AnyView, owner: UIViewController) {
        controller = UIHostingController(rootView: content)
        controller.view.backgroundColor = .clear
        if #available(iOS 16.4, *) { controller.safeAreaRegions = [] }
        owner.addChild(controller)
        // Capacitor can use WKWebView as its controller's root view. A sibling
        // shell surface is outside that controller's containment hierarchy.
        owner.view.addSubview(controller.view)
        controller.didMove(toParent: owner)
    }

    func update(_ content: AnyView) { controller.rootView = content }
    func detach(duration: TimeInterval) {
        controller.willMove(toParent: nil)
        ShellCrossfade.retire(controller.view, duration: duration)
        controller.removeFromParent()
    }
}

@available(iOS 26.0, *)
struct ShellExtensionAccessory: ViewModifier {
    let content: AnyView?
    func body(content base: Content) -> some View {
        if #available(iOS 26.1, *) {
            base.tabViewBottomAccessory(isEnabled: content != nil) { content }
        } else { base }
    }
}
