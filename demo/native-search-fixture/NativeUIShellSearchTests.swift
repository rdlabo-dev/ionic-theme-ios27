import XCTest
final class NativeUIShellSearchTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false; XCUIDevice.shared.orientation = .portrait }
    private func searchButton(_ app: XCUIApplication) -> XCUIElement {
        // UIKit's UISearchTab button may omit its UITab identifier in accessibility.
        // Restrict the label lookup to our native tab bar so a Web fallback cannot satisfy it.
        app.tabBars.matching(NSPredicate(format: "identifier BEGINSWITH 'shell-'"))
            .buttons["Search"].firstMatch
    }
    private func openSearch(_ app: XCUIApplication) -> XCUIElement {
        app.launch()
        let library = app.tabBars.buttons["Library"]
        XCTAssertTrue(library.waitForExistence(timeout: 30), app.debugDescription)
        library.tap()
        let search = searchButton(app)
        XCTAssertTrue(search.waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertTrue(probe(app, contains: "Probe native").waitForExistence(timeout: 5), app.debugDescription)
        search.tap()
        let field = app.searchFields.matching(NSPredicate(format: "identifier BEGINSWITH 'shell-'")).firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10), app.debugDescription)
        return field
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
            searchButton(app).tap()
            let field = app.searchFields.matching(NSPredicate(format: "identifier BEGINSWITH 'shell-'")).firstMatch
            XCTAssertTrue(field.waitForExistence(timeout: 10), app.debugDescription)
            XCTAssertTrue(field.isHittable)
            app.tabBars.buttons["Library"].tap()
            XCTAssertTrue(searchButton(app).waitForExistence(timeout: 10), app.debugDescription)
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
        field.tap(); field.typeText("glass")
        XCTAssertTrue(probe(app, contains: "value:glass").waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(probe(app, contains: "focus:1").waitForExistence(timeout: 5))
        capture("native-search-editing")
        app.buttons["Close"].firstMatch.tap()
        XCTAssertTrue(app.tabBars.buttons["Library"].waitForExistence(timeout: 10), app.debugDescription)
        app.tabBars.buttons["Library"].tap()
        let search = searchButton(app)
        XCTAssertTrue(search.waitForExistence(timeout: 10), app.debugDescription)
        search.tap()
        XCTAssertTrue(field.waitForExistence(timeout: 10)); XCTAssertEqual(field.value as? String, "glass")
        app.webViews.buttons["External value"].tap()
        XCTAssertTrue(NSPredicate(format: "value == 'external'").evaluate(with: field), app.debugDescription)
        app.webViews.buttons["Focus search"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
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
        field.tap(); field.typeText("retained")
        app.webViews.buttons["Toggle search theme"].tap()
        XCTAssertTrue(probe(app, contains: "Probe web value:retained").waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        app.webViews.buttons["Toggle search theme"].tap()
        XCTAssertTrue(searchButton(app).waitForExistence(timeout: 10), app.debugDescription)
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
        XCTAssertTrue(searchButton(app).waitForExistence(timeout: 10), app.debugDescription)
        searchButton(app).tap()
        XCTAssertTrue(field.waitForExistence(timeout: 10)); XCTAssertEqual(field.value as? String, "retained")
    }
    func testJapaneseComposition() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        let field = openSearch(app)
        field.tap()
        let kana = app.keyboards.keys["あ"].firstMatch
        // Installing Kana does not make it the active keyboard; select it through the system switcher.
        for _ in 0..<4 {
            if kana.waitForExistence(timeout: 1) { break }
            let next = app.buttons["Next keyboard"].firstMatch
            XCTAssertTrue(next.exists, "Install Japanese Kana in the simulator before this test\n" + app.debugDescription)
            next.tap()
        }
        XCTAssertTrue(kana.waitForExistence(timeout: 5), app.debugDescription)
        // iOS may cover the newly selected keyboard with its first-use
        // “Quickly Change Keyboards” sheet; the underlying Kana keys still exist.
        let keyboardHelp = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Continue"]
        if keyboardHelp.waitForExistence(timeout: 2) { keyboardHelp.tap() }
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
        searchButton(app).tap()
        XCTAssertEqual(field.value as? String, "あ")
        capture("native-search-japanese-restored")
    }

    func testSearchSourceChangesAndWebKeyboard() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        _ = openSearch(app)
        app.tabBars.buttons["Library"].tap()
        let search = searchButton(app)
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        app.webViews.buttons["Move FAB"].tap()
        // UIKit owns the search button placement; translating the source itself does not opt it out.
        XCTAssertTrue(probe(app, contains: "Probe native").waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(search.isHittable)
        app.webViews.buttons["Move FAB"].tap()
        app.webViews.buttons["Toggle search theme"].tap()
        XCTAssertTrue(probe(app, contains: "Probe web").waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(search.waitForNonExistence(timeout: 5))
        capture("native-search-disabled-web")
        app.webViews.buttons["Toggle search theme"].tap()
        XCTAssertTrue(search.waitForExistence(timeout: 10), app.debugDescription)
        let input = app.webViews.textFields["Web keyboard"]
        input.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(search.waitForNonExistence(timeout: 5), app.debugDescription)
        input.typeText("web\n")
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        XCTAssertTrue(search.waitForExistence(timeout: 10), app.debugDescription)
    }

    func testNativeKeyboardKeepsWebViewFrameAndSearchVisible() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        let field = openSearch(app)
        let before = app.webViews.firstMatch.frame
        field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5), app.debugDescription)
        let aboveKeyboard = NSPredicate { _, _ in
            field.exists && field.frame.maxY <= app.keyboards.firstMatch.frame.minY
        }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: aboveKeyboard, object: field)], timeout: 5), .completed)
        let after = field.frame
        let keyboard = app.keyboards.firstMatch.frame
        // UIKit may move a bottom search field above its keyboard. Verify the independent
        // Capacitor resize contract directly, rather than constraining UIKit's own avoidance.
        let web = app.webViews.firstMatch.frame
        XCTAssertEqual(web.minX, before.minX, accuracy: 1)
        XCTAssertEqual(web.minY, before.minY, accuracy: 1)
        XCTAssertEqual(web.width, before.width, accuracy: 1)
        XCTAssertEqual(web.height, before.height, accuracy: 1)
        XCTAssertLessThanOrEqual(after.maxY, keyboard.minY, "Native search must remain above the keyboard")
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
                let search = searchButton(app)
                if status.label.contains("Probe native") {
                    XCTAssertTrue(search.waitForExistence(timeout: 5), app.debugDescription)
                    let nativeTabs = app.tabBars.matching(NSPredicate(format: "identifier BEGINSWITH 'shell-'"))
                    let ordinary = nativeTabs.buttons.allElementsBoundByIndex.filter { $0.label != "Search" }
                    let platter = ordinary.map(\.frame).reduce(CGRect.null) { $0.union($1) }
                    XCTAssertFalse(platter.isNull)
                    XCTAssertTrue(app.frame.contains(search.frame), app.debugDescription)
                    XCTAssertFalse(ordinary.contains { $0.frame.intersects(search.frame) }, "Search must not cover another tab")
                    if direction == "ltr" { XCTAssertGreaterThan(search.frame.midX, platter.midX) }
                    else { XCTAssertLessThan(search.frame.midX, platter.midX) }
                    XCTAssertTrue(search.isHittable)
                    search.tap()
                    let field = app.searchFields.matching(NSPredicate(format: "identifier BEGINSWITH 'shell-'" )).firstMatch
                    XCTAssertTrue(field.waitForExistence(timeout: 10), app.debugDescription)
                    app.tabBars.buttons["Library"].tap()
                    XCTAssertTrue(search.waitForExistence(timeout: 10), app.debugDescription)
                } else {
                    XCTAssertTrue(search.waitForNonExistence(timeout: 5), app.debugDescription)
                    XCTAssertTrue(probe(app, contains: "triggerHit:true").waitForExistence(timeout: 5), "The source Web FAB must not be covered by its tabs: " + status.label)
                    let webSearch = app.webViews.buttons["Search"].firstMatch
                    XCTAssertTrue(webSearch.isHittable, app.debugDescription)
                    webSearch.tap()
                    let webField = app.webViews.searchFields.firstMatch
                    XCTAssertTrue(webField.waitForExistence(timeout: 5), app.debugDescription)
                    webField.tap()
                    // The Kana scenario may leave the Japanese keyboard selected.
                    for _ in 0..<5 {
                        if app.keyboards.keys["a"].exists || app.keyboards.keys["A"].exists { break }
                        app.buttons["Next keyboard"].firstMatch.tap()
                    }
                    let ready = NSPredicate { _, _ in
                        app.keyboards.keys["a"].isHittable || app.keyboards.keys["A"].isHittable
                    }
                    XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: ready, object: app)], timeout: 10), .completed, app.debugDescription)
                    let previous = webField.value as? String ?? ""
                    if !previous.isEmpty && previous != "Search" {
                        // A tap may place the caret before retained text. Use Ionic's clear
                        // control instead of assuming delete starts at the end of the value.
                        app.webViews.buttons["reset"].firstMatch.tap()
                        XCTAssertTrue(probe(app, contains: "value: viewport:").waitForExistence(timeout: 5), app.debugDescription)
                    }
                    let value = direction + position
                    for character in value { app.keyboards.keys[String(character)].tap() }
                    XCTAssertTrue(probe(app, contains: "value:" + value + " viewport:").waitForExistence(timeout: 5), app.debugDescription)
                    // The focused Web layout appends a trailing Close button and hides the original.
                    // WebKit can retain the hidden original in AX, so select the appended control.
                    let close = app.webViews.buttons["Dismiss search"].firstMatch
                    XCTAssertTrue(close.isHittable, app.debugDescription)
                    close.tap()
                    XCTAssertTrue(webSearch.waitForExistence(timeout: 5), app.debugDescription)
                    let tappable = NSPredicate { _, _ in webSearch.isHittable }
                    XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: tappable, object: webSearch)], timeout: 10), .completed, app.debugDescription)
                    // A rejected layout can retain native tabs only if they do not cover the Web FAB.
                    let nativeIndex = app.tabBars.buttons["Index"]
                    let webIndex = app.webViews.buttons["Index"].firstMatch
                    let restored = NSPredicate { _, _ in nativeIndex.isHittable || webIndex.isHittable }
                    XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: restored, object: app)], timeout: 10), .completed, app.debugDescription)
                    if nativeIndex.isHittable { nativeIndex.tap() } else { webIndex.tap() }
                    XCTAssertTrue(app.webViews.buttons["floating-action-button"].waitForExistence(timeout: 10), app.debugDescription)
                    let nativeLibrary = app.tabBars.buttons["Library"]
                    if nativeLibrary.isHittable { nativeLibrary.tap() } else { app.webViews.buttons["Library"].firstMatch.tap() }
                    XCTAssertTrue(webSearch.waitForExistence(timeout: 10), app.debugDescription)
                }
                print("SEARCH POSITION " + status.label)
                capture("search-position-" + direction + "-" + position)
            }
        }
    }

    func testSearchBackgroundRetirement() throws {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        let field = openSearch(app)
        field.tap(); field.typeText("background")
        XCTAssertTrue(probe(app, contains: "value:background").waitForExistence(timeout: 5))
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(searchButton(app).waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(field.waitForNonExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(probe(app, contains: "value:background").waitForExistence(timeout: 5), app.debugDescription)
        capture("search-background-restored")
        searchButton(app).tap()
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
        XCTAssertTrue(searchButton(app).waitForExistence(timeout: 10))
        searchButton(app).tap()
        let field = app.searchFields.matching(NSPredicate(format: "identifier BEGINSWITH 'shell-'")).firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        capture("header-search-expanded")
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(searchButton(app).waitForExistence(timeout: 10))
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
