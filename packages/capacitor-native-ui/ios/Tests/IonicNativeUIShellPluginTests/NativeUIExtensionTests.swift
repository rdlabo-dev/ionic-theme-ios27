import XCTest
import SwiftUI
import WebKit
@testable import IonicNativeUIShellPlugin

final class NativeUIExtensionTests: XCTestCase {
    struct Props: Decodable { let title: String }

    private func context(width: Double = 120, dark: Bool = false, accessory: Bool = false) throws -> NativeUIContext {
        var content: [String: Any] = ["name": "fixture", "props": "{}", "actions": [:]]
        if accessory { content["tabBarId"] = "tabs" }
        let json: [String: Any] = ["id": "source", "kind": "extension", "x": -4, "y": 30,
            "width": width, "height": 44, "dark": dark, "rtl": dark, "items": [], "extension": content]
        let node = try JSONDecoder().decode(ShellControl.self, from: JSONSerialization.data(withJSONObject: json))
        return NativeUIContext(node: node, viewportWidth: 600, pointsPerCSSPixel: 0.5)
    }

    @MainActor func testContextUpdatesGeometryEnvironmentAndAccessoryPlacement() throws {
        let name = UUID().uuidString
        var received: [NativeUIContext] = []
        try NativeUIShell.register(name) { (props: Props, actions: NativeUIActions, context: NativeUIContext) in
            received.append(context)
            XCTAssertTrue(actions.isAvailable("open"))
            XCTAssertFalse(actions.isAvailable("disabled"))
            return Text(props.title)
        }
        let data = ShellExtension(name: name, props: "{\"title\":\"Ready\"}", actions: ["open": "button"], tabBarId: nil)
        let actions = NativeUIActions(availableNames: ["open"]) { _ in }
        _ = try NativeUIShell.content(data, actions: actions, context: context())
        _ = try NativeUIShell.content(data, actions: actions, context: context(width: 220, dark: true, accessory: true))
        XCTAssertEqual(received.count, 2)
        XCTAssertEqual(received[0].sourceID, "source")
        XCTAssertEqual(received[0].sourceFrame, CGRect(x: -4, y: 30, width: 120, height: 44))
        XCTAssertEqual(received[0].sourceFrameInWebView, CGRect(x: -2, y: 15, width: 60, height: 22))
        XCTAssertEqual(received[0].placement, .element)
        XCTAssertEqual(received[0].colorScheme, .light)
        XCTAssertEqual(received[0].layoutDirection, .leftToRight)
        XCTAssertEqual(received[1].sourceFrameInWebView.width, 110)
        XCTAssertEqual(received[1].viewportWidth, 600)
        XCTAssertEqual(received[1].pointsPerCSSPixel, 0.5)
        XCTAssertEqual(received[1].placement, .tabAccessory)
        XCTAssertEqual(received[1].colorScheme, .dark)
        XCTAssertEqual(received[1].layoutDirection, .rightToLeft)
        XCTAssertThrowsError(try NativeUIShell.register(name) { (_: Props, _: NativeUIActions) in Text("Duplicate") })
    }

