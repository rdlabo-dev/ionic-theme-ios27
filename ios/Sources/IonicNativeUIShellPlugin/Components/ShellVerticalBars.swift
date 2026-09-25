import Combine
import SwiftUI
import UIKit

protocol ShellVerticalBarsControlling: AnyObject {
    var view: UIView { get }
    func attach(to owner: UIViewController, in parent: UIView)
    func apply(_ controls: [ShellControl], rendering: ShellRendering, edge: String)
    func detach()
}

@available(iOS 26.0, *)
final class ShellVerticalBarsModel: ObservableObject {
    struct Item: Identifiable {
        let id: String
        let label: String
        let accessibilityLabel: String
        let image: UIImage?
        let badge: ShellBadge?
        let disabled: Bool
        var selected: Bool
    }

    struct Group: Identifiable {
        let id: String
        let items: [Item]
        let slot: ShellControl.ToolbarSlot?
    }

    @Published var back: Item?
    @Published var groups: [Group] = []
    @Published var tabs: [Item] = []
    @Published var selection = ""
    var activate: (String) -> Void = { _ in }
    private var domSelection = ""
    private var pendingSelection: ShellTabBar.PendingSelection?
    private var pendingExpiryWork: DispatchWorkItem?

    func apply(_ controls: [ShellControl], rendering: ShellRendering,
               now: CFAbsoluteTime = CFAbsoluteTimeGetCurrent()) {
        func item(_ source: ShellItem) -> Item {
            Item(id: source.id, label: source.content.label,
                 accessibilityLabel: source.content.accessibilityLabel,
                 image: rendering.image(source.content), badge: source.content.badge, disabled: source.content.disabled,
                 selected: source.content.selected)
        }
        withAnimation(.smooth(duration: 0.3)) {
            back = controls.first(where: { $0.kind == .backButton })?.items.first.map(item)
            groups = controls.compactMap { control in
                guard [.button, .buttons, .menuButton].contains(control.kind) else { return nil }
                return Group(id: control.id, items: control.items.map(item), slot: control.toolbarSlot)
            }
        }
        tabs = controls.first(where: { $0.kind == .tabBar })?.items.map(item) ?? []
        domSelection = tabs.first(where: \.selected)?.id ?? ""
        reconcileSelection(now: now)
    }

    func select(_ id: String, now: CFAbsoluteTime = CFAbsoluteTimeGetCurrent(), ttl: CFTimeInterval = 1) {
        guard let item = tabs.first(where: { $0.id == id }), !item.disabled else { return }
        pendingSelection = .init(id: id, until: now + ttl)
        selection = id
        pendingExpiryWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.reconcileSelection() }
        pendingExpiryWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + ttl + 0.02, execute: work)
        activate(id)
    }

    private func reconcileSelection(now: CFAbsoluteTime = CFAbsoluteTimeGetCurrent()) {
        guard let pending = pendingSelection else { selection = domSelection; return }
        let item = tabs.first(where: { $0.id == pending.id })
        if item == nil || item!.disabled || now >= pending.until || domSelection == pending.id {
            pendingSelection = nil
            pendingExpiryWork?.cancel()
            pendingExpiryWork = nil
            selection = domSelection
        } else {
            selection = pending.id
        }
    }
}

@available(iOS 26.0, *)
private struct ShellVerticalBarsLabel: View {
    let item: ShellVerticalBarsModel.Item

    var body: some View {
        if let image = item.image {
            Label {
                Text(item.label.isEmpty ? item.accessibilityLabel : item.label)
            } icon: {
                Image(uiImage: image)
            }
        } else {
            Text(item.label)
        }
    }
}

@available(iOS 26.0, *)
private func verticalBarsButton(_ item: ShellVerticalBarsModel.Item, model: ShellVerticalBarsModel) -> some View {
    Button { model.activate(item.id) } label: { ShellVerticalBarsLabel(item: item) }
        .disabled(item.disabled)
        .accessibilityLabel(item.accessibilityLabel)
        .accessibilityIdentifier(item.id)
}

@available(iOS 26.0, *)
private func verticalBarsBackButton(_ item: ShellVerticalBarsModel.Item, model: ShellVerticalBarsModel) -> some View {
    Button { model.activate(item.id) } label: { Image(systemName: "chevron.backward") }
        .disabled(item.disabled)
        .accessibilityLabel(item.accessibilityLabel)
        .accessibilityIdentifier("BackButton")
}

