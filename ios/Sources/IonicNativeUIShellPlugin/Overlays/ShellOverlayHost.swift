import UIKit
import WebKit

/// Ionic owns dismissal permission; UIKit owns modal presentation.
final class ShellOverlayHost: UIViewController, UISheetPresentationControllerDelegate {
    let webView: WKWebView
    let options: [String: Any]?
    let event: (String, Double?) -> Void
    var verticalBars: ShellVerticalBarsControlling?
    var projectionRevision = 0
    var projectionSequence = 0
    private var dismissalSnapshot: UIView?

    init(configuration: WKWebViewConfiguration, options: [String: Any]?, event: @escaping (String, Double?) -> Void) {
        webView = WKWebView(frame: .zero, configuration: configuration)
        self.options = options
        self.event = event
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = options == nil || options?["kind"] as? String == "normal" ? .overFullScreen : .pageSheet
        isModalInPresentation = true
        configureSheet()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func loadView() {
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        view = UIView(frame: webView.frame)
        view.backgroundColor = .clear
        webView.frame = view.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(webView)
    }

    func presentationControllerDidAttemptToDismiss(_ presentationController: UIPresentationController) {
        let breakpoints = options?["breakpoints"] as? [Double] ?? []
        if options?["kind"] as? String == "card" || breakpoints.contains(0) {
            // Ionic skips its leave animation for the gesture role and may immediately destroy its content.
            dismissalSnapshot = webView.snapshotView(afterScreenUpdates: false)
            event("dismiss", nil)
        }
    }

    func showDismissalSnapshot() {
        guard let snapshot = dismissalSnapshot else { return }
        snapshot.frame = webView.bounds
        snapshot.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.addSubview(snapshot)
        dismissalSnapshot = nil
    }

    func sheetPresentationControllerDidChangeSelectedDetentIdentifier(_ sheetPresentationController: UISheetPresentationController) {
        if let value = sheetPresentationController.selectedDetentIdentifier?.rawValue, let breakpoint = Double(value) {
            event("breakpoint", breakpoint)
        }
    }
}
