import Capacitor
import UIKit
import WebKit

/// Test-only parity harness. When the app is launched with `-parity` (or
/// `-parity-dark`) this mounts UIKit reference controls at the bottom of the
/// screen, registers a `parity` WKScriptMessageHandler so the web side can
/// report DOM frames, and exposes the merged metrics through accessibility
/// labels for XCTest to read.
final class ParityHarness: NSObject, WKScriptMessageHandler {

    private var webView: WKWebView?
    private var nativeRefs: [String: UIView] = [:]
    private var webMetrics: [String: Any]?
    private var nativeMetrics: [String: Any]?
    private let report = UILabel()
    private let readyFlag = UILabel()

    private var enabled: Bool {
        ProcessInfo.processInfo.arguments.contains("-parity")
            || ProcessInfo.processInfo.arguments.contains("-parity-dark")
    }

    func install(window: UIWindow) {
        guard enabled else { return }
        waitForBridge(window: window, attempts: 0)
    }

    private func waitForBridge(window: UIWindow, attempts: Int) {
        guard attempts < 60 else { return }
        if let bridgeVC = window.rootViewController as? CAPBridgeViewController,
           let webView = bridgeVC.bridge?.webView ?? bridgeVC.webView {
            setup(window: window, webView: webView)
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            self?.waitForBridge(window: window, attempts: attempts + 1)
        }
    }

    private func setup(window: UIWindow, webView: WKWebView) {
        self.webView = webView

        if ProcessInfo.processInfo.arguments.contains("-parity-dark") {
            window.overrideUserInterfaceStyle = .dark
        } else {
            window.overrideUserInterfaceStyle = .light
        }

        webView.configuration.userContentController.add(self, name: "parity")
        webView.scrollView.isScrollEnabled = false

        installNativeRefs(on: window)
        installReportLabels(on: window)
    }

    // MARK: - Layout

    private func installNativeRefs(on host: UIView) {
        let glass = UIButton(type: .system)
        if #available(iOS 26.0, *) {
            var config = UIButton.Configuration.glass()
            config.title = "Glass"
            glass.configuration = config
        } else {
            glass.setTitle("Glass", for: .normal)
        }
        glass.accessibilityIdentifier = "native-glass"
        host.addSubview(glass)
        nativeRefs["glass"] = glass

