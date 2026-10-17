import Combine
import SwiftUI
import UIKit

protocol ShellVerticalBarsControlling: AnyObject {
    var view: UIView { get }
    func measuredFrames(relativeTo webView: UIView) -> [String: CGRect]
    @MainActor func attach(to owner: UIViewController, in parent: UIView)
    @MainActor func apply(_ controls: [ShellControl], rendering: ShellRendering, edge: String, animated: Bool)
    @MainActor func setAccessory(_ content: AnyView?)
    var ownsKeyboardChrome: Bool { get }
    func presentPopover(anchor: String, host: ShellOverlayHost, completion: @escaping (Bool) -> Void) -> Bool
    @MainActor func detach(duration: TimeInterval)
}

@available(iOS 26.0, *)
final class ShellVerticalBarsModel: ObservableObject {
    struct Item: Identifiable {
        let id: String
        let label: String
        let accessibilityLabel: String
        let image: UIImage?
        let clear: Bool
        let background: Color?
        let borderColor: Color?
        let borderWidth: CGFloat
        let badge: ShellBadge?
        let disabled: Bool
        var selected: Bool
    }

    struct Group: Identifiable {
        let id: String
        let items: [Item]
        let slot: ShellControl.ToolbarSlot?
    }

    @Published var accessory: AnyView?
    @Published var popoverAnchor: String?
    var popoverHost: ShellOverlayHost?
    var popoverPresented: ((Bool) -> Void)?
    @Published var search: ShellVerticalSearchModel?
    @Published var back: Item?
    @Published var groups: [Group] = []
    @Published var tabs: [Item] = []
    @Published var selection = ""
    var activate: (String) -> Void = { _ in }
    private var domSelection = ""
    private var pendingSelection: ShellTabBar.PendingSelection?
    private var pendingExpiryWork: DispatchWorkItem?