    @MainActor func testPublicRenderingSharesArtworkAndComputedColors() throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 16, height: 16)).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 16, height: 16))
        }
        let data = try XCTUnwrap(image.pngData()).base64EncodedString()
        let artwork = NativeUIImage(data: data, width: 16, height: 16, template: true)
        let decoded = try XCTUnwrap(NativeUIRendering.image(artwork))
        XCTAssertEqual(decoded.size, CGSize(width: 16, height: 16))
        XCTAssertEqual(decoded.renderingMode, .alwaysTemplate)
        let legacy: [String: Any] = ["id": "icon", "label": "Icon", "accessibilityLabel": "Icon",
            "disabled": false, "selected": false, "fontSize": 16, "fontWeight": 400,
            "color": "rgb(0, 0, 0)", "icon": data, "iconWidth": 16]
        let item = try JSONDecoder().decode(ShellItemContent.self, from: JSONSerialization.data(withJSONObject: legacy))
        XCTAssertEqual(try XCTUnwrap(ShellRendering().image(item)).size, CGSize(width: 16, height: 16))
        XCTAssertNil(NativeUIRendering.image(NativeUIImage(data: "invalid", width: 16, height: 16)))
        XCTAssertNil(NativeUIRendering.image(NativeUIImage(data: data, width: .nan, height: 16)))
        let color = NativeUIRendering.color("rgba(255, 0, 128, 0.5)")
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        XCTAssertTrue(color.getRed(&red, green: &green, blue: &blue, alpha: &alpha))
        XCTAssertEqual(red, 1)
        XCTAssertEqual(blue, 128.0 / 255.0, accuracy: 0.001)
        XCTAssertEqual(alpha, 0.5)
        XCTAssertEqual(NativeUIRendering.color("currentColor", fallback: .red), .red)
        XCTAssertEqual(ShellRendering().color("rgba(255, 0, 128, 0.5)"), color)
    }

    @MainActor func testLocalRegistrationDecodesPropsAndRejectsDuplicateAndMissingRenderers() throws {
        let name = UUID().uuidString
        var title = ""
        try NativeUIShell.register(name) { (props: Props, _: NativeUIActions) in
            title = props.title
            return Text(props.title)
        }
        let actions = NativeUIActions { _ in }
        let context = try context()
        _ = try NativeUIShell.content(ShellExtension(name: name, props: "{\"title\":\"Local View\"}", actions: [:], tabBarId: nil), actions: actions, context: context)
        XCTAssertEqual(title, "Local View")
        XCTAssertThrowsError(try NativeUIShell.register(name) { (props: Props, _: NativeUIActions) in Text(props.title) })
        XCTAssertThrowsError(try NativeUIShell.content(ShellExtension(name: name, props: "{}", actions: [:], tabBarId: nil), actions: actions, context: context))
        XCTAssertThrowsError(try NativeUIShell.content(ShellExtension(name: "missing", props: "{}", actions: [:], tabBarId: nil), actions: actions, context: context))
    }

    @MainActor func testExtensionSnapshotAcceptsEmptyActionsButRejectsInvalidProps() throws {
        func decode(_ props: String) throws -> ShellControl {
            let json: [String: Any] = ["id": "counter", "kind": "extension", "x": 0, "y": 0, "width": 100, "height": 44,
                "dark": false, "rtl": false, "items": [], "extension": ["name": "app.counter", "props": props, "actions": [:]]]
            return try JSONDecoder().decode(ShellControl.self, from: JSONSerialization.data(withJSONObject: json))
        }
        XCTAssertTrue(try decode("{\"title\":\"Ready\"}").isValid)
        XCTAssertFalse(try decode("[]").isValid)
        XCTAssertFalse(try decode("broken").isValid)
    }

    @MainActor func testActionWaitsForWebAcknowledgementAndIgnoresDuplicateReplies() async throws {
        let broker = ShellExtensionActions()
        var request: String?
        var completed = false
        let sent = expectation(description: "Web action sent")
        let task = Task { @MainActor in
            try await broker.perform(owner: "source") { request = $0; sent.fulfill() }
            completed = true
        }
        defer { task.cancel() }
        await fulfillment(of: [sent], timeout: 2)
        let requestID = try XCTUnwrap(request)
        XCTAssertFalse(completed)
        broker.finish(requestID)
        broker.finish(requestID, error: NativeUIError.rejected)
        try await task.value
        XCTAssertTrue(completed)
    }

    @MainActor func testRetirementRejectsPendingCallsOnlyForThatSource() async throws {
        let broker = ShellExtensionActions()
        var requests: [String: String] = [:]
        let sent = expectation(description: "Both actions sent")
        sent.expectedFulfillmentCount = 2
        let first = Task { @MainActor in try await broker.perform(owner: "first") { requests["first"] = $0; sent.fulfill() } }
        let second = Task { @MainActor in try await broker.perform(owner: "second") { requests["second"] = $0; sent.fulfill() } }
        defer { first.cancel(); second.cancel() }
        await fulfillment(of: [sent], timeout: 2)
        broker.cancel(owner: "first")
        do { try await first.value; XCTFail("Retired source must reject") } catch NativeUIError.unavailable {} catch { XCTFail("\(error)") }
        broker.finish(try XCTUnwrap(requests["second"]))
        try await second.value
    }

    @MainActor func testBridgeLossAndTaskCancellationAlwaysSettle() async {
        let broker = ShellExtensionActions()
        do {
            try await broker.perform(owner: "lost", timeout: 0.01) { _ in }
            XCTFail("Lost bridge must time out")
        } catch NativeUIError.timedOut {} catch { XCTFail("\(error)") }
        let sent = expectation(description: "Cancelable action sent")
        let task = Task { @MainActor in try await broker.perform(owner: "canceled") { _ in sent.fulfill() } }
        await fulfillment(of: [sent], timeout: 2)
        task.cancel()
        do { try await task.value; XCTFail("Canceled task must reject") } catch is CancellationError {} catch { XCTFail("\(error)") }
        broker.cancel()
    }

    @MainActor func testHostedViewUsesControllerContainmentAndDetaches() {
        let owner = UIViewController()
        owner.view = WKWebView()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        window.rootViewController = owner
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        let host = ShellExtensionController(content: AnyView(Text("Local content")), owner: owner)
        XCTAssertTrue(host.view.superview === owner.view)
        XCTAssertTrue(host.controller.parent === owner)
        host.update(AnyView(Text("Updated")))
        host.detach(duration: 0)
        XCTAssertNil(host.controller.parent)
        XCTAssertNil(host.view.superview)
        XCTAssertTrue(owner.children.isEmpty)
    }
}