        let prominent = UIButton(type: .system)
        if #available(iOS 26.0, *) {
            var config = UIButton.Configuration.prominentGlass()
            config.title = "Prominent"
            prominent.configuration = config
        } else {
            prominent.setTitle("Prominent", for: .normal)
        }
        prominent.accessibilityIdentifier = "native-prominent"
        host.addSubview(prominent)
        nativeRefs["prominent"] = prominent

        let toggle = UISwitch()
        toggle.isOn = true
        toggle.accessibilityIdentifier = "native-toggle"
        host.addSubview(toggle)
        nativeRefs["toggle"] = toggle

        let segment = UISegmentedControl(items: ["One", "Two", "Three"])
        segment.selectedSegmentIndex = 0
        segment.accessibilityIdentifier = "native-segment"
        host.addSubview(segment)
        nativeRefs["segment"] = segment

        let slider = UISlider()
        slider.value = 0.4
        slider.accessibilityIdentifier = "native-range"
        host.addSubview(slider)
        nativeRefs["range"] = slider

        let tabBar = UITabBar()
        tabBar.items = [
            UITabBarItem(title: "One", image: nil, tag: 0),
            UITabBarItem(title: "Two", image: nil, tag: 1),
            UITabBarItem(title: "Three", image: nil, tag: 2),
        ]
        tabBar.selectedItem = tabBar.items?.first
        tabBar.accessibilityIdentifier = "native-tabs"
        host.addSubview(tabBar)
        nativeRefs["tabs"] = tabBar

        layoutNativeRefs(host: host)
    }

    private func layoutNativeRefs(host: UIView) {
        nativeRefs["glass"]?.frame = CGRect(x: 24, y: 590, width: 140, height: 44)
        nativeRefs["prominent"]?.frame = CGRect(x: 232, y: 590, width: 140, height: 44)
        nativeRefs["toggle"]?.frame = CGRect(x: 24, y: 650, width: 63, height: 28)
        nativeRefs["segment"]?.frame = CGRect(x: 24, y: 646, width: 320, height: 32)
        nativeRefs["range"]?.frame = CGRect(x: 24, y: 706, width: 320, height: 44)
        nativeRefs["tabs"]?.frame = CGRect(x: 21, y: 786, width: 360, height: 62)
    }

    private func installReportLabels(on host: UIView) {
        for label in [report, readyFlag] {
            label.frame = CGRect(x: 0, y: host.bounds.height - 1, width: 1, height: 1)
            label.isUserInteractionEnabled = false
            host.addSubview(label)
        }
        report.accessibilityIdentifier = "parity-report"
        readyFlag.accessibilityIdentifier = "parity-ready"
    }

    // MARK: - Metrics

    private func frameDict(_ rect: CGRect, origin: CGPoint = .zero) -> [String: Double] {
        [
            "x": Double(rect.origin.x - origin.x),
            "y": Double(rect.origin.y - origin.y),
            "w": Double(rect.width),
            "h": Double(rect.height),
        ]
    }

    private func collectNativeMetrics(host: UIView) -> [String: Any] {
        var metrics: [String: Any] = [:]

        for key in ["glass", "prominent", "toggle"] {
            if let view = nativeRefs[key] {
                metrics[key] = frameDict(view.frame)
            }
        }

        if let segment = nativeRefs["segment"] as? UISegmentedControl {
            var items: [[String: Double]] = []
            var x: CGFloat = 0
            for index in 0..<segment.numberOfSegments {
                let width = segment.widthForSegment(at: index)
                items.append(frameDict(CGRect(x: x, y: 0, width: width, height: segment.bounds.height)))
                x += width
            }
            metrics["segment"] = ["frame": frameDict(segment.frame), "items": items]
        }

        if let slider = nativeRefs["range"] as? UISlider {
            let track = slider.trackRect(forBounds: slider.bounds)
            let thumb = slider.thumbRect(forBounds: slider.bounds, trackRect: track, value: slider.value)
            metrics["range"] = [
                "frame": frameDict(slider.frame),
                "track": frameDict(track),
                "thumb": frameDict(thumb),
            ]
        }

        if let tabBar = nativeRefs["tabs"] as? UITabBar {
            // The floating glass platter is a subview narrower than the frame;
            // measure the widest interior view, converting to window space.
            let platter = tabBar.subviews
                .filter { $0.bounds.width < tabBar.bounds.width }
                .max(by: { $0.bounds.width < $1.bounds.width })
            metrics["tabs"] = [
                "frame": frameDict(tabBar.frame),
                "platter": platter.map { frameDict($0.convert($0.bounds, to: nil)) },
                "content": frameDict(tabBar.bounds),
            ]
        }

        metrics["screen"] = [
            "w": Double(host.bounds.width),
            "h": Double(host.bounds.height),
            "scale": Double(UIScreen.main.scale),
            "safeTop": Double(host.safeAreaInsets.top),
            "safeBottom": Double(host.safeAreaInsets.bottom),
        ]
        return metrics
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "parity", let body = message.body as? [String: Any] else { return }
        webMetrics = body["metrics"] as? [String: Any] ?? body
        publishIfReady()
    }

    private func publishIfReady() {
        guard let web = webMetrics, let host = webView?.superview ?? webView else { return }
        host.layoutIfNeeded()
        let native = collectNativeMetrics(host: host)
        let payload: [String: Any] = ["web": web, "native": native]
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
           let text = String(data: data, encoding: .utf8) {
            report.text = text
            readyFlag.text = "parity-report-ready"
        }
    }
}
