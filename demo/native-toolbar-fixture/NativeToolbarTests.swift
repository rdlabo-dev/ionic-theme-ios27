import XCTest

final class NativeToolbarTests: XCTestCase {
    func testPushPopAndInteractiveCancellationKeepNativeToolbar() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "io.ionic.theme.ios27")
        app.launch()
        let edit = nativeButton(app, label: "Edit")
        XCTAssertTrue(edit.waitForExistence(timeout: 20), app.debugDescription)
        XCTAssertTrue(app.webViews.buttons["Edit"].waitForNonExistence(timeout: 5), app.debugDescription)
        edit.tap()
        waitStatus(app, contains: "root:1")
        app.webViews.buttons["Push detail"].tap()
        let done = nativeButton(app, label: "Done")
        XCTAssertTrue(done.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(app.webViews.buttons["Done"].waitForNonExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(nativeButton(app, label: "Back").exists, app.debugDescription)
        done.tap()
        waitStatus(app, contains: "detail:2")
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.005, dy: 0.55))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.55))
        start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.5)
        sleep(3)
        XCTAssertTrue(done.exists, app.debugDescription)
        XCTAssertTrue(nativeButton(app, label: "Back").exists, app.debugDescription)
        waitStatus(app, contains: "\"phase\":\"idle\"")
        done.tap()
        waitStatus(app, contains: "detail:3")
        nativeButton(app, label: "Back").tap()
        XCTAssertTrue(edit.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertFalse(nativeButton(app, label: "Back").exists, app.debugDescription)
        edit.tap()
        waitStatus(app, contains: "root:4")
        waitStatus(app, contains: "\"exposedWeb\":0")
        waitStatus(app, contains: "\"emptyNative\":0")
        let status = app.webViews.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "{\"phase\"" )).firstMatch.label
        let values = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(status.utf8)) as? [String: Any])
        print("TOOLBAR_METRICS \(status)")
        let progress = try XCTUnwrap(values["maxProgress"] as? [String: Double])
        XCTAssertGreaterThan(progress["2"] ?? 0, 0.1, status)
        XCTAssertGreaterThan(values["samples"] as? Int ?? 0, 30, status)
        XCTAssertEqual(values["cycles"] as? Int, 3, status)
        XCTAssertEqual(values["cancellations"] as? Int, 1, status)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "toolbar-push-pop-cancel"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func nativeButton(_ app: XCUIApplication, label: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label == %@", "native-ui-", label)).firstMatch
    }

    private func waitStatus(_ app: XCUIApplication, contains text: String) {
        let status = app.webViews.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
        XCTAssertTrue(status.waitForExistence(timeout: 10), app.debugDescription)
    }
}
