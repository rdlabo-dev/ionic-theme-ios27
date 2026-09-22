import XCTest
import Capacitor
@testable import IonicNativeUIShellPlugin

final class ShellSnapshotTests: XCTestCase {
    private func item(_ changes: JSObject = [:]) -> JSObject {
        var value: JSObject = ["id": "action", "x": 4.0, "y": 8.0, "width": 44.0, "height": 44.0,
            "label": "Send", "accessibilityLabel": "Send message", "disabled": false, "selected": false,
            "fontSize": 17.0, "fontWeight": 400.0, "color": "rgb(0, 0, 0)"]
        value.merge(changes) { _, new in new }
        return value
    }

    private func control(_ changes: JSObject = [:]) -> JSObject {
        var value: JSObject = ["id": "control", "kind": "ion-button", "x": 16.0, "y": 60.0,
            "width": 44.0, "height": 44.0, "items": [item()], "dark": false, "rtl": false]
        value.merge(changes) { _, new in new }
        return value
    }

    private func decode(_ controls: [JSObject], width: Double = 390) throws -> ShellSnapshot {
        try JSValueDecoder().decode(ShellSnapshot.self, from: ["revision": 1, "viewportWidth": width, "controls": controls])
    }

    @MainActor func testTabTypographyPreservesCSSWeightsAndSize() throws {
        let weights: [UIFont.Weight] = [.ultraLight, .thin, .light, .regular, .medium, .semibold, .bold, .heavy, .black]
        let tab = UITabBarItem()
        for (index, weight) in weights.enumerated() {
            let cssWeight = Double((index + 1) * 100)
            let content = try decode([control(["items": [item(["fontSize": 19.0, "fontWeight": cssWeight])]])]).controls[0].items[0].content
            ShellTabBar.applyTypography(content, to: tab)
            for state in [UIControl.State.normal, .selected] {
                let font = try XCTUnwrap(tab.titleTextAttributes(for: state)?[.font] as? UIFont)
                XCTAssertEqual(font.pointSize, 19)
                XCTAssertEqual(font, UIFont.systemFont(ofSize: 19, weight: weight), "CSS weight \(cssWeight)")
            }
        }
    }

    @MainActor func testFoldableTabOptimismWaitsForWebAndRollsBackWhenStale() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires SwiftUI adaptive tabs") }
        func tabs(_ selected: String, includeRight: Bool = true) throws -> [ShellControl] {
            var items = [item(["id": "left", "selected": selected == "left"])]
            if includeRight { items.append(item(["id": "right", "selected": selected == "right"])) }
            return try decode([control(["kind": "ion-tab-bar", "items": items])]).controls
        }
        let model = ShellFoldableRailModel()
        let rendering = ShellRendering()
        model.apply(try tabs("left"), rendering: rendering, now: 100)
        model.select("right", now: 100, ttl: 10)
        model.apply(try tabs("left"), rendering: rendering, now: 101)
        XCTAssertEqual(model.selection, "right", "a stale Web echo must not undo the optimistic selection")
        model.apply(try tabs("right"), rendering: rendering, now: 102)
        XCTAssertEqual(model.selection, "right", "the matching Web echo confirms the selection")

