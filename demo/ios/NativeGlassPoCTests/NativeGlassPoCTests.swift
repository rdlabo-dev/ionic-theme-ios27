import XCTest

/// Live parity: the demo app runs with `-parity`, which mounts UIKit
/// reference controls and merges DOM frames reported by the
/// `/native-glass-poc` page. Geometry assertions fail CI; the full metric
/// payload is attached as an artifact either way.
final class NativeGlassPoCTests: XCTestCase {

    private var app: XCUIApplication!
    private var payload: [String: Any]!

    private let tolerance: Double = 0.75

    override func setUpWithError() throws {
        continueAfterFailure = true
        app = XCUIApplication(bundleIdentifier: "io.ionic.theme.ios26")
        app.launchArguments = [name.contains("Dark") ? "-parity-dark" : "-parity"]
        app.launch()

        let ready = app.staticTexts["parity-ready"]
        XCTAssertTrue(ready.waitForExistence(timeout: 60), "parity report never became ready")

        let report = app.staticTexts["parity-report"]
        XCTAssertTrue(report.waitForExistence(timeout: 5), "parity-report label missing")
        let text = report.label
        payload = try XCTUnwrap(
            try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
            "parity-report was not JSON: \(text.prefix(200))"
        )
        let attachment = XCTAttachment(string: text)
        attachment.name = "parity-report-\(name).json"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    override func tearDownWithError() throws {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "parity-\(name).png"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func num(_ dict: [String: Any], _ key: String, _ label: String) throws -> Double {
        let value = try XCTUnwrap(dict[key] as? NSNumber, "\(label).\(key)")
        return value.doubleValue
    }

    private func frameRect(_ dict: [String: Any], _ label: String) throws -> CGRect {
        CGRect(
            x: try num(dict, "x", label),
            y: try num(dict, "y", label),
            width: try num(dict, "w", label),
            height: try num(dict, "h", label)
        )
    }

    private func frame(_ side: String, _ key: String) throws -> CGRect {
        let root = try XCTUnwrap(payload[side] as? [String: Any])
        let node = try XCTUnwrap(root[key] as? [String: Any], "\(side).\(key) missing")
        if let frame = node["frame"] as? [String: Any] {
            return try frameRect(frame, "\(side).\(key).frame")
        }
        return try frameRect(node, "\(side).\(key)")
    }

    private func assertSize(_ key: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let web = try frame("web", key)
        let native = try frame("native", key)
        XCTAssertEqual(web.width, native.width, accuracy: tolerance, "\(key) width: web \(web.width) vs native \(native.width)", file: file, line: line)
        XCTAssertEqual(web.height, native.height, accuracy: tolerance, "\(key) height: web \(web.height) vs native \(native.height)", file: file, line: line)
    }

    /// Strict geometry on the visual control surfaces (not margin boxes).
    func testGeometryParityLight() throws {
        let web = payload["web"] as? [String: Any]

        // Known gap: theme renders ~52.7pt where UIButton.Configuration.glass()
        // lays out at 44pt. Width stays a hard assertion.
        for key in ["glass", "prominent"] {
            let w = try frame("web", key)
            let n = try frame("native", key)
            XCTAssertEqual(w.width, n.width, accuracy: tolerance, "\(key) width")
            XCTExpectFailure("theme button height is ~52.7pt vs UIKit 44pt", options: .nonStrict()) {
                XCTAssertEqual(w.height, n.height, accuracy: self.tolerance, "\(key) height")
            }
        }

        try assertSize("toggle")

        // Slider: the meaningful parity metric is the track, not the control
        // frame (Ionic reserves knob padding vertically).
        let webTrack = try frameRect(
            ((payload["web"] as? [String: Any])?["range"] as? [String: Any])?["bar"] as? [String: Any] ?? [:],
            "web.range.bar")
        let nativeTrack = try frameRect(
            ((payload["native"] as? [String: Any])?["range"] as? [String: Any])?["track"] as? [String: Any] ?? [:],
            "native.range.track")
        XCTAssertEqual(webTrack.width, nativeTrack.width, accuracy: tolerance, "range track width")
        XCTAssertEqual(webTrack.height, nativeTrack.height, accuracy: tolerance, "range track height")

        // Segment: outer frame and per-item division.
        let webSegment = try frame("web", "segment")
        let nativeSegment = try frame("native", "segment")
        XCTAssertEqual(webSegment.width, nativeSegment.width, accuracy: tolerance, "segment width")
        XCTExpectFailure("theme segment height is 31pt vs UIKit 32pt", options: .nonStrict()) {
            XCTAssertEqual(webSegment.height, nativeSegment.height, accuracy: self.tolerance, "segment height")
        }
        let webSegFrame = webSegment
        let webItems = (web?["segment"] as? [String: Any])?["items"] as? [[String: Any]]
        let nativeSeg = app.segmentedControls["native-segment"]
        let segNames = ["One", "Two", "Three"]
        if let w = webItems, nativeSeg.exists {
            for (i, name) in segNames.enumerated() {
                let item = nativeSeg.buttons[name]
                guard item.exists else { continue }
                XCTAssertEqual(
                    webSegFrame.origin.x + (try num(w[i], "x", "web.segment.items[\(i)]")),
                    item.frame.origin.x, accuracy: 2, "segment item \(i) screen x")
                XCTAssertEqual(
                    try num(w[i], "w", "web.segment.items[\(i)]"),
                    item.frame.width, accuracy: 2, "segment item \(i) width")
            }
        }

        // Tab bar: item frames are measured through the accessibility tree on
        // both sides. Item widths are a hard assertion; the absolute x offset
        // differs today because the native pill is centered while the web pill
        // is anchored at its frame origin.
        let webTabs = try frame("web", "tabs")
        let webTabItems = (web?["tabs"] as? [String: Any])?["items"] as? [[String: Any]]
        let nativeBar = app.tabBars["native-tabs"]
        let tabNames = ["One", "Two", "Three"]
        if let w = webTabItems, nativeBar.exists {
            for (i, name) in tabNames.enumerated() {
                let item = nativeBar.buttons[name]
                guard item.exists else { continue }
                XCTExpectFailure("native tab pill is centered in its frame; web pill anchors at frame origin", options: .nonStrict()) {
                    XCTAssertEqual(
                        webTabs.origin.x + ((try? self.num(w[i], "x", "web.tabs.items[\(i)]")) ?? .nan),
                        item.frame.origin.x, accuracy: 2, "tab item \(i) screen x")
                }
                XCTAssertEqual(
                    try num(w[i], "w", "web.tabs.items[\(i)]"),
                    item.frame.width, accuracy: 2, "tab item \(i) width")
            }
        }
    }

    /// Dark appearance: capture screenshot and full report; dark-mode pixel
    /// variance stays informational.
    func testDarkReport() throws {
        XCTAssertNotNil(payload["web"], "web metrics missing")
        XCTAssertNotNil(payload["native"], "native metrics missing")
    }
}
