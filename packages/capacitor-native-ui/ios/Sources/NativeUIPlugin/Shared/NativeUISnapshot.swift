import Foundation
import CoreGraphics

// Standard renderer names are independent of DOM tags and Web frameworks.
enum NativeUIComponent: String, Decodable {
    case `extension`
    case button, buttons = "button-group"
    case backButton = "back-button", menuButton = "menu-button"
    case tabBar = "tab-bar", segment, fab = "floating-action-button"

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self)
        // Accept previous clients during native/Web bundle upgrades.
        let legacy: [String: NativeUIComponent] = [
            "ion-button": .button, "ion-buttons": .buttons,
            "ion-back-button": .backButton, "ion-menu-button": .menuButton,
            "ion-tab-bar": .tabBar, "ion-segment": .segment, "ion-fab": .fab
        ]
        guard let kind = NativeUIComponent(rawValue: value) ?? legacy[value] else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unknown native control kind")
        }
        self = kind
    }
}

struct NativeUIToolbarTransitionSnapshot: Decodable {
    let id: Int
    let sourceIds: [String]
    let destination: [NativeUIControl]
    var isValid: Bool {
        id > 0 && sourceIds.count <= 100 && Set(sourceIds).count == sourceIds.count && destination.count <= 100 &&
        Set(destination.map(\.id)).count == destination.count && destination.allSatisfy {
            $0.isValid && $0.placement == nil && (NativeUIButton.kinds + [.buttons]).contains($0.kind)
        }
    }
}

struct NativeUIModalAnimation: Decodable {
    let id: Int
    let startedAt: Double
    let duration: Double
    let fromY: Double
    let opacity: Double
    let easing: [Double]
    var isValid: Bool {
        id > 0 && [startedAt, duration, fromY, opacity].allSatisfy(\.isFinite) &&
        duration > 0 && duration <= 60_000 && opacity >= 0 && opacity <= 1 &&
        easing.count == 4 && easing.allSatisfy(\.isFinite) &&
        (0...1).contains(easing[0]) && (0...1).contains(easing[2])
    }
}

struct NativeUISnapshot: Decodable {
    let revision: Int
    let transitionDuration: Double?
    let toolbarTransition: NativeUIToolbarTransitionSnapshot?
    let viewportWidth: Double
    let verticalBarFrame: NativeUIFrame?
    let modalAnimation: NativeUIModalAnimation?
    let verticalBarEdge: String?
    let verticalBarNavigation: [String]?
    let verticalBarNavigationPhase: String?
    let controls: [NativeUIControl]

    var isValid: Bool {
        (toolbarTransition.map { $0.isValid && Set($0.sourceIds).isSubset(of: Set(controls.map(\.id))) } ?? true) &&
        revision >= 0 && (transitionDuration.map { $0.isFinite && $0 >= 0 && $0 <= 500 } ?? true) && viewportWidth.isFinite && viewportWidth > 0 && controls.count <= 100 &&
        (verticalBarNavigationPhase == nil || verticalBarNavigationPhase == "tracking" || verticalBarNavigationPhase == "settling") &&
        (verticalBarNavigation.map { Set($0).count == $0.count && $0.allSatisfy { !$0.isEmpty } } ?? true) &&
        (verticalBarFrame.map { $0.isValid } ?? true) &&
        (modalAnimation.map { $0.isValid && verticalBarFrame != nil } ?? true) &&
        (verticalBarEdge == nil || verticalBarEdge == "left" || verticalBarEdge == "right") &&
        Set(controls.map(\.id)).count == controls.count && controls.allSatisfy(\.isValid)
    }
}

// Frames and content decode from the same flat wire object. Keeping them separate
// lets FABs compare artwork without treating movement or visibility as new content.
struct NativeUIFrame: Decodable, Equatable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    var rect: CGRect { CGRect(x: x, y: y, width: width, height: height) }
    var isValid: Bool { [x, y, width, height].allSatisfy(\.isFinite) && width > 0 && height > 0 }
}