        model.apply(try tabs("left"), rendering: rendering, now: 200)
        model.select("right", now: 200, ttl: 10)
        model.apply(try tabs("left"), rendering: rendering, now: 211)
        XCTAssertEqual(model.selection, "left", "an expired selection rolls back to Web state")
        model.select("right", now: 220, ttl: 10)
        model.apply(try tabs("left", includeRight: false), rendering: rendering, now: 221)
        XCTAssertEqual(model.selection, "left", "a removed target rolls back immediately")
    }

    @MainActor func testSegmentSelectionEchoPreservesNativeViewsAndActionsUseUpdatedItems() throws {
        guard #available(iOS 26.0, *) else { return }
        func node(_ items: [JSObject]) throws -> ShellControl {
            try XCTUnwrap(decode([control(["kind": "ion-segment", "width": 160.0, "items": items])]).controls.first)
        }
        let first = try node([item(["id": "left", "selected": true]), item(["id": "right"])])
        var activated: [String] = []
        let segment = try XCTUnwrap(ShellSegment.make(first, scale: 1, rendering: ShellRendering(),
            activate: { activated.append($0) }) as? ShellSegment)
        segment.frame = CGRect(x: 0, y: 0, width: 160, height: 48)
        segment.layoutIfNeeded()
        XCTAssertEqual(segment.widthForSegment(at: 0) + segment.widthForSegment(at: 1), 160)
        segment.selectedSegmentIndex = 1
        segment.layoutIfNeeded()
        let children = segment.subviews
        let animation = CABasicAnimation(keyPath: "opacity")
        animation.fromValue = 0.5
        animation.toValue = 1
        animation.duration = 1
        segment.layer.add(animation, forKey: "selection-in-flight")
        let echo = try node([item(["id": "left"]), item(["id": "right", "selected": true])])
        segment.update(echo, scale: 1, rendering: ShellRendering())
        segment.layoutIfNeeded()
        XCTAssertEqual(segment.selectedSegmentIndex, 1)
        XCTAssertEqual(segment.subviews, children)
        XCTAssertNotNil(segment.layer.animation(forKey: "selection-in-flight"))
        segment.sendActions(for: .valueChanged)
        XCTAssertEqual(activated, ["right"])

        // Web can reject a selection, clear it, or replace the available actions.
        segment.update(first, scale: 1, rendering: ShellRendering())
        XCTAssertEqual(segment.selectedSegmentIndex, 0)
        let replaced = try node([item(["id": "replacement", "label": "Updated", "disabled": true])])
        segment.update(replaced, scale: 2, rendering: ShellRendering())
        XCTAssertEqual(segment.numberOfSegments, 1)
        XCTAssertEqual(segment.selectedSegmentIndex, UISegmentedControl.noSegment)
        XCTAssertEqual(segment.titleForSegment(at: 0), "Updated")
        XCTAssertFalse(segment.isEnabledForSegment(at: 0))
        XCTAssertEqual(segment.widthForSegment(at: 0), 320)
        segment.selectedSegmentIndex = 0
        segment.sendActions(for: .valueChanged)
        XCTAssertEqual(activated, ["right", "replacement"])
    }

    func testFlatWireFormatAndOptionalFields() throws {
        let snapshot = try decode([control()])
        XCTAssertTrue(snapshot.isValid)
        let node = try XCTUnwrap(snapshot.controls.first)
        XCTAssertEqual(node.kind, .button)
        XCTAssertEqual(node.frame.rect, CGRect(x: 16, y: 60, width: 44, height: 44))
        let action = try XCTUnwrap(node.items.first)
        XCTAssertEqual(action.content.accessibilityLabel, "Send message")
        XCTAssertNil(action.content.icon)
        XCTAssertNil(action.visible)
        XCTAssertNil(node.search)
        XCTAssertTrue(try decode([]).isValid)
    }

    func testRequiredFieldsAndEnumsRejectMalformedInput() throws {
        var missing = item()
        missing.removeValue(forKey: "label")
        for malformed in [missing, item(["disabled": "false"]), item(["iconPosition": "bottom"])] {
            XCTAssertThrowsError(try decode([control(["items": [malformed]])]))
        }
        XCTAssertThrowsError(try decode([control(["kind": "ion-input"])]))
    }

    func testGeometryRejectsNonFiniteAndNonPositiveSizes() throws {
        for width in [0, -1, Double.infinity, Double.nan] {
            XCTAssertFalse(try decode([control(["width": width])]).isValid)
            XCTAssertFalse(try decode([control(["items": [item(["width": width])]])]).isValid)
            XCTAssertFalse(try decode([], width: width).isValid)
        }
        XCTAssertFalse(try decode([control(["x": Double.infinity])]).isValid)
        XCTAssertTrue(try decode([control(["x": -20.0, "y": -10.0])]).isValid)
        XCTAssertFalse(try decode([control(["items": [item(["iconWidth": Double.nan])]])]).isValid)
    }

    func testBatchLimitsAndDuplicateIdentifiers() throws {
        let controls = (0..<100).map { control(["id": "control-\($0)"]) }
        XCTAssertTrue(try decode(controls).isValid)
        XCTAssertFalse(try decode(controls + [control()]).isValid)
        XCTAssertFalse(try decode([control(), control()]).isValid)
        let items = (0..<30).map { item(["id": "item-\($0)"]) }
        XCTAssertTrue(try decode([control(["kind": "ion-segment", "items": items])]).isValid)
        XCTAssertFalse(try decode([control(["kind": "ion-segment", "items": items + [item()]])]).isValid)
        XCTAssertFalse(try decode([control(["kind": "ion-segment", "items": [item(), item()]])]).isValid)
        XCTAssertFalse(try decode([control(), control(["id": "invalid", "height": 0.0])]).isValid)
    }

    func testSearchUsesContentForFieldAndGeometryForTrigger() throws {
        // The hidden Web search field may have no layout. Its content is still projected.
        var search: JSObject = ["id": "search", "field": item(["width": 0.0, "height": 0.0]),
            "trigger": item(), "closeId": "close", "active": false, "available": true,
            "focused": false, "value": "あ", "placeholder": "Search", "disabled": false,
            "editSequence": 2, "valueVersion": 1]
        let snapshot = try decode([control(["kind": "ion-tab-bar", "search": search])])
        XCTAssertTrue(snapshot.isValid)
        XCTAssertEqual(snapshot.controls.first?.search?.value, "あ")
        XCTAssertFalse(try decode([control(["search": search])]).isValid)
        search["trigger"] = item(["width": 0.0])
        XCTAssertFalse(try decode([control(["kind": "ion-tab-bar", "search": search])]).isValid)
    }

    func testTabAnchorsKeepOnlySupportedPlacements() throws {
        for x in [0.0, 0.5, 1.0] {
            for y in [0.0, 1.0] {
                XCTAssertTrue(try decode([control(["kind": "ion-tab-bar", "tabBarAnchor": ["x": x, "y": y]])]).isValid)
            }
        }
        XCTAssertFalse(try decode([control(["kind": "ion-tab-bar", "tabBarAnchor": ["x": 0.2, "y": 0.0]])]).isValid)
    }

    func testFabMovementAndVisibilityDoNotInvalidateArtwork() throws {
        let original = try JSValueDecoder().decode(ShellItem.self, from: item(["visible": true]))
        let moved = try JSValueDecoder().decode(ShellItem.self, from: item(["x": 20.0, "visible": false]))
        XCTAssertNotEqual(original, moved)
        XCTAssertEqual(original.content.fabArtwork, moved.content.fabArtwork)
        let opened = try JSValueDecoder().decode(ShellItem.self, from: item([
            "selected": true, "icon": "normal", "closeIcon": "close", "closeIconWidth": 20.0, "closeIconHeight": 20.0]))
        XCTAssertEqual(opened.content.fabArtwork.icon, "close")
        XCTAssertEqual(opened.content.fabArtwork.iconWidth, 20)
        XCTAssertEqual(opened.content.fabArtwork.label, "")
        XCTAssertNotEqual(original.content.fabArtwork, opened.content.fabArtwork)
    }

    @MainActor
    func testTabVariantsAndBadgeUpdatesKeepItemIdentity() throws {
        let rendering = ShellRendering()
        let image = UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24)).image { context in
            UIColor.black.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 24, height: 24))
        }.pngData()!.base64EncodedString()
        let dot: JSObject = ["value": "", "color": "rgb(235, 68, 90)", "textColor": "rgb(255, 255, 255)"]
        let number: JSObject = ["value": "47", "color": "rgb(0, 102, 255)", "textColor": "rgb(255, 255, 255)"]
        func node(_ badges: Bool) throws -> ShellControl {
            let items = [
                item(["id": "icon", "label": "", "icon": image, "iconWidth": 24.0, "iconHeight": 24.0]),
                item(["id": "label", "label": "Music"]),
                item(["id": "dot", "badge": badges ? dot : NSNull()]),
                item(["id": "number", "badge": badges ? number : NSNull()])
            ]
            return try decode([control(["kind": "ion-tab-bar", "items": items])]).controls[0]
        }
        let bar = UITabBar()
        ShellTabBar.update(bar, node: try node(true), rendering: rendering)
        let items = try XCTUnwrap(bar.items)
        XCTAssertEqual(items[0].title, "")
        XCTAssertNotNil(items[0].image)
        XCTAssertEqual(items[1].title, "Music")
        XCTAssertNil(items[1].image)
        XCTAssertEqual(items[2].badgeValue, "")
        XCTAssertEqual(items[3].badgeValue, "47")
        XCTAssertEqual(items[2].badgeColor, rendering.color("rgb(235, 68, 90)"))
        XCTAssertEqual(items[3].badgeColor, rendering.color("rgb(0, 102, 255)"))
        ShellTabBar.update(bar, node: try node(false), rendering: rendering)
        for (before, after) in zip(items, bar.items!) {
            XCTAssertTrue(before === after)
            XCTAssertNil(after.badgeValue)
            XCTAssertNil(after.badgeColor)
        }
    }


    @MainActor
    func testSearchTabsPreserveAccessibilityAndBadgeAppearance() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires UISearchTab") }
        let badge: JSObject = ["value": "47", "color": "rgb(235, 68, 90)", "textColor": "rgb(255, 255, 255)"]
        let search: JSObject = ["id": "search", "field": item(), "trigger": item(["id": "trigger"]),
            "closeId": "close", "active": false, "available": true, "focused": false,
            "value": "", "placeholder": "Search", "disabled": false, "editSequence": 0, "valueVersion": 0]
        let node = try decode([control(["kind": "ion-tab-bar", "width": 300.0, "search": search,
            "items": [item(["id": "first", "label": "", "accessibilityLabel": "Favorites", "badge": badge]),
                      item(["id": "second", "label": "Music"]) ]])]).controls[0]
        let controller = ShellSearchController()
        let rendering = ShellRendering()
        _ = controller.apply(node, webFrame: CGRect(x: 0, y: 0, width: 390, height: 844),
            barFrame: CGRect(x: 18, y: 730, width: 280, height: 62),
            triggerFrame: CGRect(x: 320, y: 730, width: 56, height: 56), rendering: rendering)
        let tab = try XCTUnwrap(controller.tabBar.items?.first)
        XCTAssertEqual(tab.accessibilityLabel, "Favorites")
        XCTAssertEqual(tab.badgeValue, "47")
        XCTAssertEqual(tab.accessibilityValue, "47")
        XCTAssertEqual(tab.badgeColor, rendering.color("rgb(235, 68, 90)"))
        XCTAssertEqual(tab.badgeTextAttributes(for: .normal)?[.foregroundColor] as? UIColor, rendering.color("rgb(255, 255, 255)"))
    }


    @MainActor
    func testReplacingSearchResetsEditingSequenceWithoutOverwritingCurrentInput() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires UISearchTab") }
        let controller = ShellSearchController()
        let rendering = ShellRendering()
        func apply(_ id: String, value: String) throws {
            let search: JSObject = ["id": id, "field": item(), "trigger": item(["id": "trigger"]),
                "closeId": "close", "active": true, "available": true, "focused": false,
                "value": value, "placeholder": "Search", "disabled": false, "editSequence": 0, "valueVersion": 0]
            let node = try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "search": search,
                "items": [item(["id": "first", "selected": true]), item(["id": "second"]) ]])]).controls.first)
            XCTAssertTrue(controller.apply(node, webFrame: CGRect(x: 0, y: 0, width: 390, height: 844),
            barFrame: CGRect(x: 18, y: 730, width: 280, height: 62),
            triggerFrame: CGRect(x: 320, y: 730, width: 56, height: 56), rendering: rendering))
        }
        try apply("old-search", value: "initial")
        let navigation = try XCTUnwrap(controller.tabs.last?.viewController as? UINavigationController)
        let searchBar = try XCTUnwrap(navigation.topViewController?.navigationItem.searchController?.searchBar)
        searchBar.text = "native edit"
        controller.changed = { _, _, _, _, _ in 7 }
        controller.searchBar(searchBar, textDidChange: "native edit")
        try apply("old-search", value: "stale")
        XCTAssertEqual(searchBar.text, "native edit")
        try apply("new-search", value: "replacement initial")
        XCTAssertEqual(searchBar.text, "replacement initial")
    }

    @MainActor
    func testSingleButtonsRejectEmptyAndMultipleItems() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires native glass buttons") }
        for kind in ["ion-button", "ion-back-button", "ion-menu-button"] {
            for items in [[JSObject](), [item(), item(["id": "second"])]] {
                let snapshot = try decode([control(["kind": kind, "items": items])])
                XCTAssertFalse(snapshot.isValid)
                let node = try XCTUnwrap(snapshot.controls.first)
                XCTAssertNil(ShellButton.make(node, rendering: ShellRendering(), activate: { _ in
                    XCTFail("Invalid input must not create an action")
                }))
            }
            let snapshot = try decode([control(["kind": kind])])
            XCTAssertTrue(snapshot.isValid)
            let node = try XCTUnwrap(snapshot.controls.first)
            var activated: String?
            let button = try XCTUnwrap(ShellButton.make(node, rendering: ShellRendering(), activate: { activated = $0 }))
            button.sendActions(for: .touchUpInside)
            XCTAssertEqual(activated, "action")
        }
        let emptySegment = try decode([control(["kind": "ion-segment", "items": [JSObject]()])])
        XCTAssertFalse(emptySegment.isValid)
        XCTAssertNil(ShellSegment.make(try XCTUnwrap(emptySegment.controls.first), scale: 1,
            rendering: ShellRendering(), activate: { _ in XCTFail("Empty segment") }))
    }


    @MainActor
    func testTabSelectionWithEmptySingleAndReorderedItems() throws {
        let first = item(["id": "first"])
        let selected = item(["id": "selected", "selected": true])
        let bar = UITabBar()
        for items in [[first, selected], [selected, first], [first], []] {
            let node = try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "items": items])]).controls.first)
            ShellTabBar.update(bar, node: node, rendering: ShellRendering())
            XCTAssertEqual(bar.items?.count ?? 0, items.count)
            XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, items.count == 2 ? "selected" : nil)
        }
    }

    @MainActor
    func testTabTitleLayoutWarmupRestoresSelection() throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24)).image { context in
            UIColor.black.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 24, height: 24))
        }.pngData()!.base64EncodedString()
        let items = [
            item(["id": "first", "label": "Index", "selected": true, "icon": image, "iconWidth": 24.0, "iconHeight": 24.0]),
            item(["id": "second", "label": "Docs", "icon": image, "iconWidth": 24.0, "iconHeight": 24.0]),
            item(["id": "third", "label": "Library", "icon": image, "iconWidth": 24.0, "iconHeight": 24.0]),
        ]
        let node = try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "width": 280.0, "height": 62.0, "items": items])]).controls.first)
        let bar = UITabBar()
        ShellTabBar.update(bar, node: node, rendering: ShellRendering())
        XCTAssertTrue(ShellTabBar.fit(bar, node: node, bounds: CGRect(x: 20, y: 700, width: 280, height: 62)))
        XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, "first")
        // A second fit without content changes must not leave a pending warmup.
        XCTAssertTrue(ShellTabBar.fit(bar, node: node, bounds: CGRect(x: 20, y: 700, width: 280, height: 62)))
        XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, "first")
    }

    @MainActor
    func testTabPendingSelectionIgnoresStaleDomEcho() throws {
        let first = item(["id": "first", "selected": true])
        let second = item(["id": "second"])
        let bar = UITabBar()
        let initial = try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "items": [first, second]])]).controls.first)
        ShellTabBar.update(bar, node: initial, rendering: ShellRendering())
        XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, "first")

        var pending: ShellTabBar.PendingSelection? = .start("second")
        // Stale Web echo still reports the previous tab.
        ShellTabBar.update(bar, node: initial, rendering: ShellRendering(), pendingSelection: &pending)
        XCTAssertEqual(pending?.id, "second")
        XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, "second")

        let echoed = try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "items": [
            item(["id": "first"]), item(["id": "second", "selected": true]),
        ]])]).controls.first)
        ShellTabBar.update(bar, node: echoed, rendering: ShellRendering(), pendingSelection: &pending)
        XCTAssertNil(pending)
        XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, "second")
    }

    @MainActor
    func testTabPendingSelectionFallsBackWhenDomRejects() throws {
        let first = item(["id": "first", "selected": true])
        let second = item(["id": "second"])
        let bar = UITabBar()
        let node = try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "items": [first, second]])]).controls.first)
        ShellTabBar.update(bar, node: node, rendering: ShellRendering())
        bar.selectedItem = bar.items?.first { $0.accessibilityIdentifier == "second" }

        var pending: ShellTabBar.PendingSelection? = ShellTabBar.PendingSelection(id: "second", until: CFAbsoluteTimeGetCurrent() - 1)
        ShellTabBar.update(bar, node: node, rendering: ShellRendering(), pendingSelection: &pending)
        XCTAssertNil(pending)
        XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, "first")

        pending = .start("second")
        let disabled = try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "items": [
            item(["id": "first", "selected": true]), item(["id": "second", "disabled": true]),
        ]])]).controls.first)
        bar.selectedItem = bar.items?.first { $0.accessibilityIdentifier == "second" }
        ShellTabBar.update(bar, node: disabled, rendering: ShellRendering(), pendingSelection: &pending)
        XCTAssertNil(pending)
        XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, "first")
    }

    @MainActor
    func testSearchOptimisticTabSelectionIgnoresStaleDomEcho() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires UISearchTab") }
        let controller = ShellSearchController()
        let rendering = ShellRendering()
        let resting = CGRect(x: 0, y: 0, width: 390, height: 844)
        let bar = CGRect(x: 18, y: 730, width: 280, height: 62)
        let trigger = CGRect(x: 320, y: 730, width: 56, height: 56)
        func node(selected: String) throws -> ShellControl {
            let search: JSObject = ["id": "search", "field": item(), "trigger": item(["id": "trigger"]),
                "closeId": "close", "active": false, "available": true, "focused": false,
                "value": "", "placeholder": "Search", "disabled": false, "editSequence": 0, "valueVersion": 0]
            return try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "search": search,
                "items": [item(["id": "first", "selected": selected == "first"]),
                          item(["id": "second", "selected": selected == "second"])]])]).controls.first)
        }
        _ = controller.apply(try node(selected: "first"), webFrame: resting, barFrame: bar, triggerFrame: trigger, rendering: rendering)
        let second = try XCTUnwrap(controller.tabs.first { $0.identifier == "second" })
        var activated: [String] = []
        controller.activate = { activated.append($0) }
        XCTAssertTrue(controller.tabBarController(controller, shouldSelectTab: second))
        XCTAssertEqual(activated, ["second"])
        XCTAssertEqual(controller.selectedTab?.identifier, "second")
        // Stale Web echo still reports the previous tab.
        _ = controller.apply(try node(selected: "first"), webFrame: resting, barFrame: bar, triggerFrame: trigger, rendering: rendering)
        XCTAssertEqual(controller.selectedTab?.identifier, "second")
        // Web catches up — clear pending without bouncing selection.
        _ = controller.apply(try node(selected: "second"), webFrame: resting, barFrame: bar, triggerFrame: trigger, rendering: rendering)
        XCTAssertEqual(controller.selectedTab?.identifier, "second")
    }

    @MainActor
    func testSearchLocksProjectionWhileActiveAndKeepsApplicationValue() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires UISearchTab") }
        let controller = ShellSearchController()
        let rendering = ShellRendering()
        let resting = CGRect(x: 0, y: 0, width: 390, height: 844)
        let shrunk = CGRect(x: 0, y: 0, width: 390, height: 500)
        func node(active: Bool, focused: Bool, value: String = "", valueVersion: Int = 0) throws -> ShellControl {
            let search: JSObject = ["id": "search", "field": item(), "trigger": item(["id": "trigger"]),
                "closeId": "close", "active": active, "available": true, "focused": focused,
                "value": value, "placeholder": "Search", "disabled": false, "editSequence": 0, "valueVersion": valueVersion]
            return try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "search": search,
                "items": [item(["id": "first", "selected": true]), item(["id": "second"])]])]).controls.first)
        }
        // Resting layout may reject without a full window hierarchy; surface is still assigned.
        _ = controller.apply(try node(active: false, focused: false), webFrame: resting,
            barFrame: CGRect(x: 18, y: 730, width: 280, height: 62),
            triggerFrame: CGRect(x: 320, y: 730, width: 56, height: 56), rendering: rendering)
        controller.surface.frame = resting
        // Active (even before focus) freezes Web layout for the whole search session.
        XCTAssertTrue(controller.apply(try node(active: true, focused: false), webFrame: resting,
            barFrame: CGRect(x: 18, y: 730, width: 280, height: 62),
            triggerFrame: CGRect(x: 320, y: 730, width: 56, height: 56), rendering: rendering))
        XCTAssertEqual(controller.surface.frame, resting)
        XCTAssertTrue(controller.apply(try node(active: true, focused: false), webFrame: shrunk,
            barFrame: CGRect(x: 18, y: 730, width: 280, height: 62),
            triggerFrame: CGRect(x: 320, y: 730, width: 56, height: 56), rendering: rendering))
        XCTAssertEqual(controller.surface.frame, resting)
        // Application realtime value updates still cross the lock.
        XCTAssertTrue(controller.apply(try node(active: true, focused: true, value: "external", valueVersion: 2), webFrame: shrunk,
            barFrame: CGRect(x: 18, y: 730, width: 280, height: 62),
            triggerFrame: CGRect(x: 320, y: 730, width: 56, height: 56), rendering: rendering))
        XCTAssertEqual(controller.surface.frame, resting)
        let navigation = try XCTUnwrap(controller.tabs.last?.viewController as? UINavigationController)
        let searchBar = try XCTUnwrap(navigation.topViewController?.navigationItem.searchController?.searchBar)
        XCTAssertEqual(searchBar.text, "external")
        // Blur request returns to presented (active, not focused) without unlocking projection.
        XCTAssertTrue(controller.apply(try node(active: true, focused: false, value: "external", valueVersion: 2), webFrame: shrunk,
            barFrame: CGRect(x: 18, y: 730, width: 280, height: 62),
            triggerFrame: CGRect(x: 320, y: 730, width: 56, height: 56), rendering: rendering))
        XCTAssertEqual(controller.surface.frame, resting)
        XCTAssertFalse(searchBar.searchTextField.isFirstResponder)
        let tabsBeforeLeave = controller.tabs.map(\.identifier)
        // Leave re-fits; without a window hierarchy fit may reject while still restoring selection.
        _ = controller.apply(try node(active: false, focused: false, value: "external", valueVersion: 2), webFrame: resting,
            barFrame: CGRect(x: 18, y: 730, width: 280, height: 62),
            triggerFrame: CGRect(x: 320, y: 730, width: 56, height: 56), rendering: rendering)
        XCTAssertEqual(controller.surface.frame, resting)
        // Leave must reassign tabs even when identifiers match (UISearchTab morph cleanup).
        XCTAssertEqual(controller.tabs.map(\.identifier), tabsBeforeLeave)
        XCTAssertEqual(controller.tabs.count, 3) // first, second, search
        XCTAssertEqual(controller.selectedTab?.identifier, "first")
        // Switching ordinary tabs after leave must keep resting chrome (no deferred morph expand).
        func nodeSelecting(_ id: String) throws -> ShellControl {
            let search: JSObject = ["id": "search", "field": item(), "trigger": item(["id": "trigger"]),
                "closeId": "close", "active": false, "available": true, "focused": false,
                "value": "external", "placeholder": "Search", "disabled": false, "editSequence": 0, "valueVersion": 2]
            return try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "search": search,
                "items": [item(["id": "first", "selected": id == "first"]),
                          item(["id": "second", "selected": id == "second"])]])]).controls.first)
        }
        let tabsAfterLeave = controller.tabs.map(\.identifier)
        _ = controller.apply(try nodeSelecting("second"), webFrame: resting,
            barFrame: CGRect(x: 18, y: 730, width: 280, height: 62),
            triggerFrame: CGRect(x: 320, y: 730, width: 56, height: 56), rendering: rendering)
        XCTAssertEqual(controller.selectedTab?.identifier, "second")
        XCTAssertEqual(controller.tabs.map(\.identifier), tabsAfterLeave)
        _ = controller.apply(try nodeSelecting("first"), webFrame: resting,
            barFrame: CGRect(x: 18, y: 730, width: 280, height: 62),
            triggerFrame: CGRect(x: 320, y: 730, width: 56, height: 56), rendering: rendering)
        XCTAssertEqual(controller.selectedTab?.identifier, "first")
        XCTAssertEqual(controller.tabs.map(\.identifier), tabsAfterLeave)
    }

    @MainActor
    func testSearchRelocksProjectionWidthAfterRotation() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires UISearchTab") }
        let controller = ShellSearchController()
        let rendering = ShellRendering()
        let portrait = CGRect(x: 0, y: 0, width: 390, height: 844)
        let landscape = CGRect(x: 0, y: 0, width: 844, height: 390)
        let keyboardShrunk = CGRect(x: 0, y: 0, width: 844, height: 200)
        func node(active: Bool) throws -> ShellControl {
            let search: JSObject = ["id": "search", "field": item(), "trigger": item(["id": "trigger"]),
                "closeId": "close", "active": active, "available": true, "focused": false,
                "value": "", "placeholder": "Search", "disabled": false, "editSequence": 0, "valueVersion": 0]
            return try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "search": search,
                "items": [item(["id": "first", "selected": true]), item(["id": "second"])]])]).controls.first)
        }
        let bar = CGRect(x: 18, y: 730, width: 280, height: 62)
        let trigger = CGRect(x: 320, y: 730, width: 56, height: 56)
        _ = controller.apply(try node(active: false), webFrame: portrait, barFrame: bar, triggerFrame: trigger, rendering: rendering)
        controller.surface.frame = portrait
        XCTAssertTrue(controller.apply(try node(active: true), webFrame: portrait, barFrame: bar, triggerFrame: trigger, rendering: rendering))
        XCTAssertEqual(controller.surface.frame, portrait)
        // Rotation must adopt the new width instead of keeping the portrait lock.
        XCTAssertTrue(controller.apply(try node(active: true), webFrame: landscape, barFrame: bar, triggerFrame: trigger, rendering: rendering))
        XCTAssertEqual(controller.surface.frame, landscape)
        // Keyboard shrink at the same width must still be ignored.
        XCTAssertTrue(controller.apply(try node(active: true), webFrame: keyboardShrunk, barFrame: bar, triggerFrame: trigger, rendering: rendering))
        XCTAssertEqual(controller.surface.frame, landscape)
    }

    @MainActor
    func testSearchPendingSelectionExpiresWithoutLaterApply() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires UISearchTab") }
        let controller = ShellSearchController()
        let rendering = ShellRendering()
        let resting = CGRect(x: 0, y: 0, width: 390, height: 844)
        let bar = CGRect(x: 18, y: 730, width: 280, height: 62)
        let trigger = CGRect(x: 320, y: 730, width: 56, height: 56)
        let search: JSObject = ["id": "search", "field": item(), "trigger": item(["id": "trigger"]),
            "closeId": "close", "active": false, "available": true, "focused": false,
            "value": "", "placeholder": "Search", "disabled": false, "editSequence": 0, "valueVersion": 0]
        let node = try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "search": search,
            "items": [item(["id": "first", "selected": true]), item(["id": "second"])]])]).controls.first)
        _ = controller.apply(node, webFrame: resting, barFrame: bar, triggerFrame: trigger, rendering: rendering)
        let second = try XCTUnwrap(controller.tabs.first { $0.identifier == "second" })
        XCTAssertTrue(controller.tabBarController(controller, shouldSelectTab: second))
        XCTAssertEqual(controller.selectedTab?.identifier, "second")
        let expectation = expectation(description: "pending selection expires back to DOM")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.15) {
            XCTAssertEqual(controller.selectedTab?.identifier, "first")
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 2)
    }

    @MainActor
    func testSearchEmitsInputAfterRestingToActive() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires UISearchTab") }
        let controller = ShellSearchController()
        let rendering = ShellRendering()
        let resting = CGRect(x: 0, y: 0, width: 390, height: 844)
        let bar = CGRect(x: 18, y: 730, width: 280, height: 62)
        let trigger = CGRect(x: 320, y: 730, width: 56, height: 56)
        func node(active: Bool) throws -> ShellControl {
            let search: JSObject = ["id": "search", "field": item(), "trigger": item(["id": "trigger"]),
                "closeId": "close", "active": active, "available": true, "focused": active,
                "value": "", "placeholder": "Search", "disabled": false, "editSequence": 0, "valueVersion": 0]
            return try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "search": search,
                "items": [item(["id": "first", "selected": true]), item(["id": "second"])]])]).controls.first)
        }
        // Resting must not permanently close the editing bridge.
        _ = controller.apply(try node(active: false), webFrame: resting, barFrame: bar, triggerFrame: trigger, rendering: rendering)
        var phases: [String] = []
        controller.changed = { _, phase, _, _, _ in
            phases.append(phase.rawValue)
            return phases.count
        }
        XCTAssertTrue(controller.apply(try node(active: true), webFrame: resting, barFrame: bar, triggerFrame: trigger, rendering: rendering))
        let navigation = try XCTUnwrap(controller.tabs.last?.viewController as? UINavigationController)
        let searchBar = try XCTUnwrap(navigation.topViewController?.navigationItem.searchController?.searchBar)
        controller.searchBar(searchBar, textDidChange: "query")
        XCTAssertEqual(phases, ["input"])
    }

}
