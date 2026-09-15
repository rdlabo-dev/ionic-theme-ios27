import UIKit
import WebKit

@main enum ParityMain {
    static func main() {
        UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, NSStringFromClass(ProbeApplication.self), NSStringFromClass(AppDelegate.self))
    }
}

final class ProbeApplication: UIApplication {
    override func sendEvent(_ event: UIEvent) {
        NotificationCenter.default.post(name: Notification.Name("ParityInput"), object: event)
        super.sendEvent(event)
    }
}

final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Parity", sessionRole: session.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.overrideUserInterfaceStyle = ProcessInfo.processInfo.arguments.contains("dark") ? .dark : .light
        window.rootViewController = ProbeController()
        window.makeKeyAndVisible()
        self.window = window
    }
}

final class ProbeController: UIViewController, WKScriptMessageHandler, UITabBarDelegate {
    private let args = ProcessInfo.processInfo.arguments
    private var kind: String { args.first(where: { $0.hasPrefix("control=") })?.replacingOccurrences(of: "control=", with: "") ?? "button" }
    private var isWeb: Bool { args.contains("web") }
    private var isShell: Bool { args.contains("shell") }
    private var appearance: String { args.contains("dark") ? "dark" : "light" }
    private var renderer: String { isShell ? "shell" : isWeb ? "web" : "native" }
    private var controls: [(String, UIView)] = []
    private var rows: [[String: Any]] = []
    private var display: CADisplayLink?
    private var start = CACurrentMediaTime()
    private var saveTimer: Timer?
    private var web: WKWebView?
    private var shellReady: UILabel?
    private var shellInstalled = false
    private let shellRendering = ShellRendering()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGroupedBackground
        view.tintColor = UIColor(red: 2 / 255, green: 137 / 255, blue: 1, alpha: 1)
        if isWeb || isShell {
            let config = WKWebViewConfiguration()
            config.userContentController.add(self, name: "metrics")
            if isShell { config.userContentController.add(self, name: "shell") }
            let web = WKWebView(frame: view.bounds, configuration: config)
            web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            web.scrollView.contentInsetAdjustmentBehavior = .never
            web.isOpaque = false
            web.backgroundColor = .systemGroupedBackground
            view.addSubview(web)
            self.web = web
            let root = Bundle.main.url(forResource: "www", withExtension: nil)!
            var parts = URLComponents(url: root.appendingPathComponent("index.html"), resolvingAgainstBaseURL: false)!
            var items = [URLQueryItem(name: "control", value: kind), URLQueryItem(name: "appearance", value: appearance)]
            if isShell { items.append(URLQueryItem(name: "shell", value: "1")) }
            parts.queryItems = items
            web.loadFileURL(parts.url!, allowingReadAccessTo: root)
        } else {
            installNative()
            beginSampling()
        }
    }

    private func beginSampling() {
        start = CACurrentMediaTime()
        NotificationCenter.default.addObserver(self, selector: #selector(input(_:)), name: Notification.Name("ParityInput"), object: nil)
        display = CADisplayLink(target: self, selector: #selector(sample))
        display?.add(to: .main, forMode: .common)
        saveTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.save() }
    }

    private func add(_ name: String, _ control: UIView) {
        control.accessibilityIdentifier = name
        view.addSubview(control)
        controls.append((name, control))
        if let control = control as? UIControl {
            control.addTarget(self, action: #selector(down(_:)), for: .touchDown)
            control.addTarget(self, action: #selector(up(_:)), for: [.touchUpInside, .touchUpOutside, .touchCancel])
            control.addTarget(self, action: #selector(changed(_:)), for: .valueChanged)
        }
    }

    private func installNative() {
        switch kind {
        case "navigation":
            let navigation = NavigationProbe()
            addChild(navigation)
            navigation.view.frame = view.bounds
            navigation.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            add("Navigation", navigation.view)
            navigation.didMove(toParent: self)
        case "button-matrix":
            // Controlled geometry isolates UIKit's size-dependent press deformation.
            let sizes: [(CGFloat, CGFloat)] = [(44, 44), (80, 44), (220, 44), (80, 28), (180, 62)]
            for (index, size) in sizes.enumerated() {
                var configuration = UIButton.Configuration.glass()
                configuration.title = "S"
                configuration.cornerStyle = .capsule
                let button = UIButton(configuration: configuration)
                button.frame = CGRect(x: 100, y: 160 + index * 105, width: Int(size.0), height: Int(size.1))
                add("Button-\(Int(size.0))-\(Int(size.1))", button)
            }
        case "button", "button-short":
            let titles = kind == "button-short" ? ["Glass"] : ["Glass", "Prominent"]
            for (index, title) in titles.enumerated() {
                var configuration: UIButton.Configuration = index == 0 ? .glass() : .prominentGlass()
                configuration.title = title
                configuration.cornerStyle = .capsule
                let button = UIButton(configuration: configuration)
                button.frame = CGRect(x: 130, y: 220 + index * 150, width: 140, height: 44)
                add(title, button)
            }
        case "toggle":
            let toggle = UISwitch()
            toggle.sizeToFit()
            toggle.frame.origin = CGPoint(x: 150, y: 220)
            add("Toggle", toggle)
        case "segment":
            let segment = UISegmentedControl(items: ["One", "Two", "Three"])
            segment.selectedSegmentIndex = 0
            segment.frame = CGRect(x: 40, y: 220, width: 320, height: segment.intrinsicContentSize.height)
            add("Segment", segment)
        case "range":
            let slider = UISlider(frame: CGRect(x: 40, y: 220, width: 320, height: 44))
            slider.value = 0.5
            add("Range", slider)
        case "tabs":
            let bar = UITabBar()
            bar.traitOverrides.horizontalSizeClass = .compact
            bar.traitOverrides.verticalSizeClass = .regular
            bar.items = ["One", "Two", "Three"].enumerated().map { index, title in
                UITabBarItem(title: title, image: nil, tag: index)
            }
            bar.selectedItem = bar.items?.first
            bar.delegate = self
            bar.frame = CGRect(x: 20, y: 220, width: 360, height: 90)
            add("Tabs", bar)
        case "search":
            let search = UISearchBar(frame: CGRect(x: 24, y: 220, width: 352, height: 56))
            search.placeholder = "Search"
            search.searchBarStyle = .minimal
            add("Search", search)
        case "alert", "action-sheet":
            // Fixture trigger only — present after tap (no auto-present, no notifications).
            let button = UIButton(type: .system)
            button.setTitle("Show overlay", for: .normal)
            button.translatesAutoresizingMaskIntoConstraints = false
            add("Show overlay", button)
            NSLayoutConstraint.activate([
                button.centerXAnchor.constraint(equalTo: view.centerXAnchor),
                button.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            ])
            button.addTarget(self, action: #selector(presentOverlay), for: .touchUpInside)
        default: break
        }
    }

    @objc private func presentOverlay() {
        let sheet = kind == "action-sheet"
        let alert = UIAlertController(
            title: sheet ? "Actions" : "A Short Title Is Best",
            message: sheet ? "Action Sheet" : "A message should be a short, complete sentence.",
            preferredStyle: sheet ? .actionSheet : .alert
        )
        if sheet { alert.addAction(UIAlertAction(title: "Delete", style: .destructive)) }
        let preferred = UIAlertAction(title: sheet ? "Share" : "OK", style: .default)
        alert.addAction(preferred)
        alert.preferredAction = preferred
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        alert.view.tintColor = view.tintColor
        // On iOS 26 a sourceView also makes iPhone present an anchored callout.
        // This case targets an unanchored phone sheet and an anchored iPad sheet.
        if sheet, traitCollection.userInterfaceIdiom == .pad, let anchor = controls.first(where: { $0.0 == "Show overlay" })?.1 {
            alert.popoverPresentationController?.sourceView = anchor
            alert.popoverPresentationController?.sourceRect = anchor.bounds
        }
        rows.append(["t": CACurrentMediaTime() - start, "event": "present", "id": kind])
        present(alert, animated: true)
    }

    private func showShellReady() {
        guard shellReady == nil else { return }
        let label = UILabel()
        label.text = "Shell Ready"
        label.font = .systemFont(ofSize: 12)
        label.textColor = .secondaryLabel
        label.frame = CGRect(x: 24, y: 90, width: 200, height: 20)
        label.isAccessibilityElement = true
        label.accessibilityLabel = "Shell Ready"
        view.addSubview(label)
        shellReady = label
    }

    @available(iOS 26.0, *)
    private func installShellControls(_ body: Any) {
        guard !shellInstalled, let web, let nodes = ShellReference.decodeControls(body) else { return }
        let installed = ShellReference.install(nodes, on: view, above: web, rendering: shellRendering,
                                              tabDelegate: self) { [weak self] id in
            self?.event("change", id)
        }
        guard !installed.isEmpty else { return }
        shellInstalled = true
        for control in installed {
            let name = control.accessibilityIdentifier ?? "shell"
            controls.append((name, control))
            if let control = control as? UIControl {
                control.addTarget(self, action: #selector(down(_:)), for: .touchDown)
                control.addTarget(self, action: #selector(up(_:)), for: [.touchUpInside, .touchUpOutside, .touchCancel])
                control.addTarget(self, action: #selector(changed(_:)), for: .valueChanged)
            }
        }
        showShellReady()
        beginSampling()
    }

    @objc private func down(_ sender: UIControl) { event("down", sender.accessibilityIdentifier ?? "") }
    @objc private func up(_ sender: UIControl) { event("up", sender.accessibilityIdentifier ?? "") }
    @objc private func changed(_ sender: UIControl) { event("change", sender.accessibilityIdentifier ?? "") }
    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) { event("change", item.title ?? "") }
    private func event(_ event: String, _ id: String) {
        rows.append(["t": CACurrentMediaTime() - start, "event": event, "id": id])
    }
    @objc private func input(_ notification: Notification) {
        guard let event = notification.object as? UIEvent else { return }
        for touch in event.allTouches ?? [] {
            let phase: String
            switch touch.phase {
            case .began: phase = "pointerdown"
            case .ended: phase = "pointerup"
            case .cancelled: phase = "pointercancel"
            default: continue
            }
            let point = touch.location(in: view)
            rows.append(["t": CACurrentMediaTime() - start, "event": phase, "x": point.x, "y": point.y])
        }
    }
    private func rgba(_ color: CGColor?) -> [CGFloat] {
        guard let color else { return [] }
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(cgColor: color).getRed(&r, green: &g, blue: &b, alpha: &a)
        return [r, g, b, a]
    }
    @objc private func sample() {
        guard rows.count < 6000 else { return }
        // During overlay presentation, sample the full UIWindow layer tree so the
        // presented alert/action-sheet geometry and motion are included (still capped at 6000).
        let host = presentedViewController != nil ? (view.window?.layer ?? view.layer) : view.layer
        let root = host.presentation() ?? host
        func collect(_ layer: CALayer, _ path: String) -> [[String: Any]] {
            let p = layer.presentation() ?? layer
            let rect = p.convert(p.bounds, to: root)
            guard [rect.minX, rect.minY, rect.width, rect.height].allSatisfy({ $0.isFinite }) else { return [] }
            let transform = p.transform
            var values: [[String: Any]] = [["path": path, "type": String(describing: type(of: layer)),
                "x": rect.minX, "y": rect.minY, "w": rect.width, "h": rect.height,
                "sx": sqrt(transform.m11 * transform.m11 + transform.m12 * transform.m12),
                "sy": sqrt(transform.m21 * transform.m21 + transform.m22 * transform.m22),
                "opacity": p.opacity, "hidden": layer.isHidden, "radius": p.cornerRadius.isFinite ? p.cornerRadius as Any : NSNull(),
                "background": rgba(p.backgroundColor)]]
            for (index, child) in (layer.sublayers ?? []).enumerated() { values += collect(child, "\(path)/\(index)") }
            return values
        }
        let layers = presentedViewController != nil
            ? collect(host, "window")
            : controls.flatMap { collect($0.1.layer, $0.0) }
        rows.append(["t": CACurrentMediaTime() - start, "layers": layers])
    }
    private func write(_ value: Any) {
        let url = Bundle.main.url(forResource: "www", withExtension: nil)!.appendingPathComponent("build.json")
        let build = (try? Data(contentsOf: url)).flatMap { try? JSONSerialization.jsonObject(with: $0) } ?? NSNull()
        let envelope: [String: Any] = ["os": ProcessInfo.processInfo.operatingSystemVersionString, "build": build,
            "scale": view.window?.screen.scale ?? 0, "width": view.bounds.width, "height": view.bounds.height,
            "control": kind, "appearance": appearance, "renderer": renderer, "samples": value]
        guard JSONSerialization.isValidJSONObject(envelope),
              let data = try? JSONSerialization.data(withJSONObject: envelope) else { return }
        let file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("\(kind)-\(renderer)-\(appearance).json")
        try? data.write(to: file, options: .atomic)
    }
    private func save() { write(rows) }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "shell" {
            if #available(iOS 26.0, *) { installShellControls(message.body) }
            return
        }
        if isShell { return }
        if let values = message.body as? [[String: Any]] { write(values) }
    }
}
