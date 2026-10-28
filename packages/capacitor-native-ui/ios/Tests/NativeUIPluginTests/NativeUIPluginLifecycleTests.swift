import XCTest
import Capacitor
import UIKit
import WebKit
@testable import NativeUIPlugin

final class NativeUIPluginLifecycleTests: XCTestCase {
    @MainActor func testOrientationNotificationsKeepProjectedControlsVisibleWithoutLayoutChanges() async throws {
        let fixture = try await project()
        let bounds = fixture.host.bounds
        for _ in 0..<3 {
            NotificationCenter.default.post(name: UIDevice.orientationDidChangeNotification, object: UIDevice.current)
            XCTAssertFalse(fixture.host.isHidden, "Sensor notifications must not blank native controls while waiting for Web refresh")
            XCTAssertEqual(fixture.host.bounds, bounds)
        }
        XCTAssertEqual(fixture.bridge.events.filter { $0 == "nativeUIRefresh" }.count, 3)
        withExtendedLifetime(fixture.plugin) {}
    }

    @MainActor func testOrientationStillRefreshesControlsAfterLayoutChanges() async throws {
        let fixture = try await project()
        fixture.bridge.viewController?.view.frame = CGRect(x: 0, y: 0, width: 844, height: 390)
        fixture.bridge.webView?.frame = CGRect(x: 0, y: 0, width: 844, height: 390)
        NotificationCenter.default.post(name: UIDevice.orientationDidChangeNotification, object: UIDevice.current)
        XCTAssertFalse(fixture.host.isHidden)
        XCTAssertTrue(fixture.bridge.events.contains("nativeUIRefresh"))
        try await update(fixture.plugin, width: 844, revision: 2)
        XCTAssertEqual(fixture.host.bounds.size, CGSize(width: 844, height: 390))
        XCTAssertFalse(fixture.host.isHidden)
    }

    @MainActor func testBackgroundSuspendsControlsAndActiveRefreshRestoresThem() async throws {
        let fixture = try await project()
        NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
        XCTAssertTrue(fixture.host.isHidden)
        NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        XCTAssertTrue(fixture.bridge.events.contains("nativeUIRefresh"))
        try await update(fixture.plugin, width: 390, revision: 2)
        XCTAssertFalse(fixture.host.isHidden)
    }

    @MainActor func testKeyboardHideDoesNotBlankProjectedControls() async throws {
        let fixture = try await project()
        NotificationCenter.default.post(name: UIResponder.keyboardWillHideNotification, object: nil)
        XCTAssertFalse(fixture.host.isHidden)
        XCTAssertTrue(fixture.bridge.events.contains("nativeUIRefresh"))
    }

    @MainActor func testOrientationPreservesCoveredControlsUntilRestore() async throws {
        let fixture = try await project()
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        window.rootViewController = fixture.bridge.viewController
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        try await Task.sleep(nanoseconds: 150_000_000)
        let control = try XCTUnwrap(fixture.host.subviews.first)
        func snapshot(_ options: JSObject) async throws -> [String: Any] {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[String: Any], Error>) in
                let call = CAPPluginCall(callbackId: "orientation-snapshot", methodName: "coveredSnapshot", options: options,
                    success: { result, _ in continuation.resume(returning: result?.data ?? [:]) },
                    error: { _ in continuation.resume(throwing: NSError(domain: "NativeUILifecycleTests", code: 1)) })!
                fixture.plugin.coveredSnapshot(call)
            }
        }
        let capture = try await snapshot(["action": "prepare", "revision": 1, "viewportWidth": 390.0, "ids": ["header-action"]])
        let token = try XCTUnwrap(capture["token"] as? String)
        let cover = try await snapshot(["action": "cover", "token": token])
        XCTAssertEqual(cover["shown"] as? Bool, true)
        XCTAssertTrue(control.isHidden)
        NotificationCenter.default.post(name: UIDevice.orientationDidChangeNotification, object: UIDevice.current)
        XCTAssertTrue(control.isHidden || fixture.host.isHidden, "A covered native control must not reappear above its Web overlay")
        let part: JSObject = ["ids": ["header-action"], "x": 16.0, "y": 60.0, "width": 44.0, "height": 44.0]
        let restored = try await snapshot(["action": "restore", "token": token, "viewportWidth": 390.0, "parts": [part]])
        XCTAssertEqual(restored["shown"] as? Bool, true, "Orientation must preserve the capture used on return")
        _ = try await snapshot(["action": "restored", "token": token])
        _ = try await snapshot(["action": "release", "token": token])
        XCTAssertFalse(control.isHidden)
        withExtendedLifetime(fixture.plugin) {}
    }

    @MainActor private func project() async throws -> (plugin: NativeUIPlugin, bridge: LifecycleBridge, host: NativeUIHost) {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires native UI projection") }
        let bridge = LifecycleBridge()
        let plugin = NativeUIPlugin()
        plugin.bridge = bridge
        plugin.webView = bridge.webView
        plugin.load()
        try await update(plugin, width: 390, revision: 1)
        let host = try XCTUnwrap(bridge.viewController?.view.subviews.compactMap { $0 as? NativeUIHost }.first)
        XCTAssertFalse(host.isHidden)
        XCTAssertFalse(host.subviews.isEmpty, "Fixture must project a real native control")
        return (plugin, bridge, host)
    }

    @MainActor private func update(_ plugin: NativeUIPlugin, width: Double, revision: Int) async throws {
        let item: JSObject = ["id": "action", "x": 0.0, "y": 0.0, "width": 44.0, "height": 44.0,
            "label": "Share", "accessibilityLabel": "Share", "disabled": false, "selected": false,
            "fontSize": 17.0, "fontWeight": 400.0, "color": "rgb(0, 0, 0)"]
        let control: JSObject = ["id": "header-action", "kind": "ion-button", "x": 16.0, "y": 60.0,
            "width": 44.0, "height": 44.0, "items": [item], "dark": false, "rtl": false]
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let call = CAPPluginCall(callbackId: "lifecycle-\(revision)", methodName: "update",
                options: ["revision": revision, "viewportWidth": width, "controls": [control]],
                success: { _, _ in continuation.resume() },
                error: { error in continuation.resume(throwing: NSError(domain: "NativeUILifecycleTests", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: String(describing: error)])) })!
            plugin.update(call)
        }
    }
}

