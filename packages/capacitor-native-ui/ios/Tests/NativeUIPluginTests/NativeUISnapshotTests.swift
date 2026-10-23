import XCTest
import WebKit
import SwiftUI
import Capacitor
@testable import NativeUIPlugin

final class NativeUISnapshotTests: XCTestCase {
    @MainActor func testMeasuredTabWidthTracksNativeContentWithAndWithoutSearch() async throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires UISearchTab") }
        let owner = UIViewController()
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = owner
        window.makeKeyAndVisible()
        let rendering = NativeUIControlRendering()
        let bar = UITabBar()
        NativeUITabBar.configureLayout(bar)
        owner.view.addSubview(bar)
        let controller = NativeUISearchController()
        controller.attach(to: owner, in: owner.view)
        defer { controller.detach(); window.isHidden = true }
        let image = UIImage(systemName: "circle.fill")!.pngData()!.base64EncodedString()
        let search: JSObject = ["id": "search", "field": item(), "trigger": item(["id": "trigger"]),
            "closeId": "close", "active": false, "available": true, "focused": false,
            "value": "", "placeholder": "Search", "disabled": false, "editSequence": 0, "valueVersion": 0]
        for width in [299.0, 217.0, 299.0] {
            let items = ["Index", "Docs", "Library"].enumerated().map { index, label in item([
                "id": "tab-\(index)", "label": label, "selected": index == 0,
                "icon": image, "iconWidth": 26.0, "iconHeight": 26.0, "fontSize": 9.44, "fontWeight": 500.0]) }
            let node = try XCTUnwrap(decode([control(["kind": "tab-bar", "width": width, "height": 62.0,
                "search": search, "items": items])]).controls.first)
            let y = owner.view.bounds.height - 100
            let bounds = CGRect(x: 16, y: y, width: width, height: 62)
            NativeUITabBar.update(bar, node: node, rendering: rendering)
            XCTAssertTrue(NativeUITabBar.fit(bar, node: node, bounds: bounds))
            XCTAssertEqual(try XCTUnwrap(NativeUITabBar.contentFrame(bar)).width, min(width, 274), accuracy: 0.5)
            XCTAssertTrue(controller.apply(node, webFrame: owner.view.bounds, barFrame: bounds,
                triggerFrame: CGRect(x: 330, y: y, width: 56, height: 56), rendering: rendering))
            try await Task.sleep(nanoseconds: 100_000_000)
            XCTAssertEqual(try XCTUnwrap(controller.restingTabWidth), width, accuracy: 0.5)
        }
    }

    @MainActor func testHorizontalTabSelectionTintUpdatesAndResetsWithAndWithoutSearch() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires UISearchTab") }
        let rendering = NativeUIControlRendering()
        let bar = UITabBar()
        let controller = NativeUISearchController()
        controller.loadViewIfNeeded()
        let plainSystemTint = bar.tintColor
        let searchSystemTint = controller.tabBar.tintColor
        let frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        let search: JSObject = ["id": "search", "field": item(), "trigger": item(["id": "trigger"]),
            "closeId": "close", "active": false, "available": true, "focused": false,
            "value": "", "placeholder": "Search", "disabled": false, "editSequence": 0, "valueVersion": 0]
        for (index, tint) in (["rgb(255, 0, 0)", "rgb(128, 0, 128)", nil] as [String?]).enumerated() {
            var value = control(["kind": "tab-bar", "search": search, "items": [
                item(["id": "first", "selected": index % 2 == 0]),
                item(["id": "second", "selected": index % 2 != 0]),
                item(["id": "disabled", "disabled": true])]])
            value["tabTint"] = tint
            let node = try XCTUnwrap(decode([value]).controls.first)
            NativeUITabBar.update(bar, node: node, rendering: rendering)
            _ = controller.apply(node, webFrame: frame,
                barFrame: CGRect(x: 18, y: 730, width: 280, height: 62),
                triggerFrame: CGRect(x: 320, y: 730, width: 56, height: 56), rendering: rendering)
            XCTAssertEqual(bar.tintColor, tint.map { rendering.color($0) } ?? plainSystemTint)
            XCTAssertEqual(controller.tabBar.tintColor, tint.map { rendering.color($0) } ?? searchSystemTint)
            XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, index % 2 == 0 ? "first" : "second")
            XCTAssertEqual(controller.selectedTab?.identifier, index % 2 == 0 ? "first" : "second")
            XCTAssertEqual(bar.items?.last?.isEnabled, false)
            XCTAssertEqual(controller.tabs.first { $0.identifier == "disabled" }?.isEnabled, false)
            XCTAssertNil(bar.items?.first?.standardAppearance)
            XCTAssertNotEqual(controller.view.tintColor, UIColor.red, "Do not tint the search field or content")
        }
    }

    @MainActor func testVerticalTabSelectionTintUpdatesAndRestoresSystemAppearance() async throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires SwiftUI tabs") }
        let owner = UIViewController()
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = owner
        window.makeKeyAndVisible()
        let rail = NativeUIVerticalBarsController(activate: { _ in }, changed: { _, _, _, _, _ in 0 })
        rail.attach(to: owner, in: owner.view)
        defer { rail.detach(); window.isHidden = true }
        func tabController(_ parent: UIViewController) -> UITabBarController? {
            if let tabs = parent as? UITabBarController { return tabs }
            return parent.children.lazy.compactMap { tabController($0) }.first
        }
        func assertTint(_ actual: UIColor?, _ expected: UIColor?, traits: UITraitCollection,
                        file: StaticString = #filePath, line: UInt = #line) throws {
            func components(_ color: UIColor?) throws -> [CGFloat] {
                let color = try XCTUnwrap(color, file: file, line: line).resolvedColor(with: traits)
                var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
                XCTAssertTrue(color.getRed(&red, green: &green, blue: &blue, alpha: &alpha), file: file, line: line)
                return [red, green, blue, alpha]
            }
            // SwiftUI may resolve a dynamic UIColor into a different RGB color
            // space with tiny rounding differences. Compare the rendered components.
            for (actual, expected) in zip(try components(actual), try components(expected)) {
                XCTAssertEqual(actual, expected, accuracy: 0.001, file: file, line: line)
            }
        }
        var systemTint: UIColor?
        var controllerSystemTint: UIColor?
        for (index, tint) in ([nil, "rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(128, 0, 128)", nil] as [String?]).enumerated() {
            var value = control(["kind": "tab-bar", "placement": "vertical-bars", "items": [
                item(["id": "first", "label": "First", "selected": index % 2 == 0]),
                item(["id": "second", "label": "Second", "selected": index % 2 != 0]),
                item(["id": "disabled", "label": "Disabled", "disabled": true])]])
            value["tabTint"] = tint
            value["dark"] = index == 3
            window.overrideUserInterfaceStyle = index == 3 ? .dark : .light
            rail.apply(try decode([value]).controls, rendering: NativeUIControlRendering(), edge: "right", animated: false)
            try await Task.sleep(nanoseconds: 500_000_000)
            let tabs = try XCTUnwrap(tabController(owner))
            if index == 0 { systemTint = tabs.tabBar.tintColor; controllerSystemTint = tabs.view.tintColor }
            try assertTint(tabs.tabBar.tintColor, tint.map { NativeUIRendering.color($0) } ?? systemTint, traits: tabs.traitCollection)
            if tint == nil {
                try assertTint(tabs.view.tintColor, controllerSystemTint, traits: tabs.traitCollection)
            }
            if let tint {
                // On iOS 27.1, the visible SwiftUI rail follows its controller's
                // accent; setting only the legacy UITabBar property leaves it blue.
                try assertTint(tabs.view.tintColor, NativeUIRendering.color(tint), traits: tabs.traitCollection)
            }
            XCTAssertEqual(tabs.selectedIndex, index % 2)
            XCTAssertEqual(tabs.traitCollection.userInterfaceStyle, index == 3 ? .dark : .light)
            XCTAssertNil(tabs.tabBar.items?.first?.standardAppearance, "Keep the native background and state appearances")
            XCTAssertNotEqual(owner.view.tintColor, UIColor.red, "The tab accent must not tint the surrounding controls")
        }
    }

    @MainActor func testPopoverReopensAfterPresentationIdentityKeepsReplacedSource() async throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires SwiftUI toolbar") }
        let owner = UIViewController()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 700, height: 900))
        window.rootViewController = owner
        window.makeKeyAndVisible()
        let rail = NativeUIVerticalBarsController(activate: { _ in }, changed: { _, _, _, _, _ in 0 })
        rail.attach(to: owner, in: owner.view)
        defer { rail.detach(); window.isHidden = true }
        func page(_ action: String) throws -> [NativeUIControl] {
            try decode([control(["kind": "button", "placement": "vertical-bars", "transitionId": "stable-group",
                "items": [item(["id": action, "transitionId": "stable-button"]) ]])]).controls
        }
        rail.apply(try page("old-action"), rendering: NativeUIControlRendering(), edge: "right", animated: false)
        try await Task.sleep(nanoseconds: 500_000_000)
        let host = NativeUIOverlayHost(configuration: WKWebViewConfiguration(), options: ["animated": false], event: { _ in })
        host.preferredContentSize = CGSize(width: 180, height: 180)
        XCTAssertTrue(rail.presentPopover(anchor: "old-action", host: host, completion: { _ in }))
        for _ in 0..<50 {
            if host.anchoredVisible { break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTAssertTrue(host.anchoredVisible, "Fixture must display the actual SwiftUI popover")
        rail.apply(try page("new-action"), rendering: NativeUIControlRendering(), edge: "right", animated: false)
        try await Task.sleep(nanoseconds: 1_000_000_000)
        let nextHost = NativeUIOverlayHost(configuration: WKWebViewConfiguration(), options: nil, event: { _ in })
        XCTAssertTrue(rail.presentPopover(anchor: "new-action", host: nextHost, completion: { _ in }), "Replacing the source must not retain the old popover anchor")
    }

    @MainActor func testReplacingPendingPopoverSourceCompletesPresentationOnceAndAllowsReopen() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires SwiftUI toolbar") }
        let owner = UIViewController()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 700, height: 900))
        window.rootViewController = owner
        window.makeKeyAndVisible()
        let rail = NativeUIVerticalBarsController(activate: { _ in }, changed: { _, _, _, _, _ in 0 })
        rail.attach(to: owner, in: owner.view)
        defer { rail.detach(); window.isHidden = true }
        func page(_ action: String) throws -> [NativeUIControl] {
            try decode([control(["kind": "button", "placement": "vertical-bars", "transitionId": "stable-group",
                "items": [item(["id": action, "transitionId": "stable-button"])]])]).controls
        }
        let rendering = NativeUIControlRendering()
        rail.apply(try page("old-action"), rendering: rendering, edge: "right", animated: false)
        let host = NativeUIOverlayHost(configuration: WKWebViewConfiguration(), options: nil, event: { _ in })
        var results: [Bool] = []
        XCTAssertTrue(rail.presentPopover(anchor: "old-action", host: host) { results.append($0) })
        XCTAssertFalse(host.anchoredVisible)
        rail.apply(try page("new-action"), rendering: rendering, edge: "right", animated: false)
        XCTAssertEqual(results, [false])
        rail.apply(try page("new-action"), rendering: rendering, edge: "right", animated: false)
        XCTAssertEqual(results, [false])
        let next = NativeUIOverlayHost(configuration: WKWebViewConfiguration(), options: nil, event: { _ in })
        XCTAssertTrue(rail.presentPopover(anchor: "new-action", host: next) { _ in })
    }

    @MainActor func testToolbarTransitionIdentityDoesNotReplaceActionIdentity() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires SwiftUI toolbar") }
        let model = NativeUIVerticalBarsModel()
        let rendering = NativeUIControlRendering()
        func page(_ source: String, _ label: String) throws -> [NativeUIControl] {
            try decode([control(["id": "group-\(source)", "kind": "button", "transitionId": "trailing-group-0",
                "items": [item(["id": source, "transitionId": "edit", "label": label])]])]).controls
        }
        model.apply(try page("source-edit", "Edit"), rendering: rendering, animated: false)
        let outgoing = try XCTUnwrap(model.groups.first?.items.first)
        model.apply(try page("destination-done", "Done"), rendering: rendering, animated: false)
        let incoming = try XCTUnwrap(model.groups.first?.items.first)
        XCTAssertEqual(outgoing.transitionID, incoming.transitionID)
        XCTAssertNotEqual(outgoing.id, incoming.id)
        XCTAssertEqual(incoming.id, "destination-done")
        XCTAssertEqual(incoming.label, "Done")
        XCTAssertEqual(model.groups.first?.transitionID, "trailing-group-0")
        model.apply(try page("source-edit", "Edit"), rendering: rendering, animated: false)
        XCTAssertEqual(model.groups.first?.items.first?.id, outgoing.id)
        model.apply(try decode([control(["kind": "button", "items": [item(["id": "legacy"])]])]).controls,
                    rendering: rendering, animated: false)
        XCTAssertEqual(model.groups.first?.items.first?.transitionID, "legacy")
    }

    @MainActor func testSwiftUIToolbarForwardsTransitionIdentifier() async throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires SwiftUI toolbar") }
        let owner = UIViewController()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
        window.rootViewController = owner
        window.makeKeyAndVisible()
        let rail = NativeUIVerticalBarsController(activate: { _ in }, changed: { _, _, _, _, _ in 0 })
        rail.attach(to: owner, in: owner.view)
        defer { rail.detach(); window.isHidden = true }
        func buttons(_ vc: UIViewController) -> [UIBarButtonItem] {
            var result: [UIBarButtonItem] = []
            if let nav = vc as? UINavigationController {
                for entry in nav.navigationBar.items ?? [] {
                    let groups = entry.leadingItemGroups + entry.centerItemGroups + entry.trailingItemGroups
                    result += groups.flatMap(\.barButtonItems)
                }
            }
            return result + vc.children.flatMap(buttons)
        }
        // Push and return replace source content while keeping the presentation ID.
        for (page, action, label, disabled) in [("one", "edit", "Edit", false), ("one", "edit", "Saving", true),
            ("one", "replacement", "Retry", false), ("two", "done", "Done", false), ("one", "edit", "Edit", false)] {
            let controls = try decode([control(["id": "group-\(page)", "kind": "button", "placement": "vertical-bars",
                "transitionId": "group-position-0", "items": [item(["id": "action-\(action)",
                "label": label, "disabled": disabled, "transitionId": "presentation-edit"])]])]).controls
            rail.apply(controls, rendering: NativeUIControlRendering(), edge: "right", animated: false)
            for _ in 0..<40 {
                owner.view.layoutIfNeeded()
                if buttons(owner).contains(where: { $0.identifier == "presentation-edit" && $0.title == label && $0.isEnabled == !disabled }) { break }
                try await Task.sleep(nanoseconds: 50_000_000)
            }
            let presented = buttons(owner).filter { $0.identifier == "presentation-edit" }
            XCTAssertEqual(presented.count, 1)
            XCTAssertEqual(presented.first?.title, label)
            XCTAssertEqual(presented.first?.isEnabled, !disabled)
            XCTAssertFalse(buttons(owner).contains { $0.identifier == "action-\(action)" })
        }
    }

    @MainActor func testVerticalNavigationUsesTheWebStackAndRetainsOutgoingContent() async throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires SwiftUI navigation") }
        let owner = UIViewController()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
        window.rootViewController = owner
        window.makeKeyAndVisible()
        let rail = NativeUIVerticalBarsController(activate: { _ in }, changed: { _, _, _, _, _ in 0 })
        rail.attach(to: owner, in: owner.view)
        defer { rail.detach(); window.isHidden = true }
        func navigation(_ vc: UIViewController) -> UINavigationController? {
            (vc as? UINavigationController) ?? vc.children.compactMap(navigation).first
        }
        let model = NativeUIVerticalBarsModel()
        var outgoing: String?
        // Push, pop and canceled-pop restoration must preserve each page's content,
        // even though both pages use the same presentation identities.
        for path in [["root"], ["root", "detail"], ["root"], ["root", "detail"]] {
            let page = path.last!
            let controls = try decode([control(["id": page, "kind": "button", "placement": "vertical-bars",
                "transitionId": "end-0", "items": [item(["id": page, "label": page, "transitionId": "action-0"])]])]).controls
            if let outgoing {
                let previousCount = navigation(owner)?.viewControllers.count
                rail.apply(controls, rendering: NativeUIControlRendering(), edge: "right", animated: true,
                           navigation: path, navigationPhase: "tracking")
                try await Task.sleep(nanoseconds: 500_000_000)
                owner.view.layoutIfNeeded()
                XCTAssertEqual(navigation(owner)?.viewControllers.count, previousCount)
                let entry = navigation(owner)?.topViewController?.navigationItem
                let titles = ((entry?.leadingItemGroups ?? []) + (entry?.trailingItemGroups ?? [])).flatMap(\.barButtonItems).compactMap(\.title)
                XCTAssertTrue(titles.contains(outgoing))
                XCTAssertFalse(rail.view.isUserInteractionEnabled)
            }
            rail.apply(controls, rendering: NativeUIControlRendering(), edge: "right", animated: false,
                       navigation: path, navigationPhase: "settling")
            XCTAssertFalse(rail.view.isUserInteractionEnabled)
            rail.apply(controls, rendering: NativeUIControlRendering(), edge: "right", animated: false, navigation: path)
            XCTAssertTrue(rail.view.isUserInteractionEnabled)
            model.apply(controls, rendering: NativeUIControlRendering(), animated: false, navigation: path)
            for retainedPage in Set([page] + (outgoing.map { [$0] } ?? [])) {
                let group = try XCTUnwrap(model.groups(on: retainedPage).first)
                XCTAssertEqual(group.id, retainedPage)
                XCTAssertEqual(group.items.map(\.id), [retainedPage])
                XCTAssertEqual(group.items.map(\.label), [retainedPage])
            }
            outgoing = page
            for _ in 0..<40 {
                owner.view.layoutIfNeeded()
                if navigation(owner)?.viewControllers.count == path.count { break }
                try await Task.sleep(nanoseconds: 50_000_000)
            }
            XCTAssertEqual(navigation(owner)?.viewControllers.count, path.count)
        }
    }

    func testStandardRendererKindsDoNotRequireIonicNames() throws {
        let pairs: [(String, String, NativeUIComponent)] = [
            ("button", "ion-button", .button), ("button-group", "ion-buttons", .buttons),
            ("back-button", "ion-back-button", .backButton), ("menu-button", "ion-menu-button", .menuButton),
            ("tab-bar", "ion-tab-bar", .tabBar), ("segment", "ion-segment", .segment),
            ("floating-action-button", "ion-fab", .fab)
        ]
        for (standard, legacy, expected) in pairs {
            for name in [standard, legacy] {
                let value = try JSONDecoder().decode(NativeUIComponent.self, from: JSONEncoder().encode(name))
                XCTAssertEqual(value, expected)
                XCTAssertEqual(value.rawValue, standard)
            }
        }
        XCTAssertThrowsError(try JSONDecoder().decode(NativeUIComponent.self, from: JSONEncoder().encode("unknown")))
    }

    @MainActor func testVerticalBarGeometryIgnoresZeroSizeScaffoldsAndConvertsCoordinates() throws {
        let owner = UIViewController()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 466, height: 678))
        window.rootViewController = owner
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        let web = UIView(frame: CGRect(x: 20, y: 30, width: 446, height: 648))
        owner.view.addSubview(web)
        let root = UIView(frame: owner.view.bounds)
        owner.view.addSubview(root)
        let scaffold = UIView(frame: .zero)
        root.addSubview(scaffold)
        let surface = UIView(frame: CGRect(x: 100, y: 170, width: 48, height: 48))
        scaffold.addSubview(surface)
        let label = UIView(frame: CGRect(x: 5, y: 6, width: 38, height: 36))
        label.accessibilityIdentifier = "BackButton"
        surface.addSubview(label)
        let frames = NativeUIVerticalBarsGeometry.measure(in: root, relativeTo: web, ids: ["BackButton"])
        XCTAssertEqual(frames["BackButton"], CGRect(x: 80, y: 140, width: 48, height: 48))
        XCTAssertTrue(NativeUIVerticalBarsGeometry.measure(in: root, relativeTo: web, ids: ["missing"]).isEmpty)
    }

    @MainActor func testVerticalPopoverCanCancelBeforeSwiftUIAppearsAndReopen() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires native Vertical Bars") }
        let owner = UIViewController()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 700, height: 900))
        window.rootViewController = owner
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        let rail = NativeUIVerticalBarsController(activate: { _ in }, changed: { _, _, _, _, _ in 0 })
        rail.attach(to: owner, in: owner.view)
        defer { rail.detach() }
        rail.apply(try decode([control(["placement": "vertical-bars"])]).controls,
                   rendering: NativeUIControlRendering(), edge: "right")
        for _ in 0..<3 {
            let host = NativeUIOverlayHost(configuration: WKWebViewConfiguration(), options: nil, event: { _ in })
            var results: [Bool] = []
            XCTAssertTrue(rail.presentPopover(anchor: "action", host: host, completion: { results.append($0) }))
            // Cancel in the same runloop turn, before SwiftUI can call onAppear.
            XCTAssertFalse(host.anchoredVisible)
            host.dismissAnchored?()
            XCTAssertEqual(results, [false])
            XCTAssertFalse(host.anchoredVisible)
            host.dismissAnchored?()
            XCTAssertEqual(results, [false], "Cancellation must settle presentation only once")
        }
    }

    @MainActor func testVisiblePopoverDismissalNotifiesAllOverlappingCallersOnce() {
        let host = NativeUIOverlayHost(configuration: WKWebViewConfiguration(), options: nil, event: { _ in })
        host.anchoredVisible = true
        var dismissals = 0
        var completed: [Int] = []
        host.dismissAnchored = { dismissals += 1 }
        for caller in 0..<3 {
            host.dismissPopover(animated: false) { completed.append(caller) }
        }
        XCTAssertEqual(dismissals, 1)
        XCTAssertTrue(completed.isEmpty)
        // SwiftUI delivers this callback only after the visible popover disappears.
        host.anchoredVisible = false
        host.completeDismissal()
        XCTAssertEqual(completed, [0, 1, 2])
        host.completeDismissal()
        XCTAssertEqual(completed, [0, 1, 2])
        host.dismissPopover(animated: false) { completed.append(3) }
        XCTAssertEqual(completed, [0, 1, 2, 3])
    }

    @MainActor func testMissingPopoverDisappearanceCancelsPresentationAndSettlesAllWaiters() {
        let host = NativeUIOverlayHost(configuration: WKWebViewConfiguration(), options: nil, event: { _ in })
        host.anchoredVisible = true
        host.dismissAnchored = {} // No onDisappear callback arrives.
        var cancelled = false
        host.cancelAnchored = { cancelled = true }
        let closed = expectation(description: "Both stop requests finish after cancellation")
        closed.expectedFulfillmentCount = 2
        for _ in 0..<2 {
            host.dismissPopover(animated: false) {
                XCTAssertTrue(cancelled)
                closed.fulfill()
            }
        }
        waitForExpectations(timeout: NativeUIOverlayHost.completionTimeout + 2)
        XCTAssertFalse(host.anchoredVisible)
    }

    @MainActor func testDetachingRailSettlesPopoverPresentationAndDismissal() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires native Vertical Bars") }
        let owner = UIViewController()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 700, height: 900))
        window.rootViewController = owner
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        let rail = NativeUIVerticalBarsController(activate: { _ in }, changed: { _, _, _, _, _ in 0 })
        rail.attach(to: owner, in: owner.view)
        rail.apply(try decode([control(["placement": "vertical-bars"])]).controls,
                   rendering: NativeUIControlRendering(), edge: "right")
        let host = NativeUIOverlayHost(configuration: WKWebViewConfiguration(), options: nil, event: { _ in })
        var presentations: [Bool] = []
        XCTAssertTrue(rail.presentPopover(anchor: "action", host: host) { presentations.append($0) })
        host.anchoredVisible = true
        var dismissals = 0
        host.dismissPopover(animated: false) { dismissals += 1 }
        rail.detach()
        XCTAssertEqual(presentations, [false])
        XCTAssertEqual(dismissals, 1)
        XCTAssertFalse(host.anchoredVisible)
        rail.detach()
        XCTAssertEqual(dismissals, 1)
    }

    @MainActor func testStoppingPreparedPopoverRestoresWebViewAndAllowsNewSession() {
        let source = WKWebView(frame: .zero)
        let owner = UIViewController()
        final class Delegate: NSObject, WKUIDelegate {}
        let original = Delegate()
        source.uiDelegate = original
        for initiallyAllowed in [false, true] {
            source.configuration.preferences.javaScriptCanOpenWindowsAutomatically = initiallyAllowed
            let previous = NativeUIOverlayController(source: source, owner: owner, event: { _, _ in })
            XCTAssertTrue(previous.prepare("old-context"))
            XCTAssertTrue(source.configuration.preferences.javaScriptCanOpenWindowsAutomatically)
            var stopped = false
            previous.stop { stopped = true }
            XCTAssertTrue(stopped)
            XCTAssertTrue(source.uiDelegate === original)
            XCTAssertEqual(source.configuration.preferences.javaScriptCanOpenWindowsAutomatically, initiallyAllowed)

            let replacement = NativeUIOverlayController(source: source, owner: owner, event: { _, _ in })
            XCTAssertTrue(replacement.prepare("new-context"))
            replacement.stop {}
            XCTAssertTrue(source.uiDelegate === original)
            XCTAssertEqual(source.configuration.preferences.javaScriptCanOpenWindowsAutomatically, initiallyAllowed)
        }
    }

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

    private func decode(_ controls: [JSObject], width: Double = 390) throws -> NativeUISnapshot {
        try JSValueDecoder().decode(NativeUISnapshot.self, from: ["revision": 1, "viewportWidth": width, "controls": controls])
    }

    func testModalAnimationRequiresBoundsAndValidTiming() throws {
        let motion: JSObject = ["id": 1, "startedAt": 1000.0, "duration": 500.0, "fromY": 900.0,
            "opacity": 1.0, "easing": [0.32, 0.72, 0.0, 1.0]]
        var payload: JSObject = ["revision": 1, "viewportWidth": 466.0, "controls": [control()], "modalAnimation": motion]
        XCTAssertFalse(try JSValueDecoder().decode(NativeUISnapshot.self, from: payload).isValid)
        payload["verticalBarFrame"] = ["x": 0.0, "y": 0.0, "width": 466.0, "height": 900.0]
        XCTAssertTrue(try JSValueDecoder().decode(NativeUISnapshot.self, from: payload).isValid)
        for invalid: JSObject in [["duration": 0.0], ["opacity": 2.0], ["easing": [0.0]], ["easing": [-1.0, 0.0, 1.0, 1.0]]] {
            payload["modalAnimation"] = motion.merging(invalid) { _, value in value }
            XCTAssertFalse(try JSValueDecoder().decode(NativeUISnapshot.self, from: payload).isValid)
        }
    }

    func testModalRailFrameIsOptionalAndRequiresPositiveBounds() throws {
        var payload: JSObject = ["revision": 1, "viewportWidth": 466.0, "controls": [control()]]
        let page = try JSValueDecoder().decode(NativeUISnapshot.self, from: payload)
        XCTAssertNil(page.verticalBarFrame)
        for height in [339.0, 0.0, -1.0] {
            payload["verticalBarFrame"] = ["x": 0.0, "y": 339.0, "width": 466.0, "height": height]
            let modal = try JSValueDecoder().decode(NativeUISnapshot.self, from: payload)
            XCTAssertEqual(modal.isValid, height > 0)
            XCTAssertEqual(modal.verticalBarFrame?.y, 339)
        }
    }

    @MainActor func testTabTypographyPreservesCSSWeightsAndSize() throws {
        let weights: [UIFont.Weight] = [.ultraLight, .thin, .light, .regular, .medium, .semibold, .bold, .heavy, .black]
        let tab = UITabBarItem()
        for (index, weight) in weights.enumerated() {
            let cssWeight = Double((index + 1) * 100)
            let content = try decode([control(["items": [item(["fontSize": 19.0, "fontWeight": cssWeight])]])]).controls[0].items[0].content
            NativeUITabBar.applyTypography(content, to: tab)
            for state in [UIControl.State.normal, .selected] {
                let font = try XCTUnwrap(tab.titleTextAttributes(for: state)?[.font] as? UIFont)
                XCTAssertEqual(font.pointSize, 19)
                XCTAssertEqual(font, UIFont.systemFont(ofSize: 19, weight: weight), "CSS weight \(cssWeight)")
            }
        }
    }

    @MainActor func testVerticalSnapshotKeepsOneAnimationTransaction() async throws {
        guard #available(iOS 26.0, *), !UIAccessibility.isReduceMotionEnabled else {
            throw XCTSkip("Requires adaptive controls with motion enabled")
        }
        struct Probe: View {
            @ObservedObject var model: NativeUIVerticalBarsModel
            let observed: (Bool) -> Void
            var body: some View {
                Text("\(model.groups.count):\(model.tabs.count):\(model.selection):\(model.accessory != nil)")
                    .transaction { observed($0.animation != nil) }
            }
        }
        let model = NativeUIVerticalBarsModel()
        var next: XCTestExpectation?
        var animatedTransaction: Bool?
        let host = UIHostingController(rootView: Probe(model: model) { animated in
            guard let pending = next else { return }
            animatedTransaction = animated
            next = nil
            pending.fulfill()
        })
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 440, height: 900))
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.layoutIfNeeded()
        defer { window.isHidden = true }
        for animated in [true, false] {
            let updated = expectation(description: "snapshot animated=\(animated)")
            next = updated
            model.apply(try decode([control(["kind": "ion-button"])]).controls,
                        rendering: NativeUIControlRendering(), animated: animated,
                        accessory: animated ? AnyView(Text("Player")) : nil)
            await fulfillment(of: [updated], timeout: 3)
            XCTAssertEqual(animatedTransaction, animated)
        }
    }

    @MainActor func testVerticalMenuAndBackReuseTheSameLeadingSurface() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires SwiftUI adaptive controls") }
        let model = NativeUIVerticalBarsModel()
        for kind in ["menu-button", "back-button", "menu-button"] {
            let controls = try decode([control(["kind": kind, "placement": "vertical-bars",
                "transitionId": "start-0", "toolbarSlot": kind == "back-button" ? NSNull() : "start", "items": [item(["id": kind, "transitionId": "start-0-item-0", "disabled": true])]
            ])]).controls
            model.apply(controls, rendering: NativeUIControlRendering())
            XCTAssertEqual(model.groups.count, 1)
            XCTAssertEqual(model.groups[0].transitionID, "start-0")
            XCTAssertEqual(model.groups[0].slot, .start)
            XCTAssertEqual(model.groups[0].items[0].transitionID, "start-0-item-0")
            XCTAssertEqual(model.groups[0].items[0].id, kind)
            XCTAssertEqual(model.groups[0].items[0].isBack, kind == "back-button")
            XCTAssertTrue(model.groups[0].items[0].disabled)
        }
    }

    @MainActor func testVerticalBarsPreserveButtonAppearance() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires SwiftUI adaptive controls") }
        let controls = try decode([control(["kind": "ion-buttons", "items": [
            item(["backgroundColor": "rgb(0, 122, 255)"]),
            item(["id": "clear", "buttonFill": "clear"]),
            item(["id": "outline", "borderColor": "rgb(255, 0, 0)", "borderWidth": 2.0])
        ]])]).controls
        XCTAssertEqual(controls.first?.items.first?.content.backgroundColor, "rgb(0, 122, 255)")
        let model = NativeUIVerticalBarsModel()
        model.apply(controls, rendering: NativeUIControlRendering())
        XCTAssertNotNil(model.groups.first?.items.first?.background)
        XCTAssertEqual(model.groups.first?.items.map(\.clear), [false, true, false])
        XCTAssertNotNil(model.groups.first?.items.last?.borderColor)
        XCTAssertEqual(model.groups.first?.items.last?.borderWidth, 2)
        model.apply(try decode([control(["kind": "ion-button"])]).controls, rendering: NativeUIControlRendering())
        XCTAssertNil(model.groups.first?.items.first?.background)
        XCTAssertEqual(model.groups.first?.items.first?.clear, false)
        XCTAssertNil(model.groups.first?.items.first?.borderColor)
        XCTAssertEqual(model.groups.first?.items.first?.borderWidth, 0)
    }

    @MainActor func testVerticalBarsTabOptimismWaitsForWebAndRollsBackWhenStale() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires SwiftUI adaptive tabs") }
        func tabs(_ selected: String, includeRight: Bool = true) throws -> [NativeUIControl] {
            var items = [item(["id": "left", "selected": selected == "left"])]
            if includeRight {
                items.append(item(["id": "right", "selected": selected == "right",
                    "badge": ["value": "3", "color": "rgb(255, 0, 0)", "textColor": "rgb(255, 255, 255)"]]))
            }
            return try decode([control(["kind": "ion-tab-bar", "items": items])]).controls
        }
        let model = NativeUIVerticalBarsModel()
        let rendering = NativeUIControlRendering()
        model.apply(try tabs("left"), rendering: rendering, now: 100)
        XCTAssertEqual(model.tabs.last?.badge?.value, "3")
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
        func node(_ items: [JSObject]) throws -> NativeUIControl {
            try XCTUnwrap(decode([control(["kind": "ion-segment", "width": 160.0, "items": items])]).controls.first)
        }
        let first = try node([item(["id": "left", "selected": true]), item(["id": "right"])])
        var activated: [String] = []
        let segment = try XCTUnwrap(NativeUISegment.make(first, scale: 1, rendering: NativeUIControlRendering(),
            activate: { activated.append($0) }) as? NativeUISegment)
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
        segment.update(echo, scale: 1, rendering: NativeUIControlRendering())
        segment.layoutIfNeeded()
        XCTAssertEqual(segment.selectedSegmentIndex, 1)
        XCTAssertEqual(segment.subviews, children)
        XCTAssertNotNil(segment.layer.animation(forKey: "selection-in-flight"))
        segment.sendActions(for: .valueChanged)
        XCTAssertEqual(activated, ["right"])

        // Web can reject a selection, clear it, or replace the available actions.
        segment.update(first, scale: 1, rendering: NativeUIControlRendering())
        XCTAssertEqual(segment.selectedSegmentIndex, 0)
        let replaced = try node([item(["id": "replacement", "label": "Updated", "disabled": true])])
        segment.update(replaced, scale: 2, rendering: NativeUIControlRendering())
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
        let original = try JSValueDecoder().decode(NativeUIItem.self, from: item(["visible": true]))
        let moved = try JSValueDecoder().decode(NativeUIItem.self, from: item(["x": 20.0, "visible": false]))
        XCTAssertNotEqual(original, moved)
        XCTAssertEqual(original.content.fabArtwork, moved.content.fabArtwork)
        let opened = try JSValueDecoder().decode(NativeUIItem.self, from: item([
            "selected": true, "icon": "normal", "closeIcon": "close", "closeIconWidth": 20.0, "closeIconHeight": 20.0]))
        XCTAssertEqual(opened.content.fabArtwork.icon, "close")
        XCTAssertEqual(opened.content.fabArtwork.iconWidth, 20)
        XCTAssertEqual(opened.content.fabArtwork.label, "")
        XCTAssertNotEqual(original.content.fabArtwork, opened.content.fabArtwork)
    }

    @MainActor
    func testTabVariantsAndBadgeUpdatesKeepItemIdentity() throws {
        let rendering = NativeUIControlRendering()
        let image = UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24)).image { context in
            UIColor.black.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 24, height: 24))
        }.pngData()!.base64EncodedString()
        let dot: JSObject = ["value": "", "color": "rgb(235, 68, 90)", "textColor": "rgb(255, 255, 255)"]
        let number: JSObject = ["value": "47", "color": "rgb(0, 102, 255)", "textColor": "rgb(255, 255, 255)"]
        func node(_ badges: Bool) throws -> NativeUIControl {
            let items = [
                item(["id": "icon", "label": "", "icon": image, "iconWidth": 24.0, "iconHeight": 24.0]),
                item(["id": "label", "label": "Music"]),
                item(["id": "dot", "badge": badges ? dot : NSNull()]),
                item(["id": "number", "badge": badges ? number : NSNull()])
            ]
            return try decode([control(["kind": "ion-tab-bar", "items": items])]).controls[0]
        }
        let bar = UITabBar()
        NativeUITabBar.update(bar, node: try node(true), rendering: rendering)
        let items = try XCTUnwrap(bar.items)
        XCTAssertEqual(items[0].title, "")
        XCTAssertNotNil(items[0].image)
        XCTAssertEqual(items[1].title, "Music")
        XCTAssertNil(items[1].image)
        XCTAssertEqual(items[2].badgeValue, "")
        XCTAssertEqual(items[3].badgeValue, "47")
        XCTAssertEqual(items[2].badgeColor, rendering.color("rgb(235, 68, 90)"))
        XCTAssertEqual(items[3].badgeColor, rendering.color("rgb(0, 102, 255)"))
        NativeUITabBar.update(bar, node: try node(false), rendering: rendering)
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
        let controller = NativeUISearchController()
        let rendering = NativeUIControlRendering()
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
        let controller = NativeUISearchController()
        let rendering = NativeUIControlRendering()
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
    func testButtonDisabledAccessibilityTracksReusedView() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires glass buttons") }
        let rendering = NativeUIControlRendering()
        var button: UIButton?
        for disabled in [false, true, false] {
            let node = try XCTUnwrap(decode([control(["kind": "ion-button", "items": [item(["disabled": disabled])]])]).controls.first)
            button = try XCTUnwrap(NativeUIButton.make(node, existing: button, rendering: rendering, activate: { _ in }))
            XCTAssertEqual(button?.isEnabled, !disabled)
            XCTAssertEqual(button?.accessibilityTraits.contains(.notEnabled), disabled)
        }
    }

    @MainActor
    func testClearStandaloneToolbarButtonHasNoGlassBackground() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires glass buttons") }
        let node = try XCTUnwrap(decode([control(["kind": "ion-button", "items": [item(["label": "Cancel", "buttonFill": "clear"]) ]])]).controls.first)
        let button = try XCTUnwrap(NativeUIButton.make(node, rendering: NativeUIControlRendering(), activate: { _ in }))
        XCTAssertEqual(button.configuration?.background, UIButton.Configuration.plain().background)
        XCTAssertEqual(button.configuration?.title, "Cancel")
    }

    @MainActor
    func testToolbarInterpolatesAtEveryPagePercentageAndRestoresOnCancellation() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires glass buttons") }
        let source = try XCTUnwrap(decode([control(["id": "source", "kind": "ion-menu-button", "transitionId": "leading",
            "x": 10.0, "width": 44.0, "items": [item(["id": "menu", "label": "Menu", "transitionId": "button", "width": 44.0]) ]])]).controls.first)
        let destination = try XCTUnwrap(decode([control(["id": "target", "kind": "ion-back-button", "transitionId": "leading",
            "x": 30.0, "width": 64.0, "items": [item(["id": "back", "label": "Back", "transitionId": "button", "width": 64.0, "disabled": true]) ]])]).controls.first)
        let host = UIView()
        let rendering = NativeUIControlRendering()
        let button = try XCTUnwrap(NativeUIButton.make(source, rendering: rendering, activate: { _ in }))
        button.frame = source.frame.rect
        host.addSubview(button)
        let transition = NativeUIToolbarTransition(NativeUIToolbarTransitionSnapshot(id: 1, sourceIds: [source.id], destination: [destination]),
            sources: [source], controls: [source.id: button], scale: 1, origin: .zero, rendering: rendering)
        let contents = button.subviews.compactMap { $0 as? UIButton }
        let old = try XCTUnwrap(contents.first { $0.accessibilityIdentifier == "menu" })
        let new = try XCTUnwrap(contents.first { $0.accessibilityIdentifier == "back" })
        for value in [0.0, 0.2, 0.4, 0.6, 0.8, 1.0, 0.4, 0.0] {
            transition.setProgress(value)
            XCTAssertEqual(button.frame.minX, 10 + 20 * value, accuracy: 0.001)
            XCTAssertEqual(button.frame.width, 44 + 20 * value, accuracy: 0.001)
            XCTAssertEqual(button.alpha, 1)
            XCTAssertEqual(old.alpha, value == 0 ? 1 : 0)
            XCTAssertEqual(new.alpha, value > 0 ? 1 : 0)
            XCTAssertTrue(old.isEnabled)
            XCTAssertFalse(new.isEnabled)
            XCTAssertFalse(old.isUserInteractionEnabled)
            XCTAssertFalse(new.isUserInteractionEnabled)
            XCTAssertEqual(old.bounds.width, 44)
            XCTAssertEqual(new.bounds.width, 64)
            XCTAssertEqual(old.center.x, new.center.x, accuracy: 0.001)
        }
        transition.restore()
        XCTAssertEqual(button.frame, source.frame.rect)
        XCTAssertEqual(button.configuration?.title, "Menu")
        XCTAssertTrue(button.isEnabled)
        XCTAssertNil(new.superview)
    }

    @MainActor
    func testSingleAndGroupMorphBothWaysAndRestoreIncludingClearBackground() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires glass buttons") }
        for groupX in [40.0, 200.0] {
            for clear in [false, true] {
                let single = try XCTUnwrap(decode([control(["id": "single", "kind": "ion-button", "transitionId": "surface",
                    "x": 100.0, "width": 44.0, "items": [item(["id": "a-single", "label": "A", "transitionId": "a", "width": 44.0,
                        "buttonFill": clear ? "clear" : "solid"]) ]])]).controls.first)
                let group = try XCTUnwrap(decode([control(["id": "group", "kind": "ion-buttons", "transitionId": "surface",
                    "x": groupX, "width": 104.0, "items": [
                        item(["id": "a-group", "label": "A", "transitionId": "a", "width": 44.0]),
                        item(["id": "b-group", "label": "B", "transitionId": "b", "x": 60.0, "width": 44.0]) ]])]).controls.first)
                for (source, destination) in [(single, group), (group, single)] {
                    let rendering = NativeUIControlRendering()
                    let view: UIView = source.kind == .buttons
                        ? NativeUIButtons.make(source, scale: 1, rendering: rendering, activate: { _ in })
                        : try XCTUnwrap(NativeUIButton.make(source, rendering: rendering, activate: { _ in }))
                    view.frame = source.frame.rect
                    let originalClipping = view.clipsToBounds
                    let originalConfiguration = (view as? UIButton)?.configuration
                    let transition = NativeUIToolbarTransition(NativeUIToolbarTransitionSnapshot(id: 1, sourceIds: [source.id], destination: [destination]),
                        sources: [source], controls: [source.id: view], scale: 1, origin: .zero, rendering: rendering)
                    let host = (view as? UIVisualEffectView)?.contentView ?? view
                    let extra = try XCTUnwrap(host.subviews.compactMap { $0 as? UIButton }.last { $0.accessibilityIdentifier == "b-group" })
                    for progress in [0.0, 0.2, 0.5, 0.8, 1.0, 0.5, 0.0] {
                        transition.setProgress(progress)
                        XCTAssertEqual(view.clipsToBounds, originalClipping)
                        XCTAssertEqual(view.frame.width, source.frame.width + (destination.frame.width - source.frame.width) * progress, accuracy: 0.001)
                        let amount = source.kind == .buttons ? 1 - progress : progress
                        XCTAssertEqual(extra.transform.a, max(0.001, amount), accuracy: 0.001)
                        let start = source.kind == .buttons ? groupX + 82 : 122
                        let end = destination.kind == .buttons ? groupX + 82 : 122
                        XCTAssertEqual(view.frame.minX + extra.center.x, start + (end - start) * progress, accuracy: 0.001)
                        XCTAssertEqual(extra.alpha, amount > 0 ? 1 : 0)
                        if source.kind == .buttons && clear {
                            XCTAssertEqual((view as? UIVisualEffectView)?.effect == nil, progress > 0)
                        }
                    }
                    transition.restore()
                    XCTAssertEqual(view.frame, source.frame.rect)
                    XCTAssertEqual(view.clipsToBounds, originalClipping)
                    XCTAssertEqual((view as? UIButton)?.configuration, originalConfiguration)
                    if source.kind == .buttons { XCTAssertNotNil((view as? UIVisualEffectView)?.effect) }
                    XCTAssertNil(extra.superview)
                }
            }
        }
    }

    @MainActor
    func testNewToolbarDestinationUsesItsNativeViewThroughProgressAndRestoration() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires glass buttons") }
        let destination = try XCTUnwrap(decode([control(["id": "save", "kind": "ion-button", "transitionId": "end-1",
            "items": [item(["id": "save-action", "label": "Save"]) ]])]).controls.first)
        let rendering = NativeUIControlRendering()
        let button = try XCTUnwrap(NativeUIButton.make(destination, rendering: rendering, activate: { _ in }))
        let host = UIView()
        host.addSubview(button)
        let transition = NativeUIToolbarTransition(NativeUIToolbarTransitionSnapshot(id: 1, sourceIds: [], destination: [destination]),
            sources: [], controls: [destination.id: button], scale: 1, origin: .zero, rendering: rendering)
        for progress in [0.0, 0.2, 0.5, 1.0, 0.5, 0.0] {
            transition.setProgress(progress)
            XCTAssertTrue(button.superview === host)
            XCTAssertEqual(button.alpha, progress, accuracy: 0.001)
            XCTAssertEqual(button.transform.a, max(0.001, progress), accuracy: 0.001)
            XCTAssertFalse(button.isUserInteractionEnabled)
        }
        transition.restore()
        XCTAssertTrue(button.superview === host)
        XCTAssertEqual(button.alpha, 1)
        XCTAssertEqual(button.transform, .identity)
        XCTAssertTrue(button.isUserInteractionEnabled)
    }

    @MainActor
    func testUnmatchedToolbarSurfaceFadesInPlaceAndRestoresOnCancellation() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires glass buttons") }
        for group in [false, true] {
            let source = try XCTUnwrap(decode([control(["id": "source", "kind": group ? "ion-buttons" : "ion-button",
                "items": [item(["id": "action", "label": "Save", "disabled": true]) ]])]).controls.first)
            let rendering = NativeUIControlRendering()
            let view: UIView = group
                ? NativeUIButtons.make(source, scale: 1, rendering: rendering, activate: { _ in })
                : try XCTUnwrap(NativeUIButton.make(source, rendering: rendering, activate: { _ in }))
            view.frame = source.frame.rect
            view.alpha = 0.7
            let host = UIView()
            host.addSubview(view)
            let transition = NativeUIToolbarTransition(NativeUIToolbarTransitionSnapshot(id: 1, sourceIds: [source.id], destination: []),
                sources: [source], controls: [source.id: view], scale: 1, origin: .zero, rendering: rendering)
            for progress in [0.0, 0.2, 0.5, 0.8, 1.0, 0.5, 0.0] {
                transition.setProgress(progress)
                XCTAssertTrue(view.superview === host)
                XCTAssertEqual(view.frame, source.frame.rect)
                XCTAssertEqual(view.alpha, 0.7 * (1 - progress), accuracy: 0.001)
                XCTAssertFalse(view.isUserInteractionEnabled)
            }
            transition.restore()
            XCTAssertEqual(view.alpha, 0.7, accuracy: 0.001)
            XCTAssertTrue(view.isUserInteractionEnabled)
            let buttons = group ? (view as? UIVisualEffectView)?.contentView.subviews.compactMap { $0 as? UIButton } ?? [] : [try XCTUnwrap(view as? UIButton)]
            XCTAssertFalse(try XCTUnwrap(buttons.first).isEnabled)
        }
    }

    @MainActor
    func testUnchangedBackContentStaysOpaqueAtEveryPagePercentage() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires glass buttons") }
        let source = try XCTUnwrap(decode([control(["id": "source", "kind": "ion-back-button", "transitionId": "leading",
            "items": [item(["id": "old", "label": "Back", "transitionId": "button"]) ]])]).controls.first)
        let destination = try XCTUnwrap(decode([control(["id": "target", "kind": "ion-back-button", "transitionId": "leading",
            "items": [item(["id": "new", "label": "Back", "transitionId": "button"]) ]])]).controls.first)
        let host = UIView()
        let rendering = NativeUIControlRendering()
        let button = try XCTUnwrap(NativeUIButton.make(source, rendering: rendering, activate: { _ in }))
        host.addSubview(button)
        let transition = NativeUIToolbarTransition(NativeUIToolbarTransitionSnapshot(id: 1, sourceIds: [source.id], destination: [destination]),
            sources: [source], controls: [source.id: button], scale: 1, origin: .zero, rendering: rendering)
        let contents = button.subviews.compactMap { $0 as? UIButton }
        XCTAssertEqual(contents.count, 1)
        for value in [0.0, 0.2, 0.4, 0.6, 0.8, 1.0] {
            transition.setProgress(value)
            XCTAssertEqual(contents.first?.alpha, 1)
        }
        transition.restore()
    }

    @MainActor
    func testMenuToBackReusesButtonAndReplacesItsAction() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires native glass buttons") }
        let menu = try XCTUnwrap(decode([control(["id": "menu-control", "kind": "ion-menu-button",
            "items": [item(["id": "menu", "transitionId": "leading-0", "selected": true])]])]).controls.first)
        let back = try XCTUnwrap(decode([control(["id": "back-control", "kind": "ion-back-button",
            "items": [item(["id": "back", "transitionId": "leading-0"])]])]).controls.first)
        var actions: [String] = []
        let button = try XCTUnwrap(NativeUIButton.make(menu, rendering: NativeUIControlRendering(), activate: { actions.append($0) }))
        button.sendActions(for: .touchUpInside)
        var controls: [String: UIView] = [menu.id: button]
        var fingerprints = [menu.id: menu]
        XCTAssertEqual(NativeUIButton.reassociate([back], controls: &controls, fingerprints: &fingerprints), [back.id])
        XCTAssertNil(controls[menu.id])
        XCTAssertNil(fingerprints[menu.id])
        XCTAssertTrue(controls[back.id] === button)
        let updated = try XCTUnwrap(NativeUIButton.make(back, existing: controls[back.id] as? UIButton,
            rendering: NativeUIControlRendering(), activate: { actions.append($0) }))
        XCTAssertTrue(updated === button)
        XCTAssertEqual(updated.accessibilityIdentifier, "back")
        XCTAssertFalse(updated.accessibilityTraits.contains(.selected))
        updated.sendActions(for: .touchUpInside)
        XCTAssertEqual(actions, ["menu", "back"])
    }

    @MainActor
    func testButtonReassociationRejectsAmbiguousOrStillLiveSources() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires native glass buttons") }
        func node(_ id: String, key: String?) throws -> NativeUIControl {
            var content = item(["id": id])
            if let key { content["transitionId"] = key }
            return try XCTUnwrap(decode([control(["id": id, "kind": "ion-button", "items": [content]])]).controls.first)
        }
        let old = try node("old", key: "slot")
        let next = try node("next", key: "slot")
        let duplicate = try node("duplicate", key: "slot")
        let legacy = try node("legacy", key: nil)
        for incoming in [[old, next], [next, duplicate], [legacy]] {
            var controls: [String: UIView] = [old.id: UIButton()]
            var fingerprints = [old.id: old]
            XCTAssertTrue(NativeUIButton.reassociate(incoming, controls: &controls, fingerprints: &fingerprints).isEmpty)
            XCTAssertNotNil(controls[old.id])
        }
    }

    @MainActor
    func testSingleButtonsRejectEmptyAndMultipleItems() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires native glass buttons") }
        for kind in ["ion-button", "ion-back-button", "ion-menu-button"] {
            for items in [[JSObject](), [item(), item(["id": "second"])]] {
                let snapshot = try decode([control(["kind": kind, "items": items])])
                XCTAssertFalse(snapshot.isValid)
                let node = try XCTUnwrap(snapshot.controls.first)
                XCTAssertNil(NativeUIButton.make(node, rendering: NativeUIControlRendering(), activate: { _ in
                    XCTFail("Invalid input must not create an action")
                }))
            }
            let snapshot = try decode([control(["kind": kind])])
            XCTAssertTrue(snapshot.isValid)
            let node = try XCTUnwrap(snapshot.controls.first)
            var activated: String?
            let button = try XCTUnwrap(NativeUIButton.make(node, rendering: NativeUIControlRendering(), activate: { activated = $0 }))
            button.sendActions(for: .touchUpInside)
            XCTAssertEqual(activated, "action")
        }
        let emptySegment = try decode([control(["kind": "ion-segment", "items": [JSObject]()])])
        XCTAssertFalse(emptySegment.isValid)
        XCTAssertNil(NativeUISegment.make(try XCTUnwrap(emptySegment.controls.first), scale: 1,
            rendering: NativeUIControlRendering(), activate: { _ in XCTFail("Empty segment") }))
    }


    @MainActor
    func testTabSelectionWithEmptySingleAndReorderedItems() throws {
        let first = item(["id": "first"])
        let selected = item(["id": "selected", "selected": true])
        let bar = UITabBar()
        for items in [[first, selected], [selected, first], [first], []] {
            let node = try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "items": items])]).controls.first)
            NativeUITabBar.update(bar, node: node, rendering: NativeUIControlRendering())
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
        NativeUITabBar.update(bar, node: node, rendering: NativeUIControlRendering())
        XCTAssertTrue(NativeUITabBar.fit(bar, node: node, bounds: CGRect(x: 20, y: 700, width: 280, height: 62)))
        XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, "first")
        // A second fit without content changes must not leave a pending warmup.
        XCTAssertTrue(NativeUITabBar.fit(bar, node: node, bounds: CGRect(x: 20, y: 700, width: 280, height: 62)))
        XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, "first")
    }

    @MainActor
    func testTabPendingSelectionIgnoresStaleDomEcho() throws {
        let first = item(["id": "first", "selected": true])
        let second = item(["id": "second"])
        let bar = UITabBar()
        let initial = try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "items": [first, second]])]).controls.first)
        NativeUITabBar.update(bar, node: initial, rendering: NativeUIControlRendering())
        XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, "first")

        var pending: NativeUITabBar.PendingSelection? = .start("second")
        // Stale Web echo still reports the previous tab.
        NativeUITabBar.update(bar, node: initial, rendering: NativeUIControlRendering(), pendingSelection: &pending)
        XCTAssertEqual(pending?.id, "second")
        XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, "second")

        let echoed = try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "items": [
            item(["id": "first"]), item(["id": "second", "selected": true]),
        ]])]).controls.first)
        NativeUITabBar.update(bar, node: echoed, rendering: NativeUIControlRendering(), pendingSelection: &pending)
        XCTAssertNil(pending)
        XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, "second")
    }

    @MainActor
    func testTabPendingSelectionFallsBackWhenDomRejects() throws {
        let first = item(["id": "first", "selected": true])
        let second = item(["id": "second"])
        let bar = UITabBar()
        let node = try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "items": [first, second]])]).controls.first)
        NativeUITabBar.update(bar, node: node, rendering: NativeUIControlRendering())
        bar.selectedItem = bar.items?.first { $0.accessibilityIdentifier == "second" }

        var pending: NativeUITabBar.PendingSelection? = NativeUITabBar.PendingSelection(id: "second", until: CFAbsoluteTimeGetCurrent() - 1)
        NativeUITabBar.update(bar, node: node, rendering: NativeUIControlRendering(), pendingSelection: &pending)
        XCTAssertNil(pending)
        XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, "first")

        pending = .start("second")
        let disabled = try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "items": [
            item(["id": "first", "selected": true]), item(["id": "second", "disabled": true]),
        ]])]).controls.first)
        bar.selectedItem = bar.items?.first { $0.accessibilityIdentifier == "second" }
        NativeUITabBar.update(bar, node: disabled, rendering: NativeUIControlRendering(), pendingSelection: &pending)
        XCTAssertNil(pending)
        XCTAssertEqual(bar.selectedItem?.accessibilityIdentifier, "first")
    }

    @MainActor
    func testSearchOptimisticTabSelectionIgnoresStaleDomEcho() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires UISearchTab") }
        let controller = NativeUISearchController()
        let rendering = NativeUIControlRendering()
        let resting = CGRect(x: 0, y: 0, width: 390, height: 844)
        let bar = CGRect(x: 18, y: 730, width: 280, height: 62)
        let trigger = CGRect(x: 320, y: 730, width: 56, height: 56)
        func node(selected: String) throws -> NativeUIControl {
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
        let controller = NativeUISearchController()
        let rendering = NativeUIControlRendering()
        let resting = CGRect(x: 0, y: 0, width: 390, height: 844)
        let shrunk = CGRect(x: 0, y: 0, width: 390, height: 500)
        func node(active: Bool, focused: Bool, value: String = "", valueVersion: Int = 0) throws -> NativeUIControl {
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
        func nodeSelecting(_ id: String) throws -> NativeUIControl {
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
        let controller = NativeUISearchController()
        let rendering = NativeUIControlRendering()
        let portrait = CGRect(x: 0, y: 0, width: 390, height: 844)
        let landscape = CGRect(x: 0, y: 0, width: 844, height: 390)
        let keyboardShrunk = CGRect(x: 0, y: 0, width: 844, height: 200)
        func node(active: Bool) throws -> NativeUIControl {
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
        let controller = NativeUISearchController()
        let rendering = NativeUIControlRendering()
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
        let controller = NativeUISearchController()
        let rendering = NativeUIControlRendering()
        let resting = CGRect(x: 0, y: 0, width: 390, height: 844)
        let bar = CGRect(x: 18, y: 730, width: 280, height: 62)
        let trigger = CGRect(x: 320, y: 730, width: 56, height: 56)
        func node(active: Bool) throws -> NativeUIControl {
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

    func testVerticalSearchBridgesInputFocusAndDismissalWithoutStaleWebEchoes() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Requires native glass search") }
        func node(active: Bool, value: String = "", version: Int = 0) throws -> NativeUIControl {
            let search: JSObject = ["id": "search", "field": item(),
                "trigger": item(["id": "trigger"]), "closeId": "close", "active": active,
                "available": true, "focused": false, "value": value, "placeholder": "Search",
                "disabled": false, "editSequence": 0, "valueVersion": version]
            return try XCTUnwrap(decode([control(["kind": "ion-tab-bar", "placement": "vertical-bars",
                "search": search, "items": [item(["id": "first", "selected": true]), item(["id": "second"])]])]).controls.first)
        }
        var actions: [String] = []
        var values: [String] = []
        let rail = UIView()
        let model = NativeUIVerticalSearchModel(try XCTUnwrap(node(active: false).search), in: rail,
            activate: { actions.append($0) },
            changed: { _, _, value, _, _ in values.append(value); return values.count })
        model.present(true)
        XCTAssertEqual(actions, ["trigger"])
        model.apply(try XCTUnwrap(node(active: true).search))
        XCTAssertTrue(model.presented)
        model.input("native query")
        XCTAssertEqual(values, ["native query"])
        model.apply(try XCTUnwrap(node(active: true).search))
        XCTAssertEqual(model.text, "native query")
        // The first presentation acknowledgement must not undo native focus.
        model.focus(true)
        model.apply(try XCTUnwrap(node(active: true).search))
        XCTAssertTrue(model.focused)
        model.apply(try XCTUnwrap(node(active: true, value: "application", version: 1).search))
        XCTAssertEqual(model.text, "application")
        model.present(false)
        XCTAssertEqual(actions, ["trigger", "close"])
        model.apply(try XCTUnwrap(node(active: false).search))
        XCTAssertFalse(model.presented)
        XCTAssertFalse(model.focused)
    }

}
