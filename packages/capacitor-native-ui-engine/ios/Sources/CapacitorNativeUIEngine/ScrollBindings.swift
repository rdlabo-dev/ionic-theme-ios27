import UIKit
import WebKit

/// One tracker per DOM scroll owner. A lost established mapping is rejected;
/// the host's normal acknowledgement path can then request a fresh acquisition.
public final class NativeUIScrollBindings {
    private var trackers: [String: NativeUIScrollTracker] = [:]
    public init() {}
    public func replace(_ nodes: [NativeUIScrollNode], in webView: WKWebView, scale: CGFloat,
                        render: @escaping (String, CGRect, CGRect) -> Void) -> [String] {
        let previous = trackers
        trackers.removeAll()
        var rejected: [String] = []
        for (id, group) in Dictionary(grouping: nodes.filter { $0.scroll != nil }, by: { $0.scroll!.id }) {
            if group.contains(where: { $0.scroll?.reuse == true }) {
                if let tracker = previous[id], tracker.replace(group, webView: webView, scale: scale) {
                    trackers[id] = tracker
                } else { rejected.append(contentsOf: group.map(\.id)) }
            } else if let tracker = NativeUIScrollTracker(webView: webView, nodes: group, scale: scale, render: render) {
                trackers[id] = tracker
            } else { rejected.append(contentsOf: group.map(\.id)) }
        }
        return rejected
    }
    public func update() { trackers.values.forEach { $0.update() } }
    public func reset() { trackers.removeAll() }
}