private final class LifecycleBridge: NSObject, CAPBridgeProtocol {
    let viewController: UIViewController?
    let webView: WKWebView?
    var events: [String] = []
    var config: InstanceConfiguration { fatalError("Configuration is not used by this fixture") }
    let notificationRouter = NotificationRouter()
    let isSimEnvironment = true
    let isDevEnvironment = true
    let userInterfaceStyle: UIUserInterfaceStyle = .light
    let autoRegisterPlugins = false
    var statusBarVisible = true
    var statusBarStyle: UIStatusBarStyle = .default
    var statusBarAnimation: UIStatusBarAnimation = .none

    override init() {
        let owner = UIViewController()
        owner.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        let source = WKWebView(frame: owner.view.bounds)
        owner.view.addSubview(source)
        viewController = owner
        webView = source
        super.init()
    }

    func getWebView() -> WKWebView? { webView }
    func isSimulator() -> Bool { isSimEnvironment }
    func isDevMode() -> Bool { isDevEnvironment }
    func getStatusBarVisible() -> Bool { statusBarVisible }
    func getStatusBarStyle() -> UIStatusBarStyle { statusBarStyle }
    func getUserInterfaceStyle() -> UIUserInterfaceStyle { userInterfaceStyle }
    func getLocalUrl() -> String { "capacitor://localhost" }
    func getSavedCall(_ callbackId: String) -> CAPPluginCall? { nil }
    func releaseCall(callbackId: String) {}
    func plugin(withName: String) -> CAPPlugin? { nil }
    func saveCall(_ call: CAPPluginCall) {}
    func savedCall(withID: String) -> CAPPluginCall? { nil }
    func releaseCall(_ call: CAPPluginCall) {}
    func releaseCall(withID: String) {}
    func evalWithPlugin(_ plugin: CAPPlugin, js: String) {}
    func eval(js: String) {}
    func triggerJSEvent(eventName: String, target: String) { events.append(eventName) }
    func triggerJSEvent(eventName: String, target: String, data: String) { events.append(eventName) }
    func triggerWindowJSEvent(eventName: String) { events.append(eventName) }
    func triggerWindowJSEvent(eventName: String, data: String) { events.append(eventName) }
    func triggerDocumentJSEvent(eventName: String) { events.append(eventName) }
    func triggerDocumentJSEvent(eventName: String, data: String) { events.append(eventName) }
    func localURL(fromWebURL webURL: URL?) -> URL? { webURL }
    func portablePath(fromLocalURL localURL: URL?) -> URL? { localURL }
    func setServerBasePath(_ path: String) {}
    func registerPluginType(_ pluginType: CAPPlugin.Type) {}
    func registerPluginInstance(_ pluginInstance: CAPPlugin) {}
    func showAlertWith(title: String, message: String, buttonTitle: String) {}
    func presentVC(_ viewControllerToPresent: UIViewController, animated flag: Bool, completion: (() -> Void)?) { completion?() }
    func dismissVC(animated flag: Bool, completion: (() -> Void)?) { completion?() }
}
