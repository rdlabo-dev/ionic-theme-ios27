import UIKit
import WebKit

/// Intercepts only a prepared blank window. All other UI-delegate requests keep Capacitor's behavior.
final class ShellOverlayController: NSObject, WKUIDelegate {
    private weak var source: WKWebView?
    private weak var owner: UIViewController?
    private let original: WKUIDelegate?
    private let automaticallyOpensWindows: Bool
    private var prepared: String?
    private var hosts: [String: ShellOverlayHost] = [:]
    private var order: [String] = []

    init(source: WKWebView, owner: UIViewController) {
        self.source = source
        self.owner = owner
        original = source.uiDelegate
        automaticallyOpensWindows = source.configuration.preferences.javaScriptCanOpenWindowsAutomatically
        super.init()
        source.configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        source.uiDelegate = self
    }

    override func responds(to selector: Selector!) -> Bool {
        super.responds(to: selector) || original?.responds(to: selector) == true
    }

    override func forwardingTarget(for selector: Selector!) -> Any? {
        original?.responds(to: selector) == true ? original : super.forwardingTarget(for: selector)
    }

    func prepare(_ id: String) -> Bool {
        guard prepared == nil, hosts[id] == nil else { return false }
        prepared = id
        return true
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let id = prepared, navigationAction.targetFrame == nil,
              navigationAction.request.url?.absoluteString == "about:blank" else {
            return original?.webView?(webView, createWebViewWith: configuration,
                                      for: navigationAction, windowFeatures: windowFeatures)
        }
        prepared = nil
        let host = ShellOverlayHost(configuration: configuration)
        host.webView.uiDelegate = self
        host.webView.frame = source?.bounds ?? .zero
        hosts[id] = host
        return host.webView
    }

    func present(_ id: String, completion: @escaping (Bool) -> Void) {
        guard let host = hosts[id], !order.contains(id),
              let presenter = order.last.flatMap({ hosts[$0] }) ?? owner,
              presenter.presentedViewController == nil else { completion(false); return }
        order.append(id)
        presenter.present(host, animated: false) { completion(true) }
    }

    func close(_ id: String, completion: @escaping (Bool) -> Void) {
        if prepared == id { prepared = nil; completion(true); return }
        guard let host = hosts[id] else { completion(true); return }
        guard !order.contains(id) || order.last == id else { completion(false); return }
        let finish = { [self] in
            hosts.removeValue(forKey: id)
            order.removeAll { $0 == id }
            host.webView.uiDelegate = nil
            completion(true)
        }
        if host.presentingViewController == nil { finish() }
        else { host.dismiss(animated: false, completion: finish) }
    }

    func stop(completion: @escaping () -> Void) {
        let finish = { [self] in
            prepared = nil
            hosts.values.forEach { $0.webView.uiDelegate = nil }
            hosts.removeAll()
            order.removeAll()
            if let source, source.uiDelegate === self {
                source.uiDelegate = original
                source.configuration.preferences.javaScriptCanOpenWindowsAutomatically = automaticallyOpensWindows
            }
            completion()
        }
        if let first = order.first.flatMap({ hosts[$0] }), first.presentingViewController != nil {
            first.dismiss(animated: false, completion: finish)
        } else { finish() }
    }
}
