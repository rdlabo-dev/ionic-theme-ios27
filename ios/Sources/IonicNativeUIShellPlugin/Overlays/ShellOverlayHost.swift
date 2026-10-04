import UIKit
import WebKit

/// Ionic owns dismissal permission; UIKit owns modal presentation.
final class ShellOverlayHost: UIViewController, UISheetPresentationControllerDelegate, UIPopoverPresentationControllerDelegate {
    let webView: WKWebView
    private(set) var options: [String: Any]?
    let event: (String, Double?) -> Void
    var verticalBars: ShellVerticalBarsControlling?
    var projectionRevision = 0
    var projectionSequence = 0
    /// Frozen cover that keeps the presented surface identical while the relayed
    /// document finishes its first paint inside the hosted WebView.
    var placeholder: UIView? {
        didSet { oldValue?.removeFromSuperview() }
    }
    private var dismissalSnapshot: UIView?

    var dismissAnchored: (() -> Void)?
    var anchoredVisible = false
    var anchoredDidDismiss: (() -> Void)?

    init(configuration: WKWebViewConfiguration, options: [String: Any]?, event: @escaping (String, Double?) -> Void) {
        webView = WKWebView(frame: .zero, configuration: configuration)
        self.options = options
        self.event = event
        super.init(nibName: nil, bundle: nil)
        apply(options)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    /// Presentation details can arrive after the host exists; apply them before use.
    func apply(_ options: [String: Any]?) {
        guard let options else { return }
        self.options = options
        let kind = options["kind"] as? String
        modalPresentationStyle = kind == "popover" && options["anchorId"] == nil ? .popover : (kind == "card" || kind == "sheet" ? .pageSheet : .overFullScreen)
        if kind == "popover" {
            overrideUserInterfaceStyle = options["dark"] as? Bool == true ? .dark : .light
            preferredContentSize = CGSize(width: options["width"] as? Double ?? 280, height: options["height"] as? Double ?? 200)
        }
        if kind == "alert" { modalTransitionStyle = .crossDissolve }
        isModalInPresentation = kind != "popover"
        if modalPresentationStyle == .popover { popoverPresentationController?.delegate = self }
        configureSheet()
    }

    override func loadView() {
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        view = UIView(frame: webView.frame)
        view.backgroundColor = .clear
        // Covered page controls stay projected during the relay; keep them out of
        // VoiceOver while the overlay owns interaction.
        view.accessibilityViewIsModal = true
        view.addSubview(webView)
        if options?["kind"] as? String == "popover" {
            webView.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
                webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
                webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
                webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
            ])
        } else {
            webView.frame = view.bounds
            webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        }
    }

    func adaptivePresentationStyle(for controller: UIPresentationController) -> UIModalPresentationStyle { .none }

    func popoverPresentationControllerShouldDismissPopover(_ popoverPresentationController: UIPopoverPresentationController) -> Bool {
        options?["backdropDismiss"] as? Bool != false
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        if options?["kind"] as? String == "popover" { event("dismiss", nil) }
    }

    func presentationControllerDidAttemptToDismiss(_ presentationController: UIPresentationController) {
        if options?["kind"] as? String == "popover" {
            if options?["backdropDismiss"] as? Bool != false { event("dismiss", nil) }
            return
        }
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
