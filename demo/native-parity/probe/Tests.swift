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
        guard kind.hasPrefix("tabs") || kind.hasPrefix("fab") else { return }
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
    func testFab() {
        compare("fab") { app, web, _ in
            let button = web ? app.webViews.buttons["Search"] : app.buttons["Search"]
            XCTAssertTrue(button.waitForExistence(timeout: 10))
            for duration in [0.05, 0.15, 0.7] {
                button.press(forDuration: duration)
                Thread.sleep(forTimeInterval: 1.2)
            }
        }
    }
    func testFabMatrix() {
        let app = XCUIApplication()
        app.launchArguments = ["control=fab-matrix", "light"]
        app.launch()
        XCTAssertTrue(app.buttons["Fab-48"].waitForExistence(timeout: 10))
        Thread.sleep(forTimeInterval: 1)
        capture("fab-matrix-native-light-rest")
        for size in [48, 62] {
            for duration in [0.05, 0.15, 0.7] {
                app.buttons["Fab-\(size)"].press(forDuration: duration)
                Thread.sleep(forTimeInterval: 1.2)
            }
        }
        flushTabs(app, kind: "fab-matrix")
        app.terminate()
    }
    func testShellFab() {
        compareShell("fab") { app in
            let button = app.buttons["Search"]
            XCTAssertTrue(button.waitForExistence(timeout: 10))
            button.press(forDuration: 0.7)
            Thread.sleep(forTimeInterval: 1.2)
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
    func testTabsCountsNative() {
        tabsCountsNative(prefix: "tabs-count")
    }
    func testTabsWidthsNative() {
        tabsWidthsNative([260, 320, 344, 360, 402, 600])
    }
    func testTabsWidthBreakpointsNative() {
        tabsWidthsNative([340, 346, 348, 350, 352, 356, 376, 392, 416, 440])
    }
    func testTabsWidthFiveBoundaryNative() {
        tabsWidthsNative([347, 394, 396, 398, 400])
    }
    func testTabsWidthFractionalNative() {
        tabsWidthsNative([3471, 3475, 3479, 397, 3971, 3975, 3979])
    }
    private func tabsWidthsNative(_ widths: [Int]) {
        for width in widths {
            let kind = "tabs-width-\(width)"
            let app = XCUIApplication()
            app.launchArguments = ["control=\(kind)", "light"]
            app.launch()
            XCTAssertTrue(app.tabBars["Tabs1"].waitForExistence(timeout: 10))
            Thread.sleep(forTimeInterval: 1)
            capture("\(kind)-native-light-rest")
            app.tabBars["Tabs1"].buttons["One"].press(forDuration: 0.7)
            Thread.sleep(forTimeInterval: 1.2)
            flushTabs(app, kind: kind)
            app.terminate()
        }
    }
    func testTabsIconsNative() {
        tabsCountsNative(prefix: "tabs-icons")
    }
    private func tabsCountsNative(prefix: String) {
        for count in 1...5 {
            for appearance in ["light", "dark"] {
                let kind = "\(prefix)-\(count)"
                let app = XCUIApplication()
                app.launchArguments = ["control=\(kind)", appearance]
                app.launch()
                let one = app.tabBars.buttons["One"]
                XCTAssertTrue(one.waitForExistence(timeout: 10))
                Thread.sleep(forTimeInterval: 1)
                capture("\(kind)-native-\(appearance)-rest")
                one.press(forDuration: 0.7)
                Thread.sleep(forTimeInterval: 1.2)
                if count > 1 {
                    let last = app.tabBars.buttons[["One", "Two", "Three", "Four", "Five"][count - 1]]
                    last.tap()
                    Thread.sleep(forTimeInterval: 1.2)
                    XCTAssertTrue(last.isSelected)
                }
                capture("\(kind)-native-\(appearance)-end")
                flushTabs(app, kind: kind)
                app.terminate()
            }
        }
    }
    func testTabsCountsWebShell() {
        tabsCountsWebShell(prefix: "tabs-count")
    }
    func testTabsIconsWebShell() {
        tabsCountsWebShell(prefix: "tabs-icons")
    }
    private func tabsCountsWebShell(prefix: String) {
        for count in 1...5 {
            let kind = "\(prefix)-\(count)"
            for appearance in ["light", "dark"] {
                for shell in [false, true] {
                    let app = XCUIApplication()
                    app.launchArguments = ["control=\(kind)", appearance, shell ? "shell" : "web"]
                    app.launch()
                    let ready = shell ? app.staticTexts["Shell Ready"] : app.webViews.staticTexts["Ready"]
                    XCTAssertTrue(ready.waitForExistence(timeout: 15))
                    Thread.sleep(forTimeInterval: 1)
                    let renderer = shell ? "shell" : "web"
                    capture("\(kind)-\(renderer)-\(appearance)-rest")
                    let one = shell ? app.tabBars.buttons["One"] : app.webViews.buttons["One"]
                    one.press(forDuration: 0.7)
                    Thread.sleep(forTimeInterval: 1.2)
                    if count > 1 {
                        let title = ["One", "Two", "Three", "Four", "Five"][count - 1]
                        let last = shell ? app.tabBars.buttons[title] : app.webViews.buttons[title]
                        last.tap()
                        Thread.sleep(forTimeInterval: 1.2)
                        XCTAssertTrue(last.isSelected)
                    }
                    capture("\(kind)-\(renderer)-\(appearance)-end")
                    flushTabs(app, kind: kind)
                    app.terminate()
                }
            }
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
