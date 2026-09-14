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

}
