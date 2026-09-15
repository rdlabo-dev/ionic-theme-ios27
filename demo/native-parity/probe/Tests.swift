import XCTest

final class NativeParityTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
    private func flushTabs(_ app: XCUIApplication, kind: String) {
        guard kind.hasPrefix("tabs") else { return }
        CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName("dev.rdlabo.ios26.parity.flush" as CFString), nil, nil, true)
        XCTAssertTrue(app.staticTexts["Metrics saved"].waitForExistence(timeout: 15))
    }
    private func compare(_ kind: String, operation: (XCUIApplication, Bool, String) -> Void) {
        for appearance in ["light", "dark"] {
            for web in [false, true] {
                let app = XCUIApplication()
                app.launchArguments = ["control=\(kind)", appearance] + (web ? ["web"] : [])
                app.launch()
                if web { XCTAssertTrue(app.webViews.staticTexts["Ready"].waitForExistence(timeout: 15)) }
                Thread.sleep(forTimeInterval: 1)
                capture("\(kind)-\(web ? "web" : "native")-\(appearance)-rest")
                operation(app, web, appearance)
                Thread.sleep(forTimeInterval: 1.5)
                capture("\(kind)-\(web ? "web" : "native")-\(appearance)-end")
                flushTabs(app, kind: kind)
                app.terminate()
            }
        }
    }
    // Shell cases verify reference-shell native rendering only, not Capacitor bridge/handoff.
    private func compareShell(_ kind: String, operation: (XCUIApplication) -> Void) {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            app.launchArguments = ["control=\(kind)", appearance, "shell"]
            app.launch()
            XCTAssertTrue(app.staticTexts["Shell Ready"].waitForExistence(timeout: 15))
            Thread.sleep(forTimeInterval: 1)
            capture("\(kind)-shell-\(appearance)-rest")
            operation(app)
            Thread.sleep(forTimeInterval: 1.5)
            capture("\(kind)-shell-\(appearance)-end")
            flushTabs(app, kind: kind)
            app.terminate()
        }
    }
    func testButton() {
        compare("button") { app, web, _ in
            for name in ["Glass", "Prominent"] {
                let button = web ? app.webViews.buttons[name] : app.buttons[name]
                XCTAssertTrue(button.waitForExistence(timeout: 10))
                button.tap()
                Thread.sleep(forTimeInterval: 1)
                button.press(forDuration: 0.7)
                Thread.sleep(forTimeInterval: 1)
            }
        }
    }
    func testNavigation() {
        compare("navigation") { app, web, appearance in
            let next = web ? app.webViews.buttons["Next"] : app.buttons["Next"]
            XCTAssertTrue(next.waitForExistence(timeout: 10))
            next.tap()
            let detail = web ? app.webViews.staticTexts["Detail content"] : app.staticTexts["Detail content"]
            XCTAssertTrue(detail.waitForExistence(timeout: 10))
            Thread.sleep(forTimeInterval: 1)
            self.capture("navigation-\(web ? "web" : "native")-\(appearance)-detail")
            // Slow short edge drag should return to Detail, not commit a pop.
            let screen = app.coordinate(withNormalizedOffset: .zero)
            screen.withOffset(CGVector(dx: 2, dy: 430)).press(forDuration: 0.2,
                thenDragTo: screen.withOffset(CGVector(dx: 90, dy: 430)), withVelocity: XCUIGestureVelocity(rawValue: 80), thenHoldForDuration: 0.3)
            Thread.sleep(forTimeInterval: 1)
            XCTAssertTrue(detail.isHittable)
            let back = web ? app.webViews.buttons["Home"] : app.navigationBars.buttons.firstMatch
            back.tap()
            XCTAssertTrue(next.waitForExistence(timeout: 10))
        }
    }
    func testButtonShort() {
        compare("button-short") { app, web, _ in
            let button = web ? app.webViews.buttons["Glass"] : app.buttons["Glass"]
            XCTAssertTrue(button.waitForExistence(timeout: 10))
            for duration in [0.05, 0.08, 0.1, 0.15, 0.2] {
                button.press(forDuration: duration)
                Thread.sleep(forTimeInterval: 1)
            }
        }
    }
    func testButtonMatrix() {
        let app = XCUIApplication()
        app.launchArguments = ["control=button-matrix", "light"]
        app.launch()
        Thread.sleep(forTimeInterval: 1)
        capture("button-matrix-native-light-rest")
        for name in ["Button-44-44", "Button-80-44", "Button-220-44", "Button-80-28", "Button-180-62"] {
            let button = app.buttons[name]
            XCTAssertTrue(button.waitForExistence(timeout: 10))
            button.press(forDuration: 0.7)
            Thread.sleep(forTimeInterval: 1)
        }
        Thread.sleep(forTimeInterval: 1.5)
        app.terminate()
    }
    func testToggle() {
        compare("toggle") { app, web, _ in
            let toggle = web ? app.webViews.switches.firstMatch : app.switches.firstMatch
            XCTAssertTrue(toggle.waitForExistence(timeout: 10))
            for duration in [0.05, 0.08, 0.1, 0.15, 0.6] {
                toggle.press(forDuration: duration)
                Thread.sleep(forTimeInterval: 1)
            }
        }
    }
    func testSegment() {
        compare("segment") { app, web, _ in
            let two = web ? app.webViews.buttons["Two"] : app.segmentedControls.buttons["Two"]
            XCTAssertTrue(two.waitForExistence(timeout: 10))
            two.tap()
            Thread.sleep(forTimeInterval: 1)
            let one = web ? app.webViews.buttons["One"] : app.segmentedControls.buttons["One"]
            one.press(forDuration: 0.7)
            Thread.sleep(forTimeInterval: 1)
            one.press(forDuration: 0.2, thenDragTo: two)
        }
    }
    func testRange() {
        compare("range") { app, web, _ in
            let slider = web ? app.webViews.sliders.firstMatch : app.sliders.firstMatch
            XCTAssertTrue(slider.waitForExistence(timeout: 10))
            slider.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
                .press(forDuration: 0.7, thenDragTo: slider.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.5)), withVelocity: .slow, thenHoldForDuration: 0.5)
        }
    }
    func testTabs() {
        compare("tabs") { app, web, _ in
            let two = web ? app.webViews.buttons["Two"] : app.tabBars.buttons["Two"]
            XCTAssertTrue(two.waitForExistence(timeout: 10))
            two.tap()
            Thread.sleep(forTimeInterval: 1)
            let one = web ? app.webViews.buttons["One"] : app.tabBars.buttons["One"]
            one.press(forDuration: 0.7)
            Thread.sleep(forTimeInterval: 1)
            one.press(forDuration: 0.2, thenDragTo: two)
        }
    }
    func testTabsMotion() {
        compare("tabs-motion") { app, web, _ in
            let one = web ? app.webViews.buttons["One"] : app.tabBars.buttons["One"]
            let two = web ? app.webViews.buttons["Two"] : app.tabBars.buttons["Two"]
            XCTAssertTrue(one.waitForExistence(timeout: 10))
            // Selected press, then alternating transfers. Keep actual input timestamps;
            // XCTest's requested hold is not necessarily the delivered duration.
            one.press(forDuration: 0.7)
            Thread.sleep(forTimeInterval: 1.2)
            for (index, duration) in [0.05, 0.08, 0.15, 0.7].enumerated() {
                let target = index.isMultiple(of: 2) ? two : one
                target.press(forDuration: duration)
                Thread.sleep(forTimeInterval: 1.2)
                XCTAssertTrue(target.isSelected, "Tab selection must commit, not merely animate then return")
            }
            one.press(forDuration: 0.2, thenDragTo: two,
                withVelocity: XCUIGestureVelocity(rawValue: 80), thenHoldForDuration: 0.3)
            Thread.sleep(forTimeInterval: 1.2)
            XCTAssertTrue(two.isSelected)
            two.press(forDuration: 0.2, thenDragTo: one,
                withVelocity: XCUIGestureVelocity(rawValue: 600), thenHoldForDuration: 0)
            Thread.sleep(forTimeInterval: 1.2)
            XCTAssertTrue(one.isSelected)
        }
    }
    func testTabsController() {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            app.launchArguments = ["control=tabs-controller", appearance]
            app.launch()
            let two = app.tabBars.buttons["Two"]
            XCTAssertTrue(two.waitForExistence(timeout: 10))
            Thread.sleep(forTimeInterval: 1)
            capture("tabs-controller-native-\(appearance)-rest")
            two.tap()
            Thread.sleep(forTimeInterval: 1.2)
            app.tabBars.buttons["One"].press(forDuration: 0.7)
            Thread.sleep(forTimeInterval: 1.5)
            capture("tabs-controller-native-\(appearance)-end")
            flushTabs(app, kind: "tabs-controller")
            app.terminate()
        }
    }
    func testSearch() {
        compare("search") { app, web, _ in
            let field = web ? app.webViews.searchFields.firstMatch : app.searchFields.firstMatch
            XCTAssertTrue(field.waitForExistence(timeout: 10))
            field.tap()
            field.typeText("Ionic")
        }
    }
    func testShellButton() {
        compareShell("button") { app in
            let button = app.buttons["Glass"]
            XCTAssertTrue(button.waitForExistence(timeout: 10))
            button.tap()
            Thread.sleep(forTimeInterval: 1)
            button.press(forDuration: 0.7)
            Thread.sleep(forTimeInterval: 1)
        }
    }
    func testShellSegment() {
        compareShell("segment") { app in
            let two = app.segmentedControls.buttons["Two"]
            XCTAssertTrue(two.waitForExistence(timeout: 10))
            two.tap()
            Thread.sleep(forTimeInterval: 1)
            let one = app.segmentedControls.buttons["One"]
            one.press(forDuration: 0.7)
            Thread.sleep(forTimeInterval: 1)
            one.press(forDuration: 0.2, thenDragTo: two)
        }
    }
    func testShellTabs() {
        compareShell("tabs") { app in
            let two = app.tabBars.buttons["Two"]
            XCTAssertTrue(two.waitForExistence(timeout: 10))
            two.tap()
            Thread.sleep(forTimeInterval: 1)
            let one = app.tabBars.buttons["One"]
            one.press(forDuration: 0.7)
            Thread.sleep(forTimeInterval: 1)
            one.press(forDuration: 0.2, thenDragTo: two)
        }
    }
    // Overlay rest = presented at rest (after tap); input times come from the probe recorder.
    private func compareOverlay(_ kind: String, confirm: String) {
        for appearance in ["light", "dark"] {
            for web in [false, true] {
                let app = XCUIApplication()
                app.launchArguments = ["control=\(kind)", appearance] + (web ? ["web"] : [])
                app.launch()
                if web { XCTAssertTrue(app.webViews.staticTexts["Ready"].waitForExistence(timeout: 15)) }
                let show = web ? app.webViews.buttons["Show overlay"] : app.buttons["Show overlay"]
                XCTAssertTrue(show.waitForExistence(timeout: 10))
                show.tap()
                let confirmButton: XCUIElement
                if web {
                    confirmButton = app.webViews.buttons[confirm]
                } else if kind == "alert" {
                    confirmButton = app.alerts.buttons[confirm]
                } else {
                    confirmButton = app.sheets.buttons[confirm]
                }
                XCTAssertTrue(confirmButton.waitForExistence(timeout: 10))
                capture("\(kind)-\(web ? "web" : "native")-\(appearance)-rest")
                let cancel: XCUIElement
                if web {
                    cancel = app.webViews.buttons["Cancel"]
                } else if kind == "alert" {
                    cancel = app.alerts.buttons["Cancel"]
                } else {
                    cancel = app.sheets.buttons["Cancel"]
                }
                cancel.tap()
                XCTAssertTrue(confirmButton.waitForNonExistence(timeout: 5))
                app.terminate()
            }
        }
    }
    func testAlert() { compareOverlay("alert", confirm: "OK") }
    func testActionSheet() { compareOverlay("action-sheet", confirm: "Share") }
}