    func apply(_ controls: [ShellControl], rendering: ShellRendering, animated: Bool = true,
               now: CFAbsoluteTime = CFAbsoluteTimeGetCurrent()) {
        func item(_ source: ShellItem) -> Item {
            let image = rendering.image(source.content)
            return Item(id: source.id, label: source.content.label,
                 accessibilityLabel: source.content.accessibilityLabel,
                 // UIKit toolbar extraction uses the UIImage's rendering mode.
                 image: source.content.disabled ? image?.withRenderingMode(.alwaysTemplate) : image,
                 clear: source.content.buttonFill == .clear,
                 background: source.content.backgroundColor.map { Color(uiColor: rendering.color($0)) },
                 borderColor: source.content.borderColor.map { Color(uiColor: rendering.color($0)) },
                 borderWidth: source.content.borderWidth ?? 0,
                 badge: source.content.badge, disabled: source.content.disabled,
                 selected: source.content.selected)
        }
        withAnimation(animated && !UIAccessibility.isReduceMotionEnabled ? .smooth(duration: 0.3) : nil) {
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
@ViewBuilder
private func verticalBarsButton(_ item: ShellVerticalBarsModel.Item, model: ShellVerticalBarsModel) -> some View {
    let button = Button { model.activate(item.id) } label: { ShellVerticalBarsLabel(item: item) }
        .disabled(item.disabled)
        .accessibilityLabel(item.accessibilityLabel)
        .accessibilityIdentifier(item.id)
    if let background = item.background {
        button.buttonStyle(.glassProminent).tint(background)
    } else {
        button.overlay {
            if let borderColor = item.borderColor {
                Capsule().strokeBorder(borderColor, lineWidth: item.borderWidth).allowsHitTesting(false)
            }
        }
    }
}

@available(iOS 26.0, *)
private struct ShellVerticalPopoverContent: UIViewControllerRepresentable {
    let host: ShellOverlayHost
    func makeUIViewController(context: Context) -> ShellOverlayHost { host }
    func updateUIViewController(_ controller: ShellOverlayHost, context: Context) {}
}

@available(iOS 26.0, *)
private struct ShellVerticalBarsButton: ToolbarContent {
    @ObservedObject var model: ShellVerticalBarsModel
    let id: String
    let placement: ToolbarItemPlacement

    // Observe here so same-ID updates also refresh the shared toolbar background.
    var body: some ToolbarContent {
        if let item = model.groups.lazy.flatMap(\.items).first(where: { $0.id == id }) {
            ToolbarItem(placement: placement) {
                verticalBarsButton(item, model: model)
                    .popover(isPresented: Binding(
                        get: { model.popoverAnchor == item.id },
                        set: { shown in
                            if !shown && model.popoverAnchor == item.id {
                                model.popoverAnchor = nil
                                model.popoverHost?.event("dismiss")
                            }
                        }
                    )) {
                        if let host = model.popoverHost {
                            ShellVerticalPopoverContent(host: host)
                                .frame(width: host.preferredContentSize.width, height: host.preferredContentSize.height)
                                .preferredColorScheme(host.options?["dark"] as? Bool == true ? .dark : .light)
                                .presentationCompactAdaptation(.popover)
                                .interactiveDismissDisabled(host.options?["backdropDismiss"] as? Bool == false)
                                .onAppear {
                                    guard model.popoverHost === host else { return }
                                    host.anchoredVisible = true
                                    let completion = model.popoverPresented
                                    model.popoverPresented = nil
                                    completion?(true)
                                }
                                .onDisappear {
                                    if model.popoverHost === host { model.popoverHost = nil }
                                    host.completeDismissal()
                                }
                        }
                    }
            }
                .sharedBackgroundVisibility(item.clear ? .hidden : .automatic)
        }
    }
}

private struct ShellVerticalBarGeometryProbe: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        view.accessibilityIdentifier = "BackButton"
        return view
    }
    func updateUIView(_ uiView: UIView, context: Context) {}
}

@available(iOS 26.0, *)
private func verticalBarsBackButton(_ item: ShellVerticalBarsModel.Item, model: ShellVerticalBarsModel) -> some View {
    Button { model.activate(item.id) } label: { Image(systemName: "chevron.backward") }
        .disabled(item.disabled)
        .accessibilityLabel(item.accessibilityLabel)
        .accessibilityIdentifier("BackButton")
        .background(ShellVerticalBarGeometryProbe())
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
                .modifier(ShellExtensionAccessory(content: model.accessory))
            }
        }
        .modifier(ShellVerticalBarsSearch(model: model))
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
                .toolbar {
                    if model.search?.configuration.available == true {
                        // Let the system adapt bottom-bar search to the vertical rail.
                        DefaultToolbarItem(kind: .search, placement: .bottomBar)
                    }
                }
        }
    }
}

@available(iOS 26.0, *)
private struct ShellVerticalBarsSearch: ViewModifier {
    @ObservedObject var model: ShellVerticalBarsModel
    @ViewBuilder func body(content: Content) -> some View {
        if let search = model.search {
            content.modifier(ShellVerticalSearchModifier(model: search))
        } else { content }
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
                if group.id != model.groups.first(where: { $0.slot == .start })?.id {
                    ToolbarSpacer(.fixed, placement: .topBarLeading)
                }
                ForEach(group.items) { item in
                    ShellVerticalBarsButton(model: model, id: item.id, placement: .topBarLeading)
                    .axisBehavior(.verticalPreferred)
                }
            }
            ForEach(model.groups.filter { $0.slot != .start }) { group in
                if group.id != model.groups.first(where: { $0.slot != .start })?.id {
                    ToolbarSpacer(.fixed, placement: .topBarTrailing)
                }
                ForEach(group.items) { item in
                    ShellVerticalBarsButton(model: model, id: item.id, placement: .topBarTrailing)
                    .axisBehavior(.verticalPreferred)
                }
            }
        }
    }
}
#endif