@available(iOS 26.0, *)
private struct ShellVerticalBarsBadge: ViewModifier {
    let badge: ShellBadge?

    @ViewBuilder func body(content: Content) -> some View {
        if let badge { content.badge(badge.value) }
        else { content }
    }
}

@available(iOS 26.0, *)
private struct ShellVerticalBarsView: View {
    @ObservedObject var model: ShellVerticalBarsModel

    var body: some View {
        Group {
            if model.tabs.isEmpty {
                ShellVerticalBarsPage(model: model)
            } else {
                TabView(selection: Binding(get: { model.selection }, set: { model.select($0) })) {
                    ForEach(model.tabs) { item in
                        ShellVerticalBarsPage(model: model)
                        .tag(item.id)
                        .tabItem { ShellVerticalBarsLabel(item: item) }
                        .modifier(ShellVerticalBarsBadge(badge: item.badge))
                        .disabled(item.disabled)
                        .accessibilityLabel(item.accessibilityLabel)
                        .accessibilityIdentifier(item.id)
                    }
                }
            }
        }
        .modifier(ShellVerticalBarsCompression())
        .background(Color.clear)
    }
}

@available(iOS 26.0, *)
private struct ShellVerticalBarsPage: View {
    @ObservedObject var model: ShellVerticalBarsModel

    var body: some View {
        NavigationStack {
            Color.clear.modifier(ShellVerticalBarsToolbarAdapter(model: model))
        }
    }
}

@available(iOS 26.0, *)
private struct ShellVerticalBarsCompression: ViewModifier {
    @ViewBuilder func body(content: Content) -> some View {
        #if canImport(UIKit, _underlyingVersion: 9127.0.85) && !targetEnvironment(macCatalyst)
        if #available(iOS 27.1, *) {
            content.toolbarVerticalCompressionBehavior(.prefersToolbarItems)
        } else {
            content
        }
        #else
        content
        #endif
    }
}

@available(iOS 26.0, *)
private struct ShellVerticalBarsToolbarAdapter: ViewModifier {
    @ObservedObject var model: ShellVerticalBarsModel

    @ViewBuilder func body(content: Content) -> some View {
        #if canImport(UIKit, _underlyingVersion: 9127.0.85) && !targetEnvironment(macCatalyst)
        if #available(iOS 27.1, *) {
            content.modifier(ShellVerticalBarsToolbar(model: model))
        } else {
            content.modifier(ShellVerticalBarsLegacyToolbar(model: model))
        }
        #else
        content.modifier(ShellVerticalBarsLegacyToolbar(model: model))
        #endif
    }
}

#if canImport(UIKit, _underlyingVersion: 9127.0.85) && !targetEnvironment(macCatalyst)
@available(iOS 27.1, *)
private struct ShellVerticalBarsToolbar: ViewModifier {
    @ObservedObject var model: ShellVerticalBarsModel

    func body(content: Content) -> some View {
        content.toolbar {
            if let back = model.back {
                ToolbarItem(placement: .navigation) {
                    verticalBarsBackButton(back, model: model)
                }
                .axisBehavior(.verticalPreferred)
            }
            ForEach(model.groups.filter { $0.slot == .start }) { group in
                ToolbarItemGroup(placement: .topBarLeading) {
                    ForEach(group.items) { item in
                        verticalBarsButton(item, model: model)
                    }
                }
                .axisBehavior(.verticalPreferred)
            }
            ForEach(model.groups.filter { $0.slot != .start }) { group in
                ToolbarItemGroup(placement: .topBarTrailing) {
                    ForEach(group.items) { item in
                        verticalBarsButton(item, model: model)
                    }
                }
                .axisBehavior(.verticalPreferred)
            }
        }
    }
}
#endif

@available(iOS 26.0, *)
private struct ShellVerticalBarsLegacyToolbar: ViewModifier {
    @ObservedObject var model: ShellVerticalBarsModel

    func body(content: Content) -> some View {
        content.toolbar {
            if let back = model.back {
                ToolbarItem(placement: .navigation) {
                    verticalBarsBackButton(back, model: model)
                }
            }
            ForEach(model.groups) { group in
                ToolbarItemGroup(placement: .primaryAction) {
                    ForEach(group.items) { item in
                        verticalBarsButton(item, model: model)
                    }
                }
            }
        }
    }
}

