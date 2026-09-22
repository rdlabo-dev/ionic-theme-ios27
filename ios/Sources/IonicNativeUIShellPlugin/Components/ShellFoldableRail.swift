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
            return Group(id: control.id, items: control.items.map(item))
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
                Text(item.label)
            } icon: {
                Image(uiImage: image)
            }
        } else {
            Text(item.label)
        }
    }
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
                NavigationStack {
                    Color.clear
                        .allowsHitTesting(false)
                        .modifier(ShellFoldableToolbarAdapter(model: model))
                }
            } else {
                TabView(selection: Binding(get: { model.selection }, set: { model.select($0) })) {
                    ForEach(model.tabs) { item in
                        NavigationStack {
                            Color.clear
                                .allowsHitTesting(false)
                                .modifier(ShellFoldableToolbarAdapter(model: model))
                        }
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
            if let back = model.back {
                ToolbarItem(placement: .cancellationAction) {
                    Button { model.activate(back.id) } label: { ShellFoldableLabel(item: back) }
                        .disabled(back.disabled)
                        .accessibilityLabel(back.accessibilityLabel)
                        .accessibilityIdentifier(back.id)
                }
                .axisBehavior(.verticalPreferred)
            }
            ForEach(model.groups) { group in
                ToolbarItemGroup(placement: .automatic) {
                    ForEach(group.items) { item in
                        Button { model.activate(item.id) } label: { ShellFoldableLabel(item: item) }
                            .disabled(item.disabled)
                            .accessibilityLabel(item.accessibilityLabel)
                        .accessibilityIdentifier(item.id)
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
            if let back = model.back {
                ToolbarItem(placement: .navigation) {
                    Button { model.activate(back.id) } label: { ShellFoldableLabel(item: back) }
                        .disabled(back.disabled)
                        .accessibilityLabel(back.accessibilityLabel)
                        .accessibilityIdentifier(back.id)
                }
            }
            ForEach(model.groups) { group in
                ToolbarItemGroup(placement: .primaryAction) {
                    ForEach(group.items) { item in
                        Button { model.activate(item.id) } label: { ShellFoldableLabel(item: item) }
                            .disabled(item.disabled)
                            .accessibilityLabel(item.accessibilityLabel)
                            .accessibilityIdentifier(item.id)
                    }
                }
            }
        }
    }
}

@available(iOS 26.0, *)
final class ShellFoldableRailController: ShellFoldableRailControlling {
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

        override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
            guard point.x >= bounds.maxX - railWidth else { return nil }
            return super.hitTest(point, with: event)
        }
    }

    private let model = ShellFoldableRailModel()
    private lazy var controller = UIHostingController(rootView: ShellFoldableRailView(model: model))
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
