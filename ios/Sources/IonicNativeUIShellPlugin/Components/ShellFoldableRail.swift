import Combine
import SwiftUI
import UIKit

protocol ShellFoldableRailControlling: AnyObject {
    var view: UIView { get }
    func attach(to owner: UIViewController, in parent: UIView)
    func apply(_ controls: [ShellControl], rendering: ShellRendering)
    func detach()
}

@available(iOS 26.0, *)
final class ShellFoldableRailModel: ObservableObject {
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
        back = controls.first(where: { $0.kind == .backButton })?.items.first.map(item)
        groups = controls.compactMap { control in
            guard [.button, .buttons, .menuButton].contains(control.kind) else { return nil }
            return Group(id: control.id, items: control.items.map(item), slot: control.toolbarSlot)
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
private struct ShellFoldableLabel: View {
    let item: ShellFoldableRailModel.Item

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
private func foldableButton(_ item: ShellFoldableRailModel.Item, model: ShellFoldableRailModel) -> some View {
    Button { model.activate(item.id) } label: { ShellFoldableLabel(item: item) }
        .disabled(item.disabled)
        .accessibilityLabel(item.accessibilityLabel)
        .accessibilityIdentifier(item.id)
}

@available(iOS 26.0, *)
private struct ShellFoldableBadge: ViewModifier {
    let badge: ShellBadge?

    @ViewBuilder func body(content: Content) -> some View {
        if let badge { content.badge(badge.value) }
        else { content }
    }
}

@available(iOS 26.0, *)
private struct ShellFoldableRailView: View {
    @ObservedObject var model: ShellFoldableRailModel

    var body: some View {
        Group {
            if model.tabs.isEmpty {
                ShellFoldableNavigation(model: model)
            } else {
                TabView(selection: Binding(get: { model.selection }, set: { model.select($0) })) {
                    ForEach(model.tabs) { item in
                        ShellFoldableNavigation(model: model)
                        .tag(item.id)
                        .tabItem { ShellFoldableLabel(item: item) }
                        .modifier(ShellFoldableBadge(badge: item.badge))
                        .disabled(item.disabled)
                        .accessibilityLabel(item.accessibilityLabel)
                        .accessibilityIdentifier(item.id)
                    }
                }
            }
        }
        .modifier(ShellFoldableCompression())
        .background(Color.clear)
    }
}

@available(iOS 26.0, *)
private struct ShellFoldableNavigation: View {
    @ObservedObject var model: ShellFoldableRailModel

    var body: some View {
        NavigationStack(path: Binding(get: { model.back.map { [$0.id] } ?? [] }, set: { next in
            if next.isEmpty, let back = model.back {
                model.activate(back.id)
            }
        })) {
            Color.clear
                .navigationDestination(for: String.self) { _ in
                    Color.clear.modifier(ShellFoldableToolbarAdapter(model: model))
                }
                .modifier(ShellFoldableToolbarAdapter(model: model))
        }
    }
}

@available(iOS 26.0, *)
private struct ShellFoldableCompression: ViewModifier {
    @ViewBuilder func body(content: Content) -> some View {
        if #available(iOS 27.1, *) {
            content.toolbarVerticalCompressionBehavior(.prefersToolbarItems)
        } else {
            content
        }
    }
}

@available(iOS 26.0, *)
private struct ShellFoldableToolbarAdapter: ViewModifier {
    @ObservedObject var model: ShellFoldableRailModel

    @ViewBuilder func body(content: Content) -> some View {
        if #available(iOS 27.1, *) {
            content.modifier(ShellFoldableToolbar(model: model))
        } else {
            content.modifier(ShellFoldableLegacyToolbar(model: model))
        }
    }
}

@available(iOS 27.1, *)
private struct ShellFoldableToolbar: ViewModifier {
    @ObservedObject var model: ShellFoldableRailModel

    func body(content: Content) -> some View {
        content.toolbar {
            ForEach(model.groups.filter { $0.slot == .start }) { group in
                ToolbarItemGroup(placement: .topBarLeading) {
                    ForEach(group.items) { item in
                        foldableButton(item, model: model)
                    }
                }
                .axisBehavior(.verticalPreferred)
            }
            ForEach(model.groups.filter { $0.slot != .start }) { group in
                ToolbarItemGroup(placement: .topBarTrailing) {
                    ForEach(group.items) { item in
                        foldableButton(item, model: model)
                    }
                }
                .axisBehavior(.verticalPreferred)
            }
        }
    }
}

@available(iOS 26.0, *)
private struct ShellFoldableLegacyToolbar: ViewModifier {
    @ObservedObject var model: ShellFoldableRailModel

    func body(content: Content) -> some View {
        content.toolbar {
            ForEach(model.groups) { group in
                ToolbarItemGroup(placement: .primaryAction) {
                    ForEach(group.items) { item in
                        foldableButton(item, model: model)
                    }
                }
            }
        }
    }
}

@available(iOS 26.0, *)
final class ShellFoldableRailController: ShellFoldableRailControlling {
    private final class TransparentHostingController<Content: View>: UIHostingController<Content> {
        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            makeFullSizeSurfacesTransparent(in: view)
        }

        private func makeFullSizeSurfacesTransparent(in surface: UIView) {
            guard !(surface is UIVisualEffectView) else { return }
            let frame = surface.convert(surface.bounds, to: view)
            let background = surface.backgroundColor?.resolvedColor(with: surface.traitCollection)
            let systemBackground = UIColor.systemBackground.resolvedColor(with: surface.traitCollection)
            // SwiftUI's hosting containers add opaque system backgrounds behind their bars. Remove only those
            // host-sized base surfaces; preserve smaller controls, materials, and application-defined backgrounds.
            if frame.insetBy(dx: -1, dy: -1).contains(view.bounds), background == systemBackground {
                surface.backgroundColor = .clear
                surface.isOpaque = false
            }
            surface.subviews.forEach(makeFullSizeSurfacesTransparent)
        }
    }

    private final class RailContainer: UIView {
        private let railMask = CAShapeLayer()

        private var railWidth: CGFloat { safeAreaInsets.right > 0 ? safeAreaInsets.right : 80 }

        override init(frame: CGRect) {
            super.init(frame: frame)
            layer.mask = railMask
        }

        required init?(coder: NSCoder) { nil }

        override func layoutSubviews() {
            super.layoutSubviews()
            railMask.path = UIBezierPath(rect: CGRect(x: bounds.maxX - railWidth, y: 0,
                                                       width: railWidth, height: bounds.height)).cgPath
        }

        override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
            point.x >= bounds.maxX - railWidth && super.point(inside: point, with: event)
        }
    }

    private let model = ShellFoldableRailModel()
    private lazy var controller = TransparentHostingController(rootView: ShellFoldableRailView(model: model))
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

    func apply(_ controls: [ShellControl], rendering: ShellRendering) {
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
