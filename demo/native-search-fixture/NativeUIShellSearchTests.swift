import XCTest
final class NativeUIShellSearchTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false; XCUIDevice.shared.orientation = .portrait }
    private func searchField(_ app: XCUIApplication) -> XCUIElement {
        app.searchFields.matching(NSPredicate(format: "identifier BEGINSWITH 'shell-'")).firstMatch
    }
    private func openSearch(_ app: XCUIApplication) -> XCUIElement {
        app.launch()
        let library = app.tabBars.buttons["Library"]
        XCTAssertTrue(library.waitForExistence(timeout: 30), app.debugDescription)
        library.tap()
        let search = app.tabBars.buttons["Search"]
        XCTAssertTrue(search.waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertTrue(probe(app, contains: "Probe native").waitForExistence(timeout: 5), app.debugDescription)
        search.tap()
        let field = searchField(app)
        XCTAssertTrue(field.waitForExistence(timeout: 10), app.debugDescription)
        return field
    }
    // Focus through the fixture's Web button so focus and presentation
    // activation arrive in a single snapshot instead of a tap that races the
    // field's remount; then re-expand if the transition collapsed the search.
    private func focusSearch(_ app: XCUIApplication) {
        let focusButton = app.webViews.buttons["Focus search"]
        for _ in 0..<4 {
            let field = searchField(app)
            if !(field.exists && field.isHittable) {
                let search = app.tabBars.buttons["Search"]
                if search.isHittable { search.tap() }
                guard field.waitForExistence(timeout: 10) else { continue }
            }
            guard focusButton.waitForExistence(timeout: 5) else { continue }
            focusButton.tap()
            guard app.keyboards.firstMatch.waitForExistence(timeout: 5) else { continue }
            var stable = 0
            let confirm = Date().addingTimeInterval(3)
            while Date() < confirm {
                if searchField(app).isHittable && app.keyboards.firstMatch.exists {
                    stable += 1
                    if stable >= 10 { return }
                } else { stable = 0 }
                usleep(100_000)
            }
        }
        XCTFail("Search field focus never stabilized: \(app.debugDescription)")
    }
    private func typeInSearch(_ app: XCUIApplication, _ text: String) {
        focusSearch(app)
        searchField(app).typeText(text)
    }
    private func probe(_ app: XCUIApplication, contains: String) -> XCUIElement {
        app.webViews.buttons.matching(NSPredicate(format: "label CONTAINS %@", contains)).firstMatch
    }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
    func testSearchExpansionKeepsNativeOwnership() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Library"].waitForExistence(timeout: 30))
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(probe(app, contains: "Probe native").waitForExistence(timeout: 10))
        app.webViews.buttons["Watch search"].tap()
        for _ in 0..<3 {
            app.tabBars.buttons["Search"].tap()
            let field = app.searchFields.matching(NSPredicate(format: "identifier BEGINSWITH 'shell-'")).firstMatch
            XCTAssertTrue(field.waitForExistence(timeout: 10), app.debugDescription)
            XCTAssertTrue(field.isHittable)
            app.tabBars.buttons["Library"].tap()
            XCTAssertTrue(app.tabBars.buttons["Search"].waitForExistence(timeout: 10), app.debugDescription)
        }
        app.webViews.buttons["Stop watch"].tap()
        let result = probe(app, contains: "watch:done")
        XCTAssertTrue(result.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(result.label.contains("releases:0 exposed:0"), result.label)
        print("SEARCH OWNERSHIP: \(result.label)")
        capture("search-expansion-ownership")
    }
    func testIntegratedSearch() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        let field = openSearch(app)
        XCTAssertFalse(app.keyboards.firstMatch.exists)
        probe(app, contains: "Probe native").tap()
        XCTAssertTrue(probe(app, contains: "clicks:1").waitForExistence(timeout: 5))
        typeInSearch(app, "glass")
        XCTAssertTrue(probe(app, contains: "value:glass").waitForExistence(timeout: 5), app.debugDescription)
        // The focus helper can legitimately refocus the field while the
        // presentation remount settles, so only require at least one focus.
        let focused = NSPredicate { _, _ in
            self.probe(app, contains: "focus:").label.range(of: "focus:[1-9]", options: .regularExpression) != nil
        }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: focused, object: app)], timeout: 5), .completed, app.debugDescription)
        capture("native-search-editing")
        app.buttons["Close"].firstMatch.tap()
        XCTAssertTrue(app.tabBars.buttons["Library"].waitForExistence(timeout: 10), app.debugDescription)
        app.tabBars.buttons["Library"].tap()
        let search = app.tabBars.buttons["Search"]
        XCTAssertTrue(search.waitForExistence(timeout: 10), app.debugDescription)
        search.tap()
        XCTAssertTrue(field.waitForExistence(timeout: 10)); XCTAssertEqual(field.value as? String, "glass")
        app.webViews.buttons["External value"].tap()
        XCTAssertTrue(NSPredicate(format: "value == 'external'").evaluate(with: field), app.debugDescription)
        focusSearch(app)
        field.buttons.firstMatch.tap()
        XCTAssertTrue(probe(app, contains: "clear:1").waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(probe(app, contains: "value: viewport:").waitForExistence(timeout: 5))
        app.buttons["Close"].firstMatch.tap()
        XCTAssertTrue(app.tabBars.buttons["Library"].waitForExistence(timeout: 10), app.debugDescription)
        app.tabBars.buttons["Library"].tap()
        for _ in 0..<3 {
            app.tabBars.buttons["Index"].tap()
            XCTAssertTrue(app.webViews.switches["Dark Mode"].waitForExistence(timeout: 10))
            app.tabBars.buttons["Library"].tap()
            XCTAssertTrue(search.waitForExistence(timeout: 10), app.debugDescription)
        }
        capture("native-search-restored")
    }
    func testSearchRotationAndRetirement() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        let field = openSearch(app)
        typeInSearch(app, "retained")
        app.webViews.buttons["Toggle search theme"].tap()
        XCTAssertTrue(probe(app, contains: "Probe web value:retained").waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        app.webViews.buttons["Toggle search theme"].tap()
        XCTAssertTrue(app.tabBars.buttons["Search"].waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertFalse(field.exists)
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(probe(app, contains: "viewport:landscape").waitForExistence(timeout: 10))
        // UIKit can reject the wider landscape bar; its Web source must stay usable.
        let usableTabs = NSPredicate { _, _ in app.buttons["Library"].firstMatch.isHittable }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: usableTabs, object: app)], timeout: 5), .completed, app.debugDescription)
        if !app.tabBars.buttons["Library"].exists {
            XCTAssertTrue(probe(app, contains: "Probe web value:retained").waitForExistence(timeout: 5), app.debugDescription)
            XCTAssertTrue(app.webViews.buttons["Library"].firstMatch.isHittable, app.debugDescription)
        }
        capture("native-search-landscape")
        XCUIDevice.shared.orientation = .portrait
        XCTAssertTrue(app.tabBars.buttons["Search"].waitForExistence(timeout: 10), app.debugDescription)
        app.tabBars.buttons["Search"].tap()
        XCTAssertTrue(field.waitForExistence(timeout: 10)); XCTAssertEqual(field.value as? String, "retained")
    }
    func testJapaneseComposition() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        let field = openSearch(app)
        focusSearch(app)
        print("JAPANESE KEYBOARD \(app.debugDescription)")
        let kana = app.keyboards.keys["あ"].firstMatch
        if !kana.waitForExistence(timeout: 5) {
            // A freshly created simulator can start on the QWERTY layout; cycle
            // the globe key until the Kana keyboard becomes active.
            let next = app.buttons["Next keyboard"].firstMatch
            for _ in 0..<5 where !kana.exists && next.exists {
                next.tap()
                usleep(400_000)
            }
        }
        XCTAssertTrue(kana.waitForExistence(timeout: 5), app.debugDescription)
        let visibleKana = NSPredicate { _, _ in kana.exists && kana.isHittable && app.frame.contains(kana.frame) }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: visibleKana, object: app)], timeout: 5), .completed, app.debugDescription)
        kana.tap()
        XCTAssertTrue(probe(app, contains: "ime:true").waitForExistence(timeout: 5), app.debugDescription)
        capture("native-search-japanese-composition")
        field.typeText("\n")
        XCTAssertTrue(probe(app, contains: "value:あ").waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["Close"].firstMatch.tap()
        XCTAssertTrue(app.tabBars.buttons["Library"].waitForExistence(timeout: 10), app.debugDescription)
        app.tabBars.buttons["Library"].tap()
        app.tabBars.buttons["Search"].tap()
        XCTAssertEqual(field.value as? String, "あ")
        capture("native-search-japanese-restored")
    }

    func testSearchOriginAndWebKeyboard() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        _ = openSearch(app)
        app.tabBars.buttons["Library"].tap()
        let search = app.tabBars.buttons["Search"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        app.webViews.buttons["Move FAB"].tap()
        XCTAssertTrue(probe(app, contains: "Probe web").waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(search.waitForNonExistence(timeout: 5))
        capture("native-search-moved-fab-web")
        app.webViews.buttons["Move FAB"].tap()
        XCTAssertTrue(search.waitForExistence(timeout: 10), app.debugDescription)
        let input = app.webViews.textFields["Web keyboard"]
        input.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(search.waitForNonExistence(timeout: 5), app.debugDescription)
        input.typeText("web\n")
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        XCTAssertTrue(search.waitForExistence(timeout: 10), app.debugDescription)
    }

    func testNativeKeyboardKeepsSearchFieldOrigin() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        let field = openSearch(app)
        let before = field.frame
        field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5), app.debugDescription)
        let after = field.frame
        let keyboard = app.keyboards.firstMatch.frame
        // WebView keyboard resize must not lift the native search surface again on top of UIKit avoidance.
        XCTAssertLessThan(before.minY - after.minY, keyboard.height * 0.5, app.debugDescription)
        XCTAssertGreaterThanOrEqual(after.minY, -1)
        XCTAssertTrue(field.isHittable)
        capture("native-search-keyboard-origin")
        app.buttons["Close"].firstMatch.tap()
    }

    func testSearchPositionVariants() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        _ = openSearch(app)
        app.tabBars.buttons["Library"].tap()
        for direction in ["ltr", "rtl"] {
            if direction == "rtl" { app.webViews.buttons["Toggle RTL"].tap() }
            for position in ["start", "center", "end"] {
                app.webViews.buttons["Position " + position].tap()
                let status = probe(app, contains: "position:" + position + " dir:" + direction)
                XCTAssertTrue(status.waitForExistence(timeout: 10))
                let settled = NSPredicate { _, _ in status.label.contains("settled:true") }
                XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: settled, object: status)], timeout: 5), .completed)
                let search = app.tabBars.buttons["Search"]
                if status.label.contains("Probe native") {
                    XCTAssertTrue(search.waitForExistence(timeout: 5), app.debugDescription)
                    let origin = Double(status.label.components(separatedBy: "origin:")[1].components(separatedBy: " ")[0])!
                    XCTAssertEqual(search.frame.midX, origin, accuracy: 1)
                } else {
                    XCTAssertTrue(search.waitForNonExistence(timeout: 5), app.debugDescription)
                    XCTAssertTrue(app.tabBars.buttons["Library"].isHittable)
                }
                print("SEARCH POSITION " + status.label)
                capture("search-position-" + direction + "-" + position)
            }
        }
    }

    func testSearchBackgroundRetirement() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        let field = openSearch(app)
        typeInSearch(app, "background")
        XCTAssertTrue(probe(app, contains: "value:background").waitForExistence(timeout: 5))
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.tabBars.buttons["Search"].waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(field.waitForNonExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(probe(app, contains: "value:background").waitForExistence(timeout: 5), app.debugDescription)
        capture("search-background-restored")
        app.tabBars.buttons["Search"].tap()
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        let retained = NSPredicate(format: "value == %@", "background")
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: retained, object: field)], timeout: 5), .completed, app.debugDescription)
    }

    func testSearchHeaderGeometry() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        app.launch()
        func openFab() {
            let entry = app.webViews.buttons["floating-action-button"]
            for _ in 0..<12 {
                if entry.isHittable && entry.frame.midY > 220 && entry.frame.midY < app.frame.maxY - 120 { break }
                app.swipeUp()
            }
            entry.tap()
            XCTAssertTrue(app.buttons["Center FAB actions"].waitForExistence(timeout: 10), app.debugDescription)
        }
        XCTAssertTrue(app.tabBars.buttons["Index"].waitForExistence(timeout: 20))
        openFab()
        let originalY = app.buttons["back"].firstMatch.frame.minY
        capture("header-before-search")
        app.buttons["back"].firstMatch.tap()
        XCTAssertTrue(app.tabBars.buttons["Library"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.tabBars.buttons["Search"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Search"].tap()
        let field = app.searchFields.matching(NSPredicate(format: "identifier BEGINSWITH 'shell-'")).firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        capture("header-search-expanded")
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.tabBars.buttons["Search"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Index"].tap()
        openFab()
        XCTAssertEqual(app.buttons["back"].firstMatch.frame.minY, originalY, accuracy: 1)
        capture("header-after-search")
        app.webViews.buttons["Toggle native theme"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForNonExistence(timeout: 10))
        capture("header-web-after-search")
        app.webViews.buttons["Toggle native theme"].tap()
        XCTAssertTrue(app.buttons["Center FAB actions"].waitForExistence(timeout: 10))
        capture("header-native-restored")
        app.webViews.buttons["Destroy native"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForNonExistence(timeout: 10))
        capture("header-native-destroyed")
    }

}
