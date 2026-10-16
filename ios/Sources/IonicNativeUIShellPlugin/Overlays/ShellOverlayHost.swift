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
    private var dismissalCompletions: [() -> Void]?

    // Dismiss, close and stop may overlap while SwiftUI is still disappearing.
    // Start dismissal once and deliver its completion to every waiting caller.
    func dismissPopover(animated: Bool, completion: @escaping () -> Void) {
        if dismissalCompletions != nil {
            dismissalCompletions?.append(completion)
            return
        }
        dismissalCompletions = [completion]
        let finish = { [self] in
            let completions = dismissalCompletions ?? []
            dismissalCompletions = nil
            completions.forEach { $0() }
        }
        if let dismissAnchored {
            if anchoredVisible { anchoredDidDismiss = finish; dismissAnchored() }
            else { dismissAnchored(); finish() }
        } else if presentingViewController != nil {
            dismiss(animated: animated, completion: finish)
        } else { finish() }
    }

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
