import XCTest

final class NativeHTMLTests: XCTestCase {
    func testStandardHTMLControlsAndRouterlessBack() {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeui.html")
        app.launch()
        let add = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier BEGINSWITH %@", "Add", "shell-")).firstMatch
        XCTAssertTrue(add.waitForExistence(timeout: 15), app.debugDescription)
        add.tap()
        XCTAssertTrue(app.webViews.staticTexts["Count: 1"].waitForExistence(timeout: 5))
        app.webViews.buttons["Open details"].tap()
        let back = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier BEGINSWITH %@", "Back", "shell-")).firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 5), app.debugDescription)
        back.tap()
        XCTAssertTrue(app.webViews.staticTexts["Home"].waitForExistence(timeout: 5))
        app.webViews.buttons["Stop native UI"].tap()
        XCTAssertTrue(app.webViews.staticTexts["Stopped"].waitForExistence(timeout: 5))
        XCTAssertFalse(add.exists)
        app.webViews.buttons["Add"].tap()
        XCTAssertTrue(app.webViews.staticTexts["Count: 2"].waitForExistence(timeout: 5))
    }
}
