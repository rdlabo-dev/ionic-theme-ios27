import UIKit

/// Reads public accessibility geometry after the system has laid out its rail.
/// IDs bind measurements to current DOM controls without private class names.
/// Compact square ancestors approximate the system button surface; this remains
/// a layout heuristic and invalid measurements fall back to Web CSS.
enum NativeUIVerticalBarsGeometry {
    static func measure(in root: UIView, relativeTo webView: UIView, ids: Set<String>) -> [String: CGRect] {
        guard let window = root.window, window === webView.window else { return [:] }
        root.layoutIfNeeded()
        var result: [String: CGRect] = [:]
        var visited = Set<ObjectIdentifier>()
        func visit(_ object: NSObject, depth: Int) {
            guard depth < 40, visited.count < 2000, visited.insert(ObjectIdentifier(object)).inserted else { return }
            if let id = (object as? UIView)?.accessibilityIdentifier ?? (object as? UIAccessibilityElement)?.accessibilityIdentifier, ids.contains(id) {
                let screenFrame = object.accessibilityFrame
                let frame = (object as? UIView).map { view -> CGRect in
                    var surface = view
                    var ancestor = view.superview
                    while let current = ancestor, current !== root,
                          current.bounds.width < 100, current.bounds.height < 100 {
                        if current.bounds.width >= max(surface.bounds.width, 1), current.bounds.height >= max(surface.bounds.height, 1),
                           abs(current.bounds.width - current.bounds.height) < 1 { surface = current }
                        ancestor = current.superview
                    }
                    return surface.convert(surface.bounds, to: webView)
                } ?? webView.convert(screenFrame, from: window.screen.coordinateSpace)
                if !frame.isNull, !frame.isInfinite, frame.width > 0, frame.height > 0,
                   webView.bounds.intersects(frame), frame.width < webView.bounds.width * 0.75 {
                    // UIKit may expose a label and its larger button with the same ID.
                    if result[id] == nil || frame.width * frame.height > result[id]!.width * result[id]!.height {
                        result[id] = frame
                    }
                }
            }
            if let view = object as? UIView { view.subviews.forEach { visit($0, depth: depth + 1) } }
            if object === webView { return }
            if let elements = object.accessibilityElements {
                elements.compactMap { $0 as? NSObject }.forEach { visit($0, depth: depth + 1) }
            } else {
                let count = object.accessibilityElementCount()
                if count > 0 && count < 200 {
                    for index in 0..<count {
                        if let element = object.accessibilityElement(at: index) as? NSObject { visit(element, depth: depth + 1) }
                    }
                }
            }
        }
        visit(root, depth: 0)
        return result
    }
    /// When AX is lazy, bind the visible UIKit controls by the same start/end
    /// ordering used by our toolbar. A count mismatch declines the measurement.
    static func componentFrames(in root: UIView, relativeTo webView: UIView, controls: [NativeUIControl]) -> [String: CGRect] {
        guard controls.allSatisfy({ [.button, .buttons, .backButton, .menuButton, .tabBar].contains($0.kind) }),
              controls.allSatisfy({ $0.search == nil }) else { return [:] }
        let ordered = controls.filter { $0.kind != .tabBar && ($0.toolbarSlot == .start || $0.kind == .backButton) }
            + controls.filter { $0.kind != .tabBar && $0.toolbarSlot != .start && $0.kind != .backButton }
            + controls.filter { $0.kind == .tabBar }
        var frames: [CGRect] = []
        func visit(_ view: UIView) {
            guard !view.isHidden, view.alpha > 0.05 else { return }
            if view is UIControl {
                var surface = view
                var ancestor = view.superview
                while let current = ancestor, current !== root, current.bounds.width < 100, current.bounds.height < 100 {
                    if current.bounds.width >= surface.bounds.width, current.bounds.height >= surface.bounds.height,
                       abs(current.bounds.width - current.bounds.height) < 1 { surface = current }
                    ancestor = current.superview
                }
                let frame = surface.convert(surface.bounds, to: webView)
                if frame.width > 0, frame.height > 0, frame.width < 100, frame.height < 100,
                   webView.bounds.contains(frame), !frames.contains(frame) { frames.append(frame) }
                return
            }
            view.subviews.forEach(visit)
        }
        visit(root)
        guard frames.count == ordered.reduce(0, { $0 + $1.items.count }) else { return [:] }
        frames.sort { $0.midY < $1.midY }
        guard let first = frames.first, frames.allSatisfy({ abs($0.midX - first.midX) < 2 }),
              zip(frames, frames.dropFirst()).allSatisfy({ $0.midY < $1.midY }) else { return [:] }
        var result: [String: CGRect] = [:]
        var offset = 0
        for control in ordered {
            result[control.id] = frames[offset..<(offset + control.items.count)].reduce(CGRect.null) { $0.union($1) }
            offset += control.items.count
        }
        return result
    }

}
