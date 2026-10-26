import UIKit
import WebKit

public struct NativeUIScrollPlacement: Decodable, Equatable {
    public let id: String
    public let reuse: Bool?
    public let offsetX: Double
    public let offsetY: Double
    public let viewport: NativeUIFrame
    public let clip: NativeUIFrame
    public let contentWidth: Double
    public let contentHeight: Double
    public let frame: NativeUIFrame

    public init(id: String, reuse: Bool? = nil, offsetX: Double, offsetY: Double,
                viewport: NativeUIFrame, clip: NativeUIFrame, contentWidth: Double, contentHeight: Double, frame: NativeUIFrame) {
        self.id = id; self.reuse = reuse; self.offsetX = offsetX; self.offsetY = offsetY
        self.viewport = viewport; self.clip = clip; self.contentWidth = contentWidth; self.contentHeight = contentHeight; self.frame = frame
    }

    public var isValid: Bool {
        !id.isEmpty && viewport.isValid && clip.isValid && frame.isValid &&
        offsetX.isFinite && offsetY.isFinite && contentWidth.isFinite && contentHeight.isFinite && contentWidth > 0 && contentHeight > 0
    }
}

/// One observer per overflow container. Web measures layout; native owns scrolling.
/// WKWebView's overflow hierarchy is not a public DOM mapping: only bind a unique match.
public final class NativeUIScrollTracker {
    private weak var webView: WKWebView?
    private weak var scrollView: UIScrollView?
    private let placement: NativeUIScrollPlacement
    private let scale: CGFloat
    private let contentOrigin: CGPoint
    private let viewportCorrection: CGPoint
    private var frames: [String: CGRect] = [:]
    private let render: (String, CGRect, CGRect) -> Void
    private var observation: NSKeyValueObservation?

    public init?(webView: WKWebView, nodes: [NativeUIScrollNode], scale: CGFloat,
          render: @escaping (String, CGRect, CGRect) -> Void) {
        guard let placement = nodes.first?.scroll, placement.isValid,
              nodes.allSatisfy({ $0.scroll?.id == placement.id && $0.scroll?.viewport == placement.viewport &&
                  $0.scroll?.clip == placement.clip && $0.scroll?.contentWidth == placement.contentWidth &&
                  $0.scroll?.contentHeight == placement.contentHeight }), scale.isFinite, scale > 0 else { return nil }
        let transform = CGAffineTransform(scaleX: scale, y: scale)
        let viewport = placement.viewport.rect.applying(transform)
        let candidates = Self.scrollViews(in: webView).filter { scroll in
            let frame = scroll.convert(scroll.bounds, to: webView)
            return scroll !== webView.scrollView && !scroll.isHidden && scroll.window != nil &&
                abs(scroll.zoomScale - 1) < 0.001 &&
                abs(frame.minX - viewport.minX) < 2 && abs(frame.minY - viewport.minY) < 2 &&
                abs(frame.width - viewport.width) < 2 && abs(frame.height - viewport.height) < 2 &&
                abs(scroll.contentSize.width - placement.contentWidth * scale) < 3 &&
                abs(scroll.contentSize.height - placement.contentHeight * scale) < 3
        }
        guard candidates.count == 1, let scroll = candidates.first, !scroll.isDragging, !scroll.isDecelerating else { return nil }
        self.webView = webView
        self.scrollView = scroll
        self.placement = placement
        self.scale = scale
        // Calibrate coordinate origins once while acquiring a resting scroller.
        // CSS RTL scroll origins and UIKit dimensions can differ by rounded pixels.
        // Keep this mapping for content updates during motion; never recalibrate per tick.
        self.contentOrigin = CGPoint(x: scroll.contentOffset.x - placement.offsetX * scale,
                                     y: scroll.contentOffset.y - placement.offsetY * scale)
        let actual = scroll.convert(scroll.bounds, to: webView)
        self.viewportCorrection = CGPoint(x: viewport.minX - actual.minX, y: viewport.minY - actual.minY)
        self.render = render
        setFrames(nodes)
        observation = scroll.observe(\.contentOffset, options: [.new]) { [weak self] _, _ in self?.update() }
    }

    /// Reuse the observer and coordinate origin when only source content/layout changes.
    public func replace(_ nodes: [NativeUIScrollNode], webView: WKWebView, scale: CGFloat) -> Bool {
        guard self.webView === webView, let scrollView, scrollView.isDescendant(of: webView),
              !scrollView.isHidden, scrollView.window != nil, self.scale == scale,
              nodes.allSatisfy({ node in
                  guard let next = node.scroll else { return false }
                  return next.id == placement.id && next.viewport == placement.viewport && next.clip == placement.clip &&
                      next.contentWidth == placement.contentWidth && next.contentHeight == placement.contentHeight
              }) else { return false }
        setFrames(nodes)
        return true
    }

    private func setFrames(_ nodes: [NativeUIScrollNode]) {
        frames = Dictionary(uniqueKeysWithValues: nodes.map {
            ($0.id, $0.scroll!.frame.rect.applying(CGAffineTransform(scaleX: scale, y: scale))
                .offsetBy(dx: contentOrigin.x, dy: contentOrigin.y))
        })
    }

    public func update() {
        guard let webView, let scrollView, scrollView.isDescendant(of: webView) else {
            frames.forEach { render($0.key, $0.value, .null) }
            return
        }
        let origin = scrollView.convert(scrollView.bounds, to: webView).origin
        let viewport = CGRect(x: origin.x + viewportCorrection.x, y: origin.y + viewportCorrection.y,
                              width: placement.viewport.width * scale, height: placement.viewport.height * scale)
        let visible = placement.clip.rect.applying(CGAffineTransform(scaleX: scale, y: scale))
            .intersection(viewport).intersection(webView.bounds)
        UIView.performWithoutAnimation {
            for (id, frame) in frames {
                render(id, frame.offsetBy(dx: viewport.minX - scrollView.contentOffset.x,
                                          dy: viewport.minY - scrollView.contentOffset.y), visible)
            }
        }
    }

    private static func scrollViews(in view: UIView) -> [UIScrollView] {
        view.subviews.flatMap { child in
            ((child as? UIScrollView).map { [$0] } ?? []) + scrollViews(in: child)
        }
    }
}