@available(iOS 26.0, *)
private struct ShellVerticalBarsLegacyToolbar: ViewModifier {
    @ObservedObject var model: ShellVerticalBarsModel

    func body(content: Content) -> some View {
        #if canImport(SwiftUI, _version: 8.0)
        content.toolbar {
            if let back = model.back {
                ToolbarItem(placement: .navigation) {
                    verticalBarsBackButton(back, model: model)
                }
            }
            ForEach(model.groups) { group in
                if group.id != model.groups.first?.id {
                    ToolbarSpacer(.fixed, placement: .primaryAction)
                }
                ForEach(group.items) { item in
                    ShellVerticalBarsButton(model: model, id: item.id, placement: .primaryAction)
                }
            }
        }
        #else
        // Older SDKs cannot use ForEach as ToolbarContent; attach each item separately.
        let base = AnyView(content.toolbar {
            if let back = model.back {
                ToolbarItem(placement: .navigation) { verticalBarsBackButton(back, model: model) }
            }
        })
        // Outer toolbar modifiers precede inner ones, so attach in reverse order.
        return model.groups.reversed().reduce(base) { view, group in
            let items = group.items.reversed().reduce(view) { view, item in
                AnyView(view.toolbar {
                    ShellVerticalBarsButton(model: model, id: item.id, placement: .primaryAction)
                })
            }
            return group.id == model.groups.first?.id ? items : AnyView(items.toolbar {
                ToolbarSpacer(.fixed, placement: .primaryAction)
            })
        }
        #endif
    }
}

@available(iOS 26.0, *)
final class ShellVerticalBarsController: ShellVerticalBarsControlling {
    private final class TransparentHostingController<Content: View>: UIHostingController<Content> {
        var railEdge = "right"
        var layoutSearch: (() -> Void)?
        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            makeFullSizeSurfacesTransparent(in: view)
            layoutSearch?()
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
            // Expanded system search leaves the rail; its field and close button
            // must receive touches instead of passing them through to the WebView.
            var ancestor = hit
            while let view = ancestor, view !== self {
                if view is UIControl { return hit }
                ancestor = view.superview
            }
            guard hit != nil, containsBarSurface(at: point) else { return nil }
            return hit
        }

        private func containsBarSurface(at point: CGPoint) -> Bool {
            containsBarSurface(in: self, at: point)
        }

