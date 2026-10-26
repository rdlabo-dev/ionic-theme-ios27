import XCTest
import WebKit
@testable import CapacitorNativeUIEngine

final class NativeUIProjectionTests: XCTestCase {
    @MainActor func testMissingWebViewThrowsDuringInitialization() {
        XCTAssertThrowsError(try NativeUIProjection(
            webView: nil, plugin: "Fixture", projectionSelector: "#slot", view: { nil }
        ))
    }

    @MainActor func testNativeInitializationFallbackEventsReloadAndTeardown() async throws {
        let configuration = WKWebViewConfiguration()
        let content = ProjectionFixture()
        configuration.setURLSchemeHandler(content, forURLScheme: "capacitor")
        configuration.userContentController.addUserScript(WKUserScript(source: """
          window.testDocument = Math.random().toString(36);
          window.testEvents = {};
          window.Capacitor = {
            addListener: (plugin, name, listener) => { testEvents[name] = listener; return { remove: async () => { delete testEvents[name]; } }; },
            convertFileSrc: url => 'capacitor://localhost/_capacitor_file_' + url.replace('file://', '')
          };
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let window = UIWindow(frame: UIScreen.main.bounds)
        let owner = UIViewController(); window.rootViewController = owner; window.makeKeyAndVisible()
        let web = WKWebView(frame: window.bounds, configuration: configuration)
        owner.view.addSubview(web)
        let button = UIButton(frame: CGRect(x: 20, y: 100, width: 100, height: 40))
        button.backgroundColor = .red; button.setTitle("Native", for: .normal)
        let surface = UIView(frame: CGRect(x: 20, y: 100, width: 100, height: 100))
        button.frame.origin = .zero
        surface.addSubview(button)
        owner.view.addSubview(surface)
        let hidden = UIView(frame: CGRect(x: 20, y: 160, width: 100, height: 40)); hidden.isHidden = true
        hidden.frame.origin = CGPoint(x: 0, y: 60)
        surface.addSubview(hidden)
        let registration = try NativeUIProjection(webView: web, plugin: "Fixture", projectionSelector: "#slot",
            receiveListeners: .init(update: ["updated"], projection: .init(native: ["shown"], web: ["moving"], none: ["hidden"])),
            canCapture: { false }, view: { surface })
        defer { registration.destroy(); window.isHidden = true }
        web.load(URLRequest(url: URL(string: "capacitor://localhost/fixture")!))
        try await wait(web, "document.querySelector('#slot')?.getAttributeNames().some(n => n.startsWith('data-native-ui-session-') && document.querySelector('#slot').getAttribute(n)==='native') === true", timeout: 30)
        XCTAssertFalse(surface.isHidden)
        for _ in 0..<2 {
            _ = try await web.evaluateJavaScript("testEvents.moving({})")
            try await wait(web, "!document.querySelector('#slot').getAttributeNames().some(n => n.startsWith('data-native-ui-session-'))")
            // Capture is unavailable (for example, an SDK video view). Verify normal Web fallback.
            for _ in 0..<100 where !surface.isHidden { try await Task.sleep(nanoseconds: 20_000_000) }
            XCTAssertTrue(surface.isHidden)
            _ = try await web.evaluateJavaScript("testEvents.shown({})")
            try await wait(web, "document.querySelector('#slot').getAttributeNames().some(n => n.startsWith('data-native-ui-session-') && document.querySelector('#slot').getAttribute(n)==='native')")
            XCTAssertFalse(surface.isHidden)
            XCTAssertTrue(hidden.isHidden, "Do not unhide a renderer-owned hidden view")
        }
        _ = try await web.evaluateJavaScript("testEvents.hidden({})")
        try await wait(web, "document.querySelector('#slot').getAttributeNames().some(n => n.startsWith('data-native-ui-session-') && document.querySelector('#slot').getAttribute(n)==='none')")
        XCTAssertTrue(surface.isHidden)
        let previousDocument = try await web.evaluateJavaScript("testDocument") as! String
        web.reload()
        try await wait(web, "typeof testDocument === 'string' && testDocument !== '\(previousDocument)'")
        try await wait(web, "document.querySelector('#slot')?.getAttributeNames().some(n => n.startsWith('data-native-ui-session-') && document.querySelector('#slot').getAttribute(n)==='none') === true")
        XCTAssertTrue(surface.isHidden, "Reload must preserve none")
        _ = try await web.evaluateJavaScript("testEvents.shown({})")
        try await wait(web, "document.querySelector('#slot')?.getAttributeNames().some(n => n.startsWith('data-native-ui-session-') && document.querySelector('#slot').getAttribute(n)==='native') === true")
        XCTAssertFalse(surface.isHidden)
        registration.destroy()
        try await wait(web, "Object.keys(testEvents).length === 0")
        XCTAssertEqual(configuration.userContentController.userScripts.count, 1, "Keep the host's scripts")
    }
    @MainActor func testPreparedImageReturnsToNativeAfterWebProjection() async throws {
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(ProjectionFixture(), forURLScheme: "capacitor")
        configuration.userContentController.addUserScript(WKUserScript(source: """
          window.testEvents = {};
          window.Capacitor = {
            addListener: (plugin, name, listener) => { testEvents[name] = listener; return { remove: async () => { delete testEvents[name]; } }; },
            convertFileSrc: url => 'capacitor://localhost/_capacitor_file_' + url.replace('file://', '')
          };
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let window = SnapshotTestWindow(frame: UIScreen.main.bounds)
        let owner = UIViewController(); window.rootViewController = owner; window.makeKeyAndVisible()
        let web = WKWebView(frame: window.bounds, configuration: configuration)
        owner.view.addSubview(web)
        let button = UIButton(frame: CGRect(x: 20, y: 100, width: 100, height: 40))
        button.backgroundColor = .red; button.setTitle("Native", for: .normal)
        owner.view.addSubview(button)
        let registration = try NativeUIProjection(webView: web, plugin: "Fixture", projectionSelector: "#slot",
            receiveListeners: .init(projection: .init(native: ["shown"], web: ["moving"])),
            // A hostless XCTest process has no compositor surface. Keep the capture,
            // file transport and handoff real, replacing only the screen replica.
            snapshots: NativeUICoveredSnapshots(snapshotView: { $0 }), view: { button })
        defer { registration.destroy(); window.isHidden = true }
        web.load(URLRequest(url: URL(string: "capacitor://localhost/fixture")!))
        for _ in 0..<3 {
            try await wait(web, "document.querySelector('#slot')?.hasAttribute('data-native-ui-snapshot') === true", timeout: 30)
            XCTAssertFalse(button.isHidden)
            _ = try await web.evaluateJavaScript("testEvents.moving({})")
            try await wait(web, "document.querySelector('#slot').hasAttribute('data-native-ui-snapshot-visible')")
            XCTAssertTrue(button.isHidden)
            _ = try await web.evaluateJavaScript("testEvents.shown({})")
            try await wait(web, "document.querySelector('#slot').getAttributeNames().some(n => n.startsWith('data-native-ui-session-') && document.querySelector('#slot').getAttribute(n)==='native') && !document.querySelector('#slot').hasAttribute('data-native-ui-snapshot-visible')")
            XCTAssertFalse(button.isHidden, "Prepared image handoff must restore the live view")
            XCTAssertEqual(button.frame, CGRect(x: 20, y: 100, width: 100, height: 40))
        }
    }
    @MainActor private func wait(_ web: WKWebView, _ expression: String, timeout: TimeInterval = 8) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if (try? await web.evaluateJavaScript(expression)) as? Bool == true { return }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("Timed out: \(expression)")
        throw NSError(domain: "ProjectionFixture", code: 1)
    }
}
private final class ProjectionFixture: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let url = urlSchemeTask.request.url!
        let data: Data
        let type: String
        if url.path.hasPrefix("/_capacitor_file_") {
            let path = String(url.path.dropFirst("/_capacitor_file_".count))
            guard path.hasPrefix(NSTemporaryDirectory()), let image = try? Data(contentsOf: URL(fileURLWithPath: path)) else {
                urlSchemeTask.didFailWithError(NSError(domain: "ProjectionFixture", code: 2)); return
            }
            data = image; type = "image/png"
        } else {
            data = Data("<meta name='viewport' content='width=device-width,initial-scale=1'><body><div id='slot' style='position:absolute;left:20px;top:100px;width:100px;height:40px'>Fallback</div></body>".utf8)
            type = "text/html"
        }
        urlSchemeTask.didReceive(URLResponse(url: url, mimeType: type, expectedContentLength: data.count, textEncodingName: nil))
        urlSchemeTask.didReceive(data); urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
