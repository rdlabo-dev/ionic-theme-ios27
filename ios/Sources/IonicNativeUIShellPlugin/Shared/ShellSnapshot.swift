import Foundation
import CoreGraphics

enum ShellComponent: String, Decodable {
    case button = "ion-button", buttons = "ion-buttons"
    case backButton = "ion-back-button", menuButton = "ion-menu-button"
    case tabBar = "ion-tab-bar", segment = "ion-segment", fab = "ion-fab"
}

struct ShellSnapshot: Decodable {
    let revision: Int
    let transitionDuration: Double?
    let viewportWidth: Double
    let verticalBarEdge: String?
    let controls: [ShellControl]

    var isValid: Bool {
        revision >= 0 && (transitionDuration.map { $0.isFinite && $0 >= 0 && $0 <= 500 } ?? true) && viewportWidth.isFinite && viewportWidth > 0 && controls.count <= 100 &&
        (verticalBarEdge == nil || verticalBarEdge == "left" || verticalBarEdge == "right") &&
        Set(controls.map(\.id)).count == controls.count && controls.allSatisfy(\.isValid)
    }
}

// Frames and content decode from the same flat wire object. Keeping them separate
// lets FABs compare artwork without treating movement or visibility as new content.
struct ShellFrame: Decodable, Equatable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    var rect: CGRect { CGRect(x: x, y: y, width: width, height: height) }
    var isValid: Bool { [x, y, width, height].allSatisfy(\.isFinite) && width > 0 && height > 0 }
}

struct ShellControl: Decodable, Equatable {
    enum Placement: String, Decodable { case verticalBars = "vertical-bars" }
    enum ToolbarSlot: String, Decodable { case start, end }
    let id: String
    let kind: ShellComponent
    let placement: Placement?
    let toolbarSlot: ToolbarSlot?
    let frame: ShellFrame
    let items: [ShellItem]
    let dark: Bool
    let rtl: Bool
    let tabBarAnchor: ShellTabBar.Anchor?
    let search: ShellSearch?

    private enum CodingKeys: String, CodingKey { case id, kind, placement, toolbarSlot, items, dark, rtl, tabBarAnchor, search }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        kind = try values.decode(ShellComponent.self, forKey: .kind)
        placement = try values.decodeIfPresent(Placement.self, forKey: .placement)
        toolbarSlot = try values.decodeIfPresent(ToolbarSlot.self, forKey: .toolbarSlot)
        frame = try ShellFrame(from: decoder)
        items = try values.decode([ShellItem].self, forKey: .items)
        dark = try values.decode(Bool.self, forKey: .dark)
        rtl = try values.decode(Bool.self, forKey: .rtl)
        tabBarAnchor = try values.decodeIfPresent(ShellTabBar.Anchor.self, forKey: .tabBarAnchor)
        search = try values.decodeIfPresent(ShellSearch.self, forKey: .search)
    }

    var isValid: Bool {
        ShellComponents.supported.contains(kind) && !id.isEmpty && frame.isValid && !items.isEmpty && items.count <= 30 &&
        (!ShellButton.kinds.contains(kind) || items.count == 1) &&
        (toolbarSlot == nil || (placement == .verticalBars && [.button, .buttons, .menuButton].contains(kind))) &&
        Set(items.map(\.id)).count == items.count && items.allSatisfy(\.isValid) &&
        (tabBarAnchor.map { kind == .tabBar && $0.isValid } ?? true) &&
        (search.map { kind == .tabBar && $0.isValid } ?? true)
    }
}

struct ShellItem: Decodable, Equatable {
    let frame: ShellFrame
    let content: ShellItemContent
    let visible: Bool?
    var id: String { content.id }

    private enum CodingKeys: String, CodingKey { case visible }

    init(from decoder: Decoder) throws {
        frame = try ShellFrame(from: decoder)
        content = try ShellItemContent(from: decoder)
        visible = try decoder.container(keyedBy: CodingKeys.self).decodeIfPresent(Bool.self, forKey: .visible)
    }

    var isValid: Bool { frame.isValid && content.isValid }
}

struct ShellBadge: Decodable, Equatable {
    let value: String
    let color: String
    let textColor: String
}

struct ShellItemContent: Decodable, Equatable {
    enum IconPosition: String, Decodable { case leading, trailing, top }
    let id: String
    var label: String
    let accessibilityLabel: String
    let disabled: Bool
    let selected: Bool
    let fontSize: Double
    let fontWeight: Double
    let color: String
    let badge: ShellBadge?
    var icon: String?
    var iconWidth: Double?
    var iconHeight: Double?
    let iconPosition: IconPosition?
    let imagePadding: Double?
    let contentInsetLeading: Double?
    let contentInsetTrailing: Double?
    let iconTemplate: Bool?
    let closeIcon: String?
    let closeIconWidth: Double?
    let closeIconHeight: Double?
    let iconTransition: Double?

    var isValid: Bool {
        !id.isEmpty && fontSize.isFinite && fontSize >= 0 && fontWeight.isFinite &&
        [iconWidth, iconHeight, closeIconWidth, closeIconHeight].compactMap { $0 }.allSatisfy { $0.isFinite && $0 > 0 } &&
        [imagePadding, contentInsetLeading, contentInsetTrailing].compactMap { $0 }.allSatisfy { $0.isFinite } &&
        (iconTransition.map { $0.isFinite && $0 >= 0 } ?? true)
    }
}