struct NativeUIControl: Decodable, Equatable {
    enum Placement: String, Decodable { case verticalBars = "vertical-bars" }
    enum ToolbarSlot: String, Decodable { case start, end }
    let id: String
    let kind: NativeUIComponent
    let placement: Placement?
    let toolbarSlot: ToolbarSlot?
    let transitionId: String?
    let frame: NativeUIFrame
    let items: [NativeUIItem]
    let dark: Bool
    let rtl: Bool
    let tabTint: String?
    let tabBarAnchor: NativeUITabBar.Anchor?
    let search: NativeUISearch?
    let extensionContent: NativeUIExtensionContent?

    private enum CodingKeys: String, CodingKey {
        case id, kind, placement, toolbarSlot, transitionId, items, dark, rtl, tabBarAnchor, tabTint, search
        case extensionContent = "extension"
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        kind = try values.decode(NativeUIComponent.self, forKey: .kind)
        placement = try values.decodeIfPresent(Placement.self, forKey: .placement)
        toolbarSlot = try values.decodeIfPresent(ToolbarSlot.self, forKey: .toolbarSlot)
        transitionId = try values.decodeIfPresent(String.self, forKey: .transitionId)
        frame = try NativeUIFrame(from: decoder)
        items = try values.decode([NativeUIItem].self, forKey: .items)
        dark = try values.decode(Bool.self, forKey: .dark)
        rtl = try values.decode(Bool.self, forKey: .rtl)
        tabTint = try values.decodeIfPresent(String.self, forKey: .tabTint)
        tabBarAnchor = try values.decodeIfPresent(NativeUITabBar.Anchor.self, forKey: .tabBarAnchor)
        search = try values.decodeIfPresent(NativeUISearch.self, forKey: .search)
        extensionContent = try values.decodeIfPresent(NativeUIExtensionContent.self, forKey: .extensionContent)
    }

    var isValid: Bool {
        if kind == .extension {
            return !id.isEmpty && frame.isValid && items.isEmpty && placement == nil && toolbarSlot == nil &&
                search == nil && tabBarAnchor == nil && extensionContent?.isValid == true
        }
        return extensionContent == nil && NativeUIComponents.supported.contains(kind) && !id.isEmpty && frame.isValid && !items.isEmpty && items.count <= 30 &&
        (!NativeUIButton.kinds.contains(kind) || items.count == 1) &&
        (toolbarSlot == nil || (placement == .verticalBars && [.button, .buttons, .menuButton].contains(kind))) &&
        Set(items.map(\.id)).count == items.count && items.allSatisfy(\.isValid) &&
        (tabBarAnchor.map { kind == .tabBar && $0.isValid } ?? true) &&
        (search.map { kind == .tabBar && $0.isValid } ?? true)
    }
}

struct NativeUIItem: Decodable, Equatable {
    let frame: NativeUIFrame
    let content: NativeUIItemContent
    let visible: Bool?
    var id: String { content.id }

    private enum CodingKeys: String, CodingKey { case visible }

    init(from decoder: Decoder) throws {
        frame = try NativeUIFrame(from: decoder)
        content = try NativeUIItemContent(from: decoder)
        visible = try decoder.container(keyedBy: CodingKeys.self).decodeIfPresent(Bool.self, forKey: .visible)
    }

    var isValid: Bool { frame.isValid && content.isValid }
}

struct NativeUIBadge: Decodable, Equatable {
    let value: String
    let color: String
    let textColor: String
}

struct NativeUIItemContent: Decodable, Equatable {
    enum IconPosition: String, Decodable { case leading, trailing, top }
    enum ButtonFill: String, Decodable { case clear, solid, outline }
    let id: String
    let transitionId: String?
    var label: String
    let accessibilityLabel: String
    let disabled: Bool
    let selected: Bool
    let fontSize: Double
    let fontWeight: Double
    let color: String
    let buttonFill: ButtonFill?
    let backgroundColor: String?
    let borderColor: String?
    let borderWidth: CGFloat?
    let badge: NativeUIBadge?
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
