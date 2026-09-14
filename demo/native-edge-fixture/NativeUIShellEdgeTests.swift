import XCTest

final class NativeUIShellEdgeTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
    }
    private func start(requireTabs: Bool = true) -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "dev.rdlabo.nativeuishell.fixture")
        app.launch()
        XCTAssertTrue(app.webViews.buttons["Edge Web"].waitForExistence(timeout: 30), app.debugDescription)
        if requireTabs { XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10), app.debugDescription) }
        return app
    }
    private func state(_ app: XCUIApplication) -> [String: Any] {
        let json = app.webViews.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "{\"path\"")).firstMatch.label
        return (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] ?? [:]
    }
    private func rect(_ value: Any?) -> CGRect {
        guard let a = value as? [Double], a.count == 4 else { return .null }
        return CGRect(x: a[0], y: a[1], width: a[2], height: a[3])
    }
    private func settled() { Thread.sleep(forTimeInterval: 0.8) }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
    private func openPage(_ app: XCUIApplication, name: String = "button") {
        let entry = app.webViews.buttons[name].firstMatch
        for _ in 0..<15 {
            if entry.isHittable && entry.frame.midY > 330 && entry.frame.midY < app.frame.height - 120 { break }
            let below = entry.frame.midY >= app.frame.height - 120
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: below ? 0.75 : 0.4))
                .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: below ? 0.4 : 0.75)))
        }
        entry.tap(); settled()
        XCTAssertTrue(app.buttons["back"].firstMatch.waitForExistence(timeout: 10), app.debugDescription)
    }
    private func checkBack(_ app: XCUIApplication, native: Bool, name: String) -> CGRect {
        let back = app.buttons["back"].firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 10), app.debugDescription)
        let source = rect(state(app)["back"])
        XCTAssertFalse(source.isNull, "No DOM back geometry: \(state(app))")
        XCTAssertEqual(state(app)["backNative"] as? Bool, native, "Source: \(state(app))")
        XCTAssertEqual(back.frame.minX, source.minX, accuracy: 1)
        XCTAssertEqual(back.frame.minY, source.minY, accuracy: 1)
        XCTAssertEqual(back.frame.width, source.width, accuracy: 1)
        XCTAssertEqual(back.frame.height, source.height, accuracy: 1)
        capture(name)
        return back.frame
    }
    func testPushBackWebComparison() {
        comparePushBack(fixed: false)
    }
    func testFixedPushBackWebComparison() {
        comparePushBack(fixed: true)
    }
    private func comparePushBack(fixed: Bool) {
        let app = start()
        var nativeFrames: [CGRect] = []
        for native in [true, false] {
            if !native {
                app.webViews.buttons["Edge Web"].tap()
                XCTAssertTrue(app.tabBars.firstMatch.waitForNonExistence(timeout: 10)); settled()
            }
            openPage(app)
            if fixed { app.webViews.buttons["Edge fixed"].tap(); settled() }
            for cycle in 0..<3 {
                let before = checkBack(app, native: native && fixed, name: "\(fixed)-\(native)-button-\(cycle)")
                app.webViews.buttons["Push"].tap(); settled()
                XCTAssertTrue(app.webViews.staticTexts["action-sheet"].firstMatch.waitForExistence(timeout: 10))
                if fixed { app.webViews.buttons["Edge fixed"].tap(); settled() }
                let after = checkBack(app, native: native && fixed, name: "\(fixed)-\(native)-pushed-\(cycle)")
                if native { nativeFrames += [before, after] }
                else {
                    XCTAssertEqual(before, nativeFrames[cycle * 2])
                    XCTAssertEqual(after, nativeFrames[cycle * 2 + 1])
                }
                let edge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.005, dy: 0.55))
                // XCTest .slow is 250pt/s, above Ionic's completion velocity threshold.
                edge.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.55)), withVelocity: XCUIGestureVelocity(rawValue: 80), thenHoldForDuration: 0.3)
                settled()
                XCTAssertEqual(state(app)["path"] as? String, "/main/index/action-sheet")
                _ = checkBack(app, native: native && fixed, name: "\(fixed)-\(native)-cancel-\(cycle)")
                app.buttons["back"].firstMatch.tap(); settled()
                XCTAssertTrue(app.webViews.buttons["Push"].waitForExistence(timeout: 10))
            }
            app.buttons["back"].firstMatch.tap(); settled()
            XCTAssertTrue(app.webViews.switches["Dark Mode"].waitForExistence(timeout: 10))
        }
    }
    func testTabPositionsWebComparison() {
        let app = start(requireTabs: false)
        var sources: [CGRect] = []
        for native in [true, false] {
            if !native {
                app.webViews.buttons["Edge Web"].tap()
                XCTAssertTrue(app.tabBars.firstMatch.waitForNonExistence(timeout: 10))
            }
            var index = 0
            for direction in ["ltr", "rtl"] {
                app.webViews.buttons["Edge " + direction].tap()
                for position in ["start", "center", "end"] {
                    app.webViews.buttons["Edge " + position].tap(); settled()
                    let data = state(app)
                    let source = rect(data["tabs"])
                    XCTAssertFalse(source.isNull, "Missing tabs: \(data)")
                    if native {
                        sources.append(source)
                        XCTAssertEqual(data["tabsNative"] as? Bool, true)
                        let buttons = app.tabBars.firstMatch.buttons.allElementsBoundByIndex
                        let content = buttons.map(\.frame).reduce(CGRect.null) { $0.union($1) }.insetBy(dx: -4, dy: -4)
                        XCTAssertEqual(content.maxY, source.maxY, accuracy: 1)
                        if position == "center" {
                            XCTAssertEqual(content.midX, source.midX, accuracy: 1)
                        } else if (position == "start") == (direction == "ltr") {
                            XCTAssertEqual(content.minX, source.minX, accuracy: 1)
                        } else {
                            XCTAssertEqual(content.maxX, source.maxX, accuracy: 1)
                        }
                        print("TAB COMPARISON \(direction) \(position) DOM=\(source) UIKit=\(content)")
                    } else { XCTAssertEqual(source, sources[index]) }
                    capture("tabs-\(native)-\(direction)-\(position)")
                    index += 1
                }
            }
        }
    }
    func testWebKeyboardKeepsHeaderControls() {
        let app = start(requireTabs: false)
        var reference: CGRect?
        for native in [true, false] {
            if !native { app.webViews.buttons["Edge Web"].tap(); settled() }
            openPage(app, name: "native-ui-shell")
            XCTAssertEqual(state(app)["backNative"] as? Bool, native)
            let keyboardInput = app.webViews.textFields["Edge keyboard"]
            keyboardInput.tap()
            XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10)); settled()
            let back = app.buttons["back"].firstMatch
            XCTAssertTrue(back.exists, "Both native and Web back disappeared: \(state(app))\n\(app.debugDescription)")
            let geometry = rect(state(app)["back"])
            XCTAssertEqual(back.frame.minY, geometry.minY, accuracy: 1)
            if let reference { XCTAssertEqual(geometry.minY, reference.minY, accuracy: 1) }
            else { reference = geometry }
            print("KEYBOARD COMPARISON nativeEnabled=\(native) projected=\(state(app)["backNative"] ?? false) back=\(geometry)")
            capture("keyboard-\(native)-back")
            // WebKit may pan the source behind the status bar; compare that behavior
            // to Web, then dismiss the keyboard before tapping the restored back.
            keyboardInput.typeText("\n")
            XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 10)); settled()
            XCTAssertEqual(state(app)["backNative"] as? Bool, native)
            back.tap(); settled()
            XCTAssertTrue(app.webViews.switches["Dark Mode"].waitForExistence(timeout: 10), "After back: \(state(app))")
        }
    }
    func testDynamicTabWidthAdaptation() throws {
        let app = start(requireTabs: false)
        try XCTSkipUnless(app.frame.width > 600, "Requires the iPad UIKit width cap")
        for cycle in 0..<3 {
            app.webViews.buttons["Edge narrow"].tap()
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10)); settled()
            XCTAssertEqual(state(app)["tabsNative"] as? Bool, true)
            capture("width-native-\(cycle)")
            app.webViews.buttons["Edge auto width"].tap()
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10)); settled()
            XCTAssertEqual(state(app)["tabsNative"] as? Bool, true)
            capture("width-adaptive-\(cycle)")
        }
    }
    func testTabContentVariants() {
        let app = start()
        for variant in ["icon-only", "label-only", "badges"] {
            app.webViews.buttons["Edge " + variant].tap(); settled()
            for page in ["Library", "Index"] {
                let tab = app.tabBars.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", page)).firstMatch
                XCTAssertTrue(tab.waitForExistence(timeout: 10), app.debugDescription)
                tab.tap(); settled()
                XCTAssertEqual(state(app)["tabsNative"] as? Bool, true, "\(variant): \(state(app))")
                let selected = app.tabBars.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ AND selected == true", page)).firstMatch
                XCTAssertTrue(selected.waitForExistence(timeout: 10), "Selected tab missing: \(state(app))")
                if variant == "badges" {
                    let sources = state(app)["badges"] as? [[String: Any]] ?? []
                    XCTAssertEqual(sources.count, 2)
                    XCTAssertTrue(sources.allSatisfy { $0["hydrated"] as? Bool == true }, "Badges must be Ionic components: \(sources)")
                    XCTAssertTrue(sources.allSatisfy { $0["color"] as? String != "rgba(0, 0, 0, 0)" }, "Unstyled badges: \(sources)")
                    let badge = app.tabBars.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Library'")).firstMatch
                    XCTAssertTrue(badge.label.contains("47") || String(describing: badge.value).contains("47"), app.debugDescription)
                }
                capture("tab-\(variant)-\(page)")
            }
        }
        app.webViews.buttons["Edge update-badge"].tap(); settled()
        let updated = app.tabBars.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Library'")).firstMatch
        XCTAssertEqual(state(app)["tabsNative"] as? Bool, true)
        XCTAssertFalse(updated.isSelected, app.debugDescription)
        XCTAssertTrue(updated.label.contains("999") || String(describing: updated.value).contains("999"), app.debugDescription)
        capture("tab-badge-updated")
        app.webViews.buttons["Edge show-dot"].tap(); settled()
        capture("tab-visible-empty-dot")
        app.webViews.buttons["Edge clear-badges"].tap(); settled()
        let library = app.tabBars.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Library'")).firstMatch
        XCTAssertFalse(library.label.contains("999") || String(describing: library.value).contains("999"), app.debugDescription)
        capture("tab-badges-cleared")
    }

}