@available(iOS 26.0, *)
final class ShellVerticalBarsController: ShellVerticalBarsControlling {
    private final class TransparentHostingController<Content: View>: UIHostingController<Content> {
        var railEdge = "right"
        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            makeFullSizeSurfacesTransparent(in: view)
        }

        private func makeFullSizeSurfacesTransparent(in surface: UIView) {
            let frame = surface.convert(surface.bounds, to: view)
            guard !(surface is UIVisualEffectView) else { return }
            let coversHost = frame.insetBy(dx: -1, dy: -1).contains(view.bounds)
            // SwiftUI may add an opaque backing behind the rail controls, sized to
            // the rail or to an expanded tab bar. Keep that backing clear without
            // touching the glass controls or materials.
            let coversRail = frame.minY <= 1 && frame.maxY >= view.bounds.maxY - 1 &&
                (railEdge == "left" ? frame.minX <= 1 : frame.maxX >= view.bounds.maxX - 1)
            if coversHost || coversRail {
                surface.backgroundColor = .clear
                surface.isOpaque = false
            }
            surface.subviews.forEach(makeFullSizeSurfacesTransparent)
        }
    }

    private final class RailContainer: UIView {
        var railEdge = "right"

        private var railWidth: CGFloat {
            let inset = railEdge == "left" ? safeAreaInsets.left : safeAreaInsets.right
            return inset > 0 ? inset : 80
        }

        // The rail is not masked: expanded rail content (a widened tab bar) is
        // allowed to draw over the WebView. Inside the base rail touches behave
        // as before; beyond it touches are captured only where they land inside
        // an actual bar surface so empty overlap still belongs to the WebView.
        // The SwiftUI hosting scaffold reports a full-size hosting view for
        // every point, so the hit result cannot tell bar content from empty
        // space — the bar frames decide instead.
        override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
            let hit = super.hitTest(point, with: event)
            let inRail = railEdge == "left" ? point.x <= railWidth : point.x >= bounds.maxX - railWidth
            if inRail { return hit }
            guard hit != nil, containsBarSurface(at: point) else { return nil }
            return hit
        }

        private func containsBarSurface(at point: CGPoint) -> Bool {
            containsBarSurface(in: self, at: point)
        }

        private func containsBarSurface(in view: UIView, at point: CGPoint) -> Bool {
            guard !view.isHidden, view.alpha > 0.05 else { return false }
            let name = NSStringFromClass(type(of: view))
            if (name.contains("TabBar") || name.contains("Platter") || name.contains("Pocket") || name.contains("Sidebar")),
               convert(view.bounds, from: view).contains(point) { return true }
            return view.subviews.contains { containsBarSurface(in: $0, at: point) }
        }
    }

    private let model = ShellVerticalBarsModel()
    private lazy var controller = TransparentHostingController(rootView: ShellVerticalBarsView(model: model))
    private let container = RailContainer()
    private weak var owner: UIViewController?

    var view: UIView { container }

    init(activate: @escaping (String) -> Void) {
        model.activate = activate
        container.backgroundColor = .clear
        controller.view.backgroundColor = .clear
        controller.view.isOpaque = false
    }

    func attach(to owner: UIViewController, in parent: UIView) {
        guard self.owner !== owner || container.superview !== parent else { return }
        detach()
        self.owner = owner
        owner.addChild(controller)
        container.frame = parent.bounds
        container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        controller.view.frame = container.bounds
        controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.addSubview(controller.view)
        parent.addSubview(container)
        controller.didMove(toParent: owner)
    }

    func apply(_ controls: [ShellControl], rendering: ShellRendering, edge: String) {
        container.railEdge = edge
        controller.railEdge = edge
        model.apply(controls, rendering: rendering)
        controller.overrideUserInterfaceStyle = controls.contains(where: \.dark) ? .dark : .light
    }

    func detach() {
        guard controller.parent != nil else { return }
        controller.willMove(toParent: nil)
        container.removeFromSuperview()
        controller.view.removeFromSuperview()
        controller.removeFromParent()
        owner = nil
    }
}
