import XCTest
import SwiftUI
import WebKit
@testable import IonicNativeUIShellPlugin

final class NativeUIExtensionTests: XCTestCase {
    struct Props: Decodable { let title: String }

    @MainActor func testLocalRegistrationDecodesPropsAndRejectsDuplicateAndMissingRenderers() throws {
        let name = UUID().uuidString
        var title = ""
        try NativeUIShell.register(name) { (props: Props, _: NativeUIActions) in
            title = props.title
            return Text(props.title)
        }
        let actions = NativeUIActions { _ in }
        _ = try NativeUIShell.content(ShellExtension(name: name, props: "{\"title\":\"Local View\"}", actions: [:], tabBarId: nil), actions: actions)
        XCTAssertEqual(title, "Local View")
        XCTAssertThrowsError(try NativeUIShell.register(name) { (props: Props, _: NativeUIActions) in Text(props.title) })
        XCTAssertThrowsError(try NativeUIShell.content(ShellExtension(name: name, props: "{}", actions: [:], tabBarId: nil), actions: actions))
        XCTAssertThrowsError(try NativeUIShell.content(ShellExtension(name: "missing", props: "{}", actions: [:], tabBarId: nil), actions: actions))
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
