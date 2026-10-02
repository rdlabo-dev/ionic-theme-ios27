import UIKit
import WebKit

/// Intercepts only a prepared blank window. Other requests keep Capacitor's behavior.
final class ShellOverlayController: NSObject, WKUIDelegate {
    private weak var source: WKWebView?
    private weak var owner: UIViewController?
    private let original: WKUIDelegate?
    private let automaticallyOpensWindows: Bool
    private var prepared: (id: String, options: [String: Any]?)?
    private let event: (String, String, Double?) -> Void
    private var id: String?
    private var host: ShellOverlayHost?

    init(source: WKWebView, owner: UIViewController, event: @escaping (String, String, Double?) -> Void) {
        self.source = source
        self.owner = owner
        self.event = event
        original = source.uiDelegate
        automaticallyOpensWindows = source.configuration.preferences.javaScriptCanOpenWindowsAutomatically
        super.init()
        source.uiDelegate = self
    }

    override func responds(to selector: Selector!) -> Bool {
        super.responds(to: selector) || original?.responds(to: selector) == true
    }

    override func forwardingTarget(for selector: Selector!) -> Any? {
        original?.responds(to: selector) == true ? original : super.forwardingTarget(for: selector)
    }

    func prepare(_ id: String, options: [String: Any]?) -> Bool {
        guard prepared == nil, host == nil else { return false }
        prepared = (id, options)
        source?.configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        return true
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard webView === source, navigationAction.sourceFrame.isMainFrame,
              let prepared, navigationAction.targetFrame == nil,
              navigationAction.request.url?.absoluteString == "about:blank#\(prepared.id)" else {
            return original?.webView?(webView, createWebViewWith: configuration,
                                      for: navigationAction, windowFeatures: windowFeatures)
        }
        self.prepared = nil
        source?.configuration.preferences.javaScriptCanOpenWindowsAutomatically = automaticallyOpensWindows
        id = prepared.id
        let host = ShellOverlayHost(configuration: configuration, options: prepared.options) { [weak self] action, breakpoint in
            self?.event(prepared.id, action, breakpoint)
        }
        host.webView.uiDelegate = self
        host.webView.frame = source?.bounds ?? .zero
        self.host = host
        return host.webView
    }

    func present(_ id: String, completion: @escaping (Bool) -> Void) {
        guard self.id == id, let host, let owner,
              owner.presentedViewController == nil else { completion(false); return }
        owner.present(host, animated: host.options?["animated"] as? Bool ?? false) { completion(true) }
    }

    // Keep the WebView alive until JavaScript has restored the adopted nodes and listeners.
    func dismiss(_ id: String, animated: Bool, gesture: Bool, completion: @escaping () -> Void) {
        guard self.id == id, let host, host.presentingViewController != nil else { completion(); return }
        if gesture { host.showDismissalSnapshot() }
        host.dismiss(animated: animated, completion: completion)
    }

    func close(_ id: String, completion: @escaping () -> Void) {
        if prepared?.id == id {
            prepared = nil
            source?.configuration.preferences.javaScriptCanOpenWindowsAutomatically = automaticallyOpensWindows
        }
        guard self.id == id, let host else { completion(); return }
        let finish = { [self] in
            host.verticalBars?.detach()
            host.webView.uiDelegate = nil
            self.host = nil
            self.id = nil
            completion()
        }
        if host.presentingViewController == nil { finish() }
        else { host.dismiss(animated: false, completion: finish) }
    }

    func projectionHost(_ id: String) -> ShellOverlayHost? {
        self.id == id ? host : nil
    }

    func setBreakpoint(_ id: String, value: Double) {
        if self.id == id { host?.setBreakpoint(value) }
    }

    func stop(completion: @escaping () -> Void) {
        let finish = { [self] in
            prepared = nil
            if let source, source.uiDelegate === self {
                source.uiDelegate = original
                source.configuration.preferences.javaScriptCanOpenWindowsAutomatically = automaticallyOpensWindows
            }
            completion()
        }
        if let id { close(id, completion: finish) }
        else { finish() }
    }
}
