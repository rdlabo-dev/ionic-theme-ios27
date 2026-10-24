import UIKit
import WebKit

/// Hosts only the live content of a Vertical Bars popover.
final class NativeUIOverlayHost: UIViewController {
    let webView: WKWebView
    private(set) var options: [String: Any]?
    let event: (String) -> Void
    // Settle native presentation before the JS bridge's five-second deadline.
    static let completionTimeout: TimeInterval = 4
    var dismissAnchored: (() -> Void)?
    var cancelAnchored: (() -> Void)?
    var anchoredVisible = false
    var disappeared = false
    private var dismissalCompletions: [() -> Void]?
    private var dismissalTimeout: DispatchWorkItem?

    func presentationDidDisappear() {
        // SwiftUI may disappear before (or without) updating isPresented.
        // Notify through this retained host, not the model's already-cleared host.
        // Web-initiated dismissal already owns Ionic's lifecycle; do not echo it.
        let nativeDismissal = anchoredVisible && dismissalCompletions == nil
        if nativeDismissal { disappeared = true }
        completeDismissal()
        if nativeDismissal { event("dismiss") }
    }

    func completeDismissal() {
        dismissalTimeout?.cancel()
        dismissalTimeout = nil
        anchoredVisible = false
        let completions = dismissalCompletions ?? []
        dismissalCompletions = nil
        completions.forEach { $0() }
    }

    // Dismiss, close and stop may overlap while SwiftUI is still disappearing.
    // Start dismissal once and deliver its completion to every waiting caller.
    func dismissPopover(animated: Bool, completion: @escaping () -> Void) {
        if dismissalCompletions != nil {
            dismissalCompletions?.append(completion)
            return
        }
        dismissalCompletions = [completion]
        let finish = { [self] in completeDismissal() }
        let timeout = DispatchWorkItem { [weak self] in
            guard let self, self.dismissalCompletions != nil else { return }
            // Remove the owning rail if SwiftUI never reports disappearance.
            // Its detach path settles waiters before any replacement can attach.
            self.cancelAnchored?()
            self.completeDismissal()
        }
        dismissalTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.completionTimeout, execute: timeout)
        if let dismissAnchored {
            if anchoredVisible { dismissAnchored() }
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