        private func containsBarSurface(in view: UIView, at point: CGPoint) -> Bool {
            guard !view.isHidden, view.alpha > 0.05 else { return false }
            let name = NSStringFromClass(type(of: view))
            if (name.contains("TabBar") || name.contains("Platter") || name.contains("Pocket") || name.contains("Sidebar") || view is UISearchBar || view is UINavigationBar),
               convert(view.bounds, from: view).contains(point) { return true }
            return view.subviews.contains { containsBarSurface(in: $0, at: point) }
        }
    }

    private let model = ShellVerticalBarsModel()
    private lazy var controller = TransparentHostingController(rootView: ShellVerticalBarsView(model: model))
    private let container = RailContainer()
    private weak var owner: UIViewController?
    private let changed: (String, ShellSearchPhase, String, Bool, Int) -> Int

    func setAccessory(_ content: AnyView?) { model.accessory = content }

    var view: UIView { container }
    func measuredFrames(relativeTo webView: UIView) -> [String: CGRect] {
        var frames: [String: CGRect] = [:]
        let labels = Dictionary(grouping: model.tabs, by: \.accessibilityLabel)
        var tabViews: [UIView] = []
        func visit(_ view: UIView) {
            guard !view.isHidden else { return }
            if let control = view as? UIControl,
               let label = control.accessibilityLabel, let items = labels[label], items.count == 1,
               !control.isHidden, control.bounds.width > 0, control.bounds.height > 0 {
                if frames[items[0].id] != nil { return }
                frames[items[0].id] = control.convert(control.bounds, to: webView)
                tabViews.append(control)
            }
            view.subviews.forEach(visit)
        }
        visit(container)
        if let first = tabViews.first, tabViews.count >= model.tabs.count {
            var ancestor: UIView? = first.superview
            var platter: UIView?
            while let current = ancestor, current !== container {
                if current.bounds.width >= webView.bounds.width * 0.5 { break }
                if current.bounds.width > 0, current.bounds.height > 0,
                   tabViews.allSatisfy({ $0.isDescendant(of: current) }) { platter = current }
                ancestor = current.superview
            }
            if let platter { frames["__tabBar"] = platter.convert(platter.bounds, to: webView) }
        }
        return frames
    }

    var ownsKeyboardChrome: Bool { model.search?.ownsKeyboardChrome == true }

    init(activate: @escaping (String) -> Void,
         changed: @escaping (String, ShellSearchPhase, String, Bool, Int) -> Int) {
        self.changed = changed
        model.activate = activate
        container.backgroundColor = .clear
        controller.view.backgroundColor = .clear
        controller.view.isOpaque = false
        controller.layoutSearch = { [weak self] in self?.model.search?.configureField() }
    }

    @MainActor func attach(to owner: UIViewController, in parent: UIView) {
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

    @MainActor func apply(_ controls: [ShellControl], rendering: ShellRendering, edge: String, animated: Bool = true) {
        container.railEdge = edge
        controller.railEdge = edge
        if let search = controls.first(where: { $0.search != nil })?.search {
            if model.search?.configuration.id == search.id { model.search?.apply(search) }
            else { model.search = ShellVerticalSearchModel(search, in: container, activate: model.activate, changed: changed) }
        } else { model.search = nil }
        model.apply(controls, rendering: rendering, animated: animated)
        controller.overrideUserInterfaceStyle = controls.contains(where: \.dark) ? .dark : .light
    }

    func presentPopover(anchor: String, host: ShellOverlayHost, completion: @escaping (Bool) -> Void) -> Bool {
        guard container.window != nil, model.popoverAnchor == nil,
              model.groups.flatMap(\.items).contains(where: { $0.id == anchor && !$0.disabled }) else { return false }
        model.popoverHost = host
        model.popoverPresented = completion
        host.anchoredVisible = false
        host.cancelAnchored = { [weak self] in
            // Native presentation callbacks and their deadline run on the main queue.
            MainActor.assumeIsolated { self?.detach() }
        }
        host.dismissAnchored = { [weak self, weak host] in
            guard let host else { return }
            guard let self, self.model.popoverHost === host else {
                host.completeDismissal()
                return
            }
            // A backdrop tap clears the binding before SwiftUI finishes closing.
            // Keep the live content and completion until onDisappear, including
            // when dismissal has already started through the system binding.
            if self.model.popoverAnchor != nil {
                var transaction = Transaction()
                transaction.disablesAnimations = host.options?["animated"] as? Bool == false
                withTransaction(transaction) { self.model.popoverAnchor = nil }
            }
            // Before onAppear there will be no onDisappear to finish cleanup.
            if !host.anchoredVisible {
                let completion = self.model.popoverPresented
                self.model.popoverPresented = nil
                self.model.popoverHost = nil
                completion?(false)
            }
        }
        var transaction = Transaction()
        transaction.disablesAnimations = host.options?["animated"] as? Bool == false
        withTransaction(transaction) { model.popoverAnchor = anchor }
        return true
    }

    @MainActor func detach(duration: TimeInterval = 0) {
        let host = model.popoverHost
        let presented = model.popoverPresented
        model.popoverPresented = nil
        model.popoverAnchor = nil
        model.popoverHost = nil
        if controller.parent != nil {
            controller.willMove(toParent: nil)
            ShellCrossfade.retire(container, duration: duration)
            controller.view.removeFromSuperview()
            controller.removeFromParent()
        }
        owner = nil
        host?.dismissAnchored = nil
        host?.cancelAnchored = nil
        presented?(false)
        host?.completeDismissal()
    }
}
