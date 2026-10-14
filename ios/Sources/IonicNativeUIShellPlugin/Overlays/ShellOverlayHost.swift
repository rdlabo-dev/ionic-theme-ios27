import UIKit
import WebKit

/// Hosts only the live content of a Vertical Bars popover.
final class ShellOverlayHost: UIViewController {
    let webView: WKWebView
    private(set) var options: [String: Any]?
    let event: (String) -> Void
    var dismissAnchored: (() -> Void)?
    var anchoredVisible = false
    var anchoredDidDismiss: (() -> Void)?

    init(configuration: WKWebViewConfiguration, options: [String: Any]?, event: @escaping (String) -> Void) {
        webView = WKWebView(frame: .zero, configuration: configuration)
        self.event = event
        super.init(nibName: nil, bundle: nil)
        apply(options)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func apply(_ options: [String: Any]?) {
        guard let options else { return }
        self.options = options
        preferredContentSize = CGSize(width: options["width"] as? Double ?? 280, height: options["height"] as? Double ?? 200)
        overrideUserInterfaceStyle = options["dark"] as? Bool == true ? .dark : .light
    }

    override func loadView() {
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view = webView
        view.accessibilityViewIsModal = true
    }
}
