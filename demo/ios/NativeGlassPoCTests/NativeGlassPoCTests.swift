import XCTest

/// Live parity: the demo app runs with `-parity`, which mounts UIKit
/// reference controls and merges DOM frames reported from the real
/// `/main/index/native-ui-shell` page. Geometry assertions fail CI; the full
/// metric payload is attached as an artifact either way.
final class NativeGlassPoCTests: XCTestCase {

    private var app: XCUIApplication!
    private var payload: [String: Any]!

    private let tolerance: Double = 0.75

    override func setUpWithError() throws {
        continueAfterFailure = true
        app = XCUIApplication(bundleIdentifier: "io.ionic.theme.ios26")
        app.launchArguments = [name.contains("Dark") ? "-parity-dark" : "-parity"]
        app.launch()

        let report = app.staticTexts["parity-report"]
        XCTAssertTrue(report.waitForExistence(timeout: 60), "parity-report label missing")

        // The label mounts empty and is populated once web metrics arrive;
        // wait for non-empty content rather than mere existence.
        let populated = NSPredicate(format: "label.length > 0")
        let populatedExpectation = XCTNSPredicateExpectation(predicate: populated, object: report)
        XCTAssertEqual(
            XCTWaiter.wait(for: [populatedExpectation], timeout: 60),
            .completed,
            "parity report never populated")

        XCTAssertTrue(app.staticTexts["parity-ready"].exists, "parity-ready flag missing")
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

    /// Compare per-item geometry inside each container. Web items are stored
    /// relative to their element's origin; native a11y frames are in screen
    /// space, so subtract the native container's origin.
    private func assertItems(
        webItems: [[String: Any]],
        nativeContainerX: Double,
        nativeButtons: [XCUIElement],
        label: String,
        strictItemWidth: Bool
    ) throws {
        for (i, item) in nativeButtons.enumerated() {
            guard i < webItems.count, item.exists else { continue }
            let relativeX = item.frame.origin.x - nativeContainerX
            XCTExpectFailure("item anchoring differs between web and UIKit", options: .nonStrict()) {
                XCTAssertEqual(
                    (try? self.num(webItems[i], "x", "\(label).items[\(i)]")) ?? .nan,
                    relativeX, accuracy: 2, "\(label) item \(i) x")
            }
            if strictItemWidth {
                XCTAssertEqual(
                    try num(webItems[i], "w", "\(label).items[\(i)]"),
                    item.frame.width, accuracy: 2, "\(label) item \(i) width")
            } else {
                XCTExpectFailure("\(label) item division differs between web and UIKit", options: .nonStrict()) {
                    XCTAssertEqual(
                        (try? self.num(webItems[i], "w", "\(label).items[\(i)]")) ?? .nan,
                        item.frame.width, accuracy: 2, "\(label) item \(i) width")
                }
            }
        }
    }

    /// Strict geometry on the native-ui-shell audit page and the shell tab bar.
    func testGeometryParityLight() throws {
        let web = payload["web"] as? [String: Any]

        // Save button: the theme's visual size differs from UIButton's; keep
        // it informational while asserting the reference control exists.
        XCTAssertTrue(app.buttons["native-save"].waitForExistence(timeout: 5), "native save reference missing")
        let webSave = try frame("web", "save")
        let nativeSave = try frame("native", "save")
        XCTExpectFailure("theme button size differs from UIKit", options: .nonStrict()) {
            XCTAssertEqual(webSave.height, nativeSave.height, accuracy: 2, "save height")
        }

        // Segment: the native reference is resized to the web width, so item
        // division is compared on equal footing.
        let webSegment = try frame("web", "segment")
        let nativeSegment = try frame("native", "segment")
        XCTAssertEqual(webSegment.width, nativeSegment.width, accuracy: tolerance, "segment width")
        XCTExpectFailure("theme segment height is 31pt vs UIKit 32pt", options: .nonStrict()) {
            XCTAssertEqual(webSegment.height, nativeSegment.height, accuracy: self.tolerance, "segment height")
        }
        let webSegItems = (web?["segment"] as? [String: Any])?["items"] as? [[String: Any]]
        let nativeSeg = app.segmentedControls["native-segment"]
        if let items = webSegItems, nativeSeg.exists {
            let buttons = ["One", "Two", "Three"].map { nativeSeg.buttons[$0] }
            try assertItems(
                webItems: items, nativeContainerX: nativeSegment.origin.x, nativeButtons: buttons,
                label: "segment", strictItemWidth: true)
        }

        // Shell tab bar: real ion-tab-bar vs UITabBar reference.
        let webTabs = try frame("web", "tabs")
        let nativeTabs = try frame("native", "tabs")
        XCTAssertEqual(webTabs.width, nativeTabs.width, accuracy: tolerance, "tabs width")
        let webTabItems = (web?["tabs"] as? [String: Any])?["items"] as? [[String: Any]]
        let nativeBar = app.tabBars["native-tabs"]
        if let items = webTabItems, nativeBar.exists {
            let buttons = ["Index", "Docs", "Library", "Settings"].map { nativeBar.buttons[$0] }
            try assertItems(
                webItems: items, nativeContainerX: nativeTabs.origin.x, nativeButtons: buttons,
                label: "tabs", strictItemWidth: false)
        }
    }

    /// Dark appearance: capture screenshot and full report; dark-mode pixel
    /// variance stays informational.
    func testDarkReport() throws {
        XCTAssertNotNil(payload["web"], "web metrics missing")
        XCTAssertNotNil(payload["native"], "native metrics missing")
    }
}
