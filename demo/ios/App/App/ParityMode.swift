import Capacitor
import UIKit
import WebKit

/// Test-only parity harness. When the app is launched with `-parity` (or
/// `-parity-dark`) this mounts UIKit reference controls at the bottom of the
/// screen, registers a `parity` WKScriptMessageHandler so the web side can
/// report DOM frames, and exposes the merged metrics through accessibility
/// labels for XCTest to read.
///
/// The audit target is the real `/main/index/native-ui-shell` demo page plus
/// the shell's `ion-tab-bar`. When web metrics arrive, each reference control
/// is resized to the corresponding web frame so item-level divisions can be
/// compared like for like.
final class ParityHarness: NSObject, WKScriptMessageHandler {

    private var webView: WKWebView?
    private var nativeRefs: [String: UIView] = [:]
    private var webMetrics: [String: Any]?
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
        let save = UIButton(type: .system)
        if #available(iOS 26.0, *) {
            var config = UIButton.Configuration.glass()
            config.title = "Save"
            save.configuration = config
        } else {
            save.setTitle("Save", for: .normal)
        }
        save.accessibilityIdentifier = "native-save"
        host.addSubview(save)
        nativeRefs["save"] = save

        let segment = UISegmentedControl(items: ["One", "Two", "Three"])
        segment.selectedSegmentIndex = 0
        segment.setEnabled(false, forSegmentAt: 2)
        segment.accessibilityIdentifier = "native-segment"
        host.addSubview(segment)
        nativeRefs["segment"] = segment

        let tabBar = UITabBar()
        tabBar.items = [
            UITabBarItem(title: "Index", image: nil, tag: 0),
            UITabBarItem(title: "Docs", image: nil, tag: 1),
            UITabBarItem(title: "Library", image: nil, tag: 2),
            UITabBarItem(title: "Settings", image: nil, tag: 3),
        ]
        tabBar.selectedItem = tabBar.items?.first
        tabBar.accessibilityIdentifier = "native-tabs"
        host.addSubview(tabBar)
        nativeRefs["tabs"] = tabBar

        layoutNativeRefs()
    }

    private func layoutNativeRefs() {
        // Overlay row at the bottom of the screen; widths are synced to the
        // web frames once metrics arrive.
        nativeRefs["save"]?.frame = CGRect(x: 24, y: 590, width: 140, height: 44)
        nativeRefs["segment"]?.frame = CGRect(x: 24, y: 646, width: 354, height: 32)
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

        if let save = nativeRefs["save"] {
            metrics["save"] = frameDict(save.frame)
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

    private func webWidth(_ key: String) -> CGFloat? {
        guard let node = webMetrics?[key] as? [String: Any] else { return nil }
        let frame = (node["frame"] as? [String: Any]) ?? node
        return (frame["w"] as? NSNumber).map { CGFloat(truncating: $0) }
    }

    /// Match each reference's width to the measured web control so per-item
    /// divisions are compared on equal footing, then lay out and publish.
    private func publishIfReady() {
        guard let web = webMetrics, let host = webView?.superview ?? webView else { return }
        if let width = webWidth("segment"), let segment = nativeRefs["segment"] {
            segment.frame.size.width = width
        }
        if let width = webWidth("tabs"), let tabs = nativeRefs["tabs"] {
            tabs.frame.size.width = width
        }
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
