import XCTest

final class NativeUIShellTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
    }

    func testDarkAppearanceAndRotation() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "io.ionic.theme.ios27")
        app.launch()
        let toggle = app.webViews.switches["Dark Mode"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 15), app.debugDescription)
        toggle.tap()
        let entry = app.webViews.buttons["native-ui-shell (Experimental)"]
        for _ in 0..<8 {
            if entry.isHittable { break }
            app.swipeUp()
        }
        entry.tap()
        let button = nativeButton(app, label: "Save")
        XCTAssertTrue(button.waitForExistence(timeout: 10), app.debugDescription)
        capture("native-dark")
        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }
        XCTAssertTrue(button.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(button.isHittable, app.debugDescription)
        capture("native-landscape")
        button.tap()
        XCTAssertTrue(savedOnce(app).waitForExistence(timeout: 5), app.debugDescription)
    }

    func testNativeMenuButton() throws {
        let app = XCUIApplication(bundleIdentifier: "io.ionic.theme.ios27")
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))
        openPage(app, name: "native-ui-shell")
        let menu = nativeButton(app, label: "menu")
        XCTAssertTrue(menu.waitForExistence(timeout: 15), app.debugDescription)
        capture("native-menu-button")
        for cycle in 0..<3 {
            menu.tap()
            XCTAssertTrue(app.tabBars.firstMatch.waitForNonExistence(timeout: 5), app.debugDescription)
            XCTAssertTrue(menu.waitForNonExistence(timeout: 5), app.debugDescription)
            waitForWebTransition()
            if cycle == 0 { capture("native-menu-open") }
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.55)).tap()
            XCTAssertTrue(menu.waitForExistence(timeout: 5), app.debugDescription)
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
        }
        app.buttons["back"].firstMatch.tap()
        XCTAssertTrue(app.webViews.switches["Dark Mode"].waitForExistence(timeout: 10))
        openPage(app, name: "native-ui-shell")
        XCTAssertTrue(menu.waitForExistence(timeout: 10), app.debugDescription)
        menu.tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForNonExistence(timeout: 5))
        waitForWebTransition()
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.55)).tap()
        XCTAssertTrue(menu.waitForExistence(timeout: 5))
        capture("native-menu-restored")
    }

    func testInteractiveBackCancellation() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "io.ionic.theme.ios27")
        app.launch()
        let entry = app.webViews.buttons["native-ui-shell (Experimental)"]
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))
        for _ in 0..<8 {
            if entry.isHittable { break }
            app.swipeUp()
        }
        entry.tap()
        let save = nativeButton(app, label: "Save")
        XCTAssertTrue(save.waitForExistence(timeout: 10))
        let native = app.buttons[save.identifier]
        XCTAssertTrue(native.identifier.hasPrefix("shell-"))
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.005, dy: 0.55))
        start.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.22, dy: 0.55)), withVelocity: .slow, thenHoldForDuration: 0.3)
        XCTAssertTrue(native.waitForExistence(timeout: 5), app.debugDescription)
        capture("native-back-cancelled")
        native.tap()
        XCTAssertTrue(savedOnce(app).waitForExistence(timeout: 5), app.debugDescription)
        start.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.55)), withVelocity: .slow, thenHoldForDuration: 0.1)
        XCTAssertTrue(native.waitForNonExistence(timeout: 5), app.debugDescription)
        capture("native-back-completed")
    }

    func testPackagedNativePlugin() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        app.launch()
        let button = nativeButton(app, label: "Native fixture")
        XCTAssertTrue(button.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(button.identifier.hasPrefix("shell-"), app.debugDescription)
        capture("native-packed-spm")
    }

    func testSceneBackgroundAndResume() throws {
        let app = XCUIApplication(bundleIdentifier: "io.ionic.theme.ios27")
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))
        let entry = app.webViews.buttons["native-ui-shell (Experimental)"]
        for _ in 0..<8 {
            if entry.isHittable { break }
            app.swipeUp()
        }
        entry.tap()
        let save = nativeButton(app, label: "Save")
        XCTAssertTrue(save.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertFalse(nativeButton(app, label: "Cancel").exists, "Text-only toolbar actions must remain in Web")
        XCTAssertTrue(app.webViews.buttons["Cancel"].firstMatch.exists, app.debugDescription)
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 5))
        app.activate()
        XCTAssertTrue(save.waitForExistence(timeout: 10), app.debugDescription)
        save.tap()
        XCTAssertTrue(savedOnce(app).waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.tabBars.firstMatch.exists, app.debugDescription)
        capture("native-scene-resumed")
    }

    func testTabPlacementAndSelection() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 15), app.debugDescription)
        for direction in ["ltr", "rtl"] {
            app.webViews.buttons["Direction " + direction].tap()
            for slot in ["top", "bottom"] {
                app.webViews.buttons["Slot " + slot].tap()
                for position in ["start", "center", "end"] {
                    app.webViews.buttons["Position " + position].tap()
                    let left = (position == "start") == (direction == "ltr")
                    let aligned = NSPredicate { _, _ in
                        // Check the actual interactive tabs, not UITabBar's larger outer frame.
                        // The iOS 26/27 tab platter has 4pt between its edge and its buttons.
                        let buttons = tabs.buttons.allElementsBoundByIndex.map(\.frame).reduce(CGRect.null) { $0.union($1) }
                        guard !buttons.isNull else { return false }
                        let content = buttons.insetBy(dx: -4, dy: -4)
                        let horizontal = position == "center" ? abs(content.midX - app.frame.midX)
                            : left ? abs(content.minX - 16) : abs(content.maxX - (app.frame.width - 16))
                        return abs(content.width - 300) < 1 && horizontal < 1 &&
                            abs((slot == "top" ? content.minY : content.maxY) - (slot == "top" ? 160 : app.frame.height - 80)) < 1
                    }
                    XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: aligned, object: tabs)], timeout: 5), .completed,
                                   "Placement " + direction + " " + slot + " " + position + "\n" + app.debugDescription)
                    capture("placement-" + direction + "-" + slot + "-" + position)
                }
            }
        }
        for name in ["Two", "Three", "One", "Two"] {
            tabs.buttons[name].tap()
            XCTAssertTrue(tabs.buttons[name].isSelected)
            capture("tab-tint-" + name)
        }
        app.webViews.buttons["Three tabs"].tap()
        for position in ["start", "center", "end", "start"] {
            app.webViews.buttons["Position " + position].tap()
            let aligned = NSPredicate { _, _ in
                let buttons = tabs.buttons.allElementsBoundByIndex
                guard buttons.count == 3 else { return false }
                let content = buttons.map(\.frame).reduce(CGRect.null) { $0.union($1) }.insetBy(dx: -4, dy: -4)
                let horizontal = position == "center" ? abs(content.midX - app.frame.midX)
                    : position == "start" ? abs(content.maxX - (app.frame.width - 16)) : abs(content.minX - 16)
                return content.width <= 301 && horizontal < 1 && tabs.frame.width <= app.frame.width + 1 &&
                    abs(content.maxY - (app.frame.height - 80)) < 1
            }
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: aligned, object: tabs)], timeout: 5), .completed,
                           "UIKit constrained width " + position + "\n" + app.debugDescription)
            capture("constrained-" + position)
        }
    }

    func testNativeButtonAndBackground() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "io.ionic.theme.ios27")
        app.launch()
        let entry = app.webViews.buttons["native-ui-shell (Experimental)"]
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))
        for _ in 0..<8 {
            if entry.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(entry.isHittable, app.debugDescription)
        entry.tap()

        let save = nativeButton(app, label: "Save")
        XCTAssertTrue(save.waitForExistence(timeout: 10), app.debugDescription)
        let native = app.buttons[save.identifier]
        XCTAssertTrue(native.identifier.hasPrefix("shell-"), app.debugDescription)
        XCTAssertEqual(native.label, "Save")
        capture("native-initial")
        let github = nativeButton(app, label: "GitHub")
        let refresh = nativeButton(app, label: "Refresh")
        XCTAssertTrue(github.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(refresh.exists, app.debugDescription)
        github.tap()
        refresh.tap()
        XCTAssertTrue(app.webViews.staticTexts["Actions: 1 / 1"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.tabBars.firstMatch.exists, "Tabs must use UIKit's tab bar")
        capture("native-ion-icon-group-and-tabs")
        native.tap()
        XCTAssertTrue(savedOnce(app).waitForExistence(timeout: 5), app.debugDescription)

        app.webViews.buttons["Parent hidden: false"].tap()
        XCTAssertTrue(native.waitForNonExistence(timeout: 5))
        app.webViews.buttons["Parent hidden: true"].tap()
        XCTAssertTrue(native.waitForExistence(timeout: 5))

        app.webViews.buttons["Theme disabled: false"].tap()
        XCTAssertTrue(native.waitForNonExistence(timeout: 5))
        app.webViews.buttons["Theme disabled: true"].tap()
        XCTAssertTrue(native.waitForExistence(timeout: 5))

        app.webViews.buttons["fill: clear"].tap()
        XCTAssertTrue(native.waitForNonExistence(timeout: 5))
        app.webViews.buttons["fill: default"].tap()
        XCTAssertTrue(native.waitForExistence(timeout: 5))

        app.webViews.buttons["disabled: false"].tap()
        XCTAssertFalse(native.isEnabled)
        app.webViews.buttons["disabled: true"].tap()
        XCTAssertTrue(native.isEnabled)

        let segment = app.segmentedControls.firstMatch
        XCTAssertTrue(segment.waitForExistence(timeout: 5), app.debugDescription)
        segment.buttons["Two"].tap()
        XCTAssertTrue(app.webViews.staticTexts.matching(NSPredicate(format: "label == %@ OR label == %@", "2", "Selection: 2 / Change count: 1")).firstMatch.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(segment.buttons["Three"].isEnabled)
        app.webViews.buttons["Select One programmatically"].tap()

        app.webViews.buttons["Open modal"].tap()
        XCTAssertTrue(segment.waitForNonExistence(timeout: 5), app.debugDescription)
        app.webViews.buttons["Close modal"].tap()
        XCTAssertTrue(segment.waitForExistence(timeout: 5), app.debugDescription)

        app.swipeUp()
        capture("native-over-stripes-1")
        app.swipeUp()
        capture("native-over-stripes-2")
        native.tap()
        capture("native-after-scroll-tap")

        app.buttons["back"].tap()
        XCTAssertTrue(native.waitForNonExistence(timeout: 5), app.debugDescription)
        let settings = app.buttons["Settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 5), app.debugDescription)
        settings.tap()
        XCTAssertTrue(app.webViews.staticTexts["Settings"].firstMatch.waitForExistence(timeout: 5), app.debugDescription)
        capture("native-tab-settings")
    }

    func testNativeFoldableRail() throws {
        let app = XCUIApplication(bundleIdentifier: "io.ionic.theme.ios27")
        app.launch()
        let toggle = app.webViews.switches["Foldable Mode"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 15), app.debugDescription)
        if toggle.value as? String == "0" { toggle.tap() }

        let index = app.buttons["Index"]
        let library = app.buttons["Library"]
        XCTAssertTrue(index.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(library.waitForExistence(timeout: 10), app.debugDescription)
        assertOnFoldableRail(index, in: app)
        library.tap()
        XCTAssertTrue(app.webViews.staticTexts["Library"].firstMatch.waitForExistence(timeout: 5), "The native tab did not project its activation to Web\n" + app.debugDescription)
        XCTAssertTrue(library.isSelected, app.debugDescription)
        index.tap()
        XCTAssertTrue(toggle.waitForExistence(timeout: 5), app.debugDescription)
        capture("native-foldable-index")
        openPage(app, name: "native-ui-shell")
        let save = nativeButton(app, label: "Save")
        XCTAssertTrue(save.waitForExistence(timeout: 10), app.debugDescription)
        save.tap()
        XCTAssertTrue(savedOnce(app).waitForExistence(timeout: 5), app.debugDescription)
        let more = app.buttons["More"]
        XCTAssertTrue(more.waitForExistence(timeout: 5), app.debugDescription)
        more.tap()
        XCTAssertTrue(app.buttons["GitHub"].waitForExistence(timeout: 5), app.debugDescription)
        capture("native-foldable-toolbar-more")
        app.buttons["GitHub"].tap()
        XCTAssertTrue(app.webViews.staticTexts["Actions: 1 / 0"].waitForExistence(timeout: 5), app.debugDescription)
        more.tap()
        XCTAssertTrue(app.buttons["Refresh"].waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["Refresh"].tap()
        XCTAssertTrue(app.webViews.staticTexts["Actions: 1 / 1"].waitForExistence(timeout: 5), app.debugDescription)
        capture("native-foldable-toolbar")

        let back = app.buttons["BackButton"]
        XCTAssertTrue(back.waitForExistence(timeout: 5), app.debugDescription)
        assertOnFoldableRail(back, in: app)
        back.tap()
        XCTAssertTrue(toggle.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(nativeButton(app, label: "GitHub").waitForExistence(timeout: 10), "Index toolbar did not return after native back\n" + app.debugDescription)
        openPage(app, name: "native-ui-shell")
        XCTAssertTrue(back.waitForExistence(timeout: 5), app.debugDescription)
        let pageMenu = nativeButton(app, label: "menu")
        XCTAssertTrue(pageMenu.waitForExistence(timeout: 5), app.debugDescription)
        pageMenu.tap()
        let menuLink = app.webViews.links["Docs"]
        XCTAssertTrue(menuLink.waitForExistence(timeout: 5), app.debugDescription)
        capture("native-foldable-menu-open")
        for control in [pageMenu, back, save, library] {
            XCTAssertTrue(control.waitForExistence(timeout: 5), "Every foldable rail control must remain native while the menu is open\n" + app.debugDescription)
            assertOnFoldableRail(control, in: app)
            XCTAssertTrue(control.isEnabled, "Foldable rail controls must remain enabled while Ionic disables the covered page\n" + app.debugDescription)
        }
        save.tap()
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.81, dy: 0.55)).tap()
        XCTAssertTrue(menuLink.waitForNonExistence(timeout: 5), "The projected Ionic menu button did not close its menu\n" + app.debugDescription)
        XCTAssertTrue(savedOnce(app).waitForExistence(timeout: 5), "The native control stopped projecting actions while the menu was open\n" + app.debugDescription)
        capture("native-foldable-after-menu")
    }

    private func assertOnFoldableRail(_ element: XCUIElement, in app: XCUIApplication,
                                      file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertGreaterThan(element.frame.midX, app.frame.width * 0.8,
                             "Expected native control on the physical right rail, got \(element.frame) in \(app.frame)",
                             file: file, line: line)
    }

    func testNativeShellPageAuditAndRepeatedNavigation() throws {
        executionTimeAllowance = 900
        let app = XCUIApplication(bundleIdentifier: "io.ionic.theme.ios27")
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))
        // The native-ui-shell page carries every projected control (back
        // button, toolbar buttons, segment) above the shell's tab bar, so it
        // alone audits the projection. Per-page sweeps are covered by the
        // Playwright e2e suite and only slow this test down.
        openPage(app, name: "native-ui-shell")
        let back = app.buttons["back"].firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 10), "Missing back button\n" + app.debugDescription)
        XCTAssertTrue(nativeButton(app, label: "Save").waitForExistence(timeout: 10), "Missing UIKit Save button\n" + app.debugDescription)
        XCTAssertTrue(app.segmentedControls.firstMatch.waitForExistence(timeout: 10), "Missing UIKit segment\n" + app.debugDescription)
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10), "Missing UIKit tabs\n" + app.debugDescription)
        capture("page-native-ui-shell")
        back.tap()
        XCTAssertTrue(app.webViews.switches["Dark Mode"].waitForExistence(timeout: 10), "Failed to return from native-ui-shell")
        waitForWebTransition()
        for _ in 0..<3 {
            openPage(app, name: "button")
            app.webViews.buttons["Push"].tap()
            XCTAssertTrue(app.webViews.staticTexts["action-sheet"].firstMatch.waitForExistence(timeout: 10))
            waitForWebTransition()
            app.buttons["back"].firstMatch.tap()
            XCTAssertTrue(app.webViews.buttons["Push"].waitForExistence(timeout: 10))
            waitForWebTransition()
            app.buttons["back"].firstMatch.tap()
            XCTAssertTrue(app.webViews.switches["Dark Mode"].waitForExistence(timeout: 10))
            waitForWebTransition()
        }
        for name in ["Docs", "Library", "Index", "Docs", "Library", "Index", "Settings"] {
            let tab = app.tabBars.buttons[name]
            XCTAssertTrue(tab.waitForExistence(timeout: 5), app.debugDescription)
            tab.tap()
            XCTAssertTrue(app.webViews.staticTexts[name].firstMatch.waitForExistence(timeout: 10), app.debugDescription)
            waitForWebTransition()
            capture("tab-" + name)
        }
        XCTAssertTrue(app.tabBars.firstMatch.waitForNonExistence(timeout: 5), "Settings deliberately hides the tab bar")
        app.buttons["back"].firstMatch.tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
    }

    func testFabFourDirectionsAndRepeatedOpening() throws {
        let app = XCUIApplication(bundleIdentifier: "io.ionic.theme.ios27")
        app.launch()
        openPage(app, name: "floating-action-button")
        let main = app.buttons["Center FAB actions"]
        XCTAssertTrue(main.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(main.identifier.hasPrefix("shell-"), "FAB must be UIKit, not Web fallback")
        let identity = main.identifier
        let labels = ["Up action", "Right action one", "Right action two", "Down action", "Left action one", "Left action two"]
        capture("fab-cold-closed")
        main.tap()
        for label in labels {
            let child = app.buttons[label]
            XCTAssertTrue(child.waitForExistence(timeout: 5), app.debugDescription)
            XCTAssertTrue(child.identifier.hasPrefix("shell-"))
            XCTAssertEqual(child.frame.width, 48, accuracy: 1)
            XCTAssertEqual(child.frame.height, 48, accuracy: 1)
        }
        capture("fab-four-directions")
        app.buttons["Up action"].tap()
        XCTAssertTrue(app.buttons["Up action"].waitForNonExistence(timeout: 5))
        XCTAssertEqual(main.identifier, identity)
        for _ in 0..<4 {
            main.doubleTap()
            XCTAssertTrue(app.buttons["Up action"].waitForNonExistence(timeout: 5))
            XCTAssertEqual(main.identifier, identity)
        }
        main.tap()
        XCTAssertTrue(app.buttons["Right action two"].waitForExistence(timeout: 5))
        capture("fab-reopened")
        app.buttons["back"].firstMatch.tap()
        XCTAssertTrue(main.waitForNonExistence(timeout: 5))
        openPage(app, name: "floating-action-button")
        // Returning creates a new Ionic page and therefore a new native identity.
        XCTAssertTrue(app.buttons["Center FAB actions"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Up action"].waitForNonExistence(timeout: 5))
    }

    func testPackagedFabStartsExpanded() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        app.launch()
        let main = app.buttons["Initially expanded FAB"]
        let child = app.buttons["Fixture FAB action"]
        XCTAssertTrue(child.waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertTrue(app.webViews.staticTexts["FAB source: native"].waitForExistence(timeout: 15))
        XCTAssertTrue(main.identifier.hasPrefix("shell-"))
        XCTAssertTrue(child.identifier.hasPrefix("shell-"))
        XCTAssertFalse(app.buttons["Fixture disabled action"].isEnabled)
        capture("fab-initially-expanded")
        child.tap()
        XCTAssertTrue(app.webViews.staticTexts["FAB clicks: 1"].waitForExistence(timeout: 5))
        XCTAssertTrue(child.waitForNonExistence(timeout: 5))
        main.tap()
        XCTAssertTrue(child.waitForExistence(timeout: 5))
        child.tap()
        XCTAssertTrue(app.webViews.staticTexts["FAB clicks: 2"].waitForExistence(timeout: 5))
        XCTAssertTrue(child.waitForNonExistence(timeout: 5))
        let single = app.buttons["Standalone FAB"]
        XCTAssertTrue(single.identifier.hasPrefix("shell-"))
        single.tap()
        XCTAssertTrue(app.webViews.staticTexts["Standalone clicks: 1"].waitForExistence(timeout: 5))
        XCTAssertEqual(main.value as? String, "Collapsed")
        app.webViews.buttons["Remove FAB list"].tap()
        let noExpansionState = NSPredicate(format: "value == nil OR value == ''")
        expectation(for: noExpansionState, evaluatedWith: main)
        waitForExpectations(timeout: 5)
        XCTAssertTrue(main.identifier.hasPrefix("shell-"))
    }

    private func openPage(_ app: XCUIApplication, name: String) {
        let entry = app.webViews.buttons[name == "native-ui-shell" ? "native-ui-shell (Experimental)" : name]
        // WebKit's isHittable does not account for a sibling native tab bar.
        func unobscured() -> Bool {
            entry.isHittable && entry.frame.midY > app.frame.minY + 130 && entry.frame.midY < app.frame.maxY - 120
        }
        for _ in 0..<20 {
            if unobscured() { break }
            let below = entry.frame.midY >= app.frame.maxY - 120
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: below ? 0.65 : 0.35))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: below ? 0.35 : 0.65))
            start.press(forDuration: 0.05, thenDragTo: end)
        }
        XCTAssertTrue(unobscured(), "Cannot open " + name + "\n" + app.debugDescription)
        entry.tap()
        waitForWebTransition()
    }

    private func waitForWebTransition() {
        // XCTest's app-idle check does not wait for Ionic's WebKit animations.
        Thread.sleep(forTimeInterval: 0.7)
    }

    private func savedOnce(_ app: XCUIApplication) -> XCUIElement {
        // WebKit may expose adjacent text and <strong> as one accessibility element.
        app.webViews.staticTexts.matching(NSPredicate(format: "label == %@ OR label == %@", "1", "Save count: 1")).firstMatch
    }

    private func nativeButton(_ app: XCUIApplication, label: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label == %@ AND identifier BEGINSWITH %@", label, "shell-")).firstMatch
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
