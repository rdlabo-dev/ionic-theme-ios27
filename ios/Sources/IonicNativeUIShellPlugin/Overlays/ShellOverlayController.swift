import UIKit
import WebKit

/// Intercepts only a prepared blank window. Other requests keep Capacitor's behavior.
final class ShellOverlayController: NSObject, WKUIDelegate {
    private weak var source: WKWebView?
    private weak var owner: UIViewController?
    private let original: WKUIDelegate?
    private let automaticallyOpensWindows: Bool
    private var prepared: String?
    private let event: (String, String) -> Void
    private var id: String?
    private var host: ShellOverlayHost?

    init(source: WKWebView, owner: UIViewController, event: @escaping (String, String) -> Void) {
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

    func prepare(_ id: String) -> Bool {
        guard prepared == nil, host == nil else { return false }
        prepared = id
        source?.configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        return true
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // WebKit percent-encodes '#' inside about: URLs; compare the decoded form.
        guard webView === source, navigationAction.sourceFrame.isMainFrame,
              let prepared, navigationAction.targetFrame == nil,
              navigationAction.request.url?.absoluteString.removingPercentEncoding == "about:blank#\(prepared)" else {
            return original?.webView?(webView, createWebViewWith: configuration,
                                      for: navigationAction, windowFeatures: windowFeatures)
        }
        self.prepared = nil
        source?.configuration.preferences.javaScriptCanOpenWindowsAutomatically = automaticallyOpensWindows
        id = prepared
        let host = ShellOverlayHost(configuration: configuration, options: nil) { [weak self] action in
            self?.event(prepared, action)
        }
        host.webView.uiDelegate = self
        host.webView.frame = source?.bounds ?? .zero
        self.host = host
        return host.webView
    }

    func present(_ id: String, options: [String: Any]?, anchored: (String, ShellOverlayHost, @escaping (Bool) -> Void) -> Bool,
                 completion: @escaping (Bool) -> Void) {
        guard self.id == id, let host, let owner,
              owner.presentedViewController == nil else { completion(false); return }
        host.apply(options)
        var settled = false
        var timeout: DispatchWorkItem?
        let complete: (Bool) -> Void = { presented in
            guard !settled else { return }
            settled = true
            timeout?.cancel()
            timeout = nil
            completion(presented)
        }
        timeout = DispatchWorkItem { [weak host] in
            host?.cancelAnchored?()
            complete(false)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + ShellOverlayHost.completionTimeout, execute: timeout!)
        if host.options?["kind"] as? String == "popover",
           let anchor = host.options?["anchorId"] as? String,
           anchored(anchor, host, complete) { return }
        complete(false)
    }

    // Keep the WebView alive until JavaScript has restored the adopted nodes and listeners.
    func dismiss(_ id: String, animated: Bool, completion: @escaping () -> Void) {
        guard self.id == id, let host else { completion(); return }
        host.dismissPopover(animated: animated, completion: completion)
    }

    func close(_ id: String, completion: @escaping () -> Void) {
        if prepared == id {
            prepared = nil
            source?.configuration.preferences.javaScriptCanOpenWindowsAutomatically = automaticallyOpensWindows
        }
        guard self.id == id, let host else { completion(); return }
        let finish = { [self] in
            host.webView.uiDelegate = nil
            self.host = nil
            self.id = nil
            completion()
        }
        host.dismissPopover(animated: false, completion: finish)
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
