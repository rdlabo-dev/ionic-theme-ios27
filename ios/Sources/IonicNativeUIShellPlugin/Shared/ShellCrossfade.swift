import UIKit

@MainActor enum ShellCrossfade {
    static func duration(_ milliseconds: Double?) -> TimeInterval {
        UIAccessibility.isReduceMotionEnabled ? 0 : (milliseconds ?? 0) / 1000
    }

    static func enter(_ view: UIView, duration: TimeInterval) {
        guard duration > 0 else { return }
        view.alpha = 0
        UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseInOut, .allowUserInteraction]) {
            view.alpha = 1
        }
    }

    static func retire(_ view: UIView, duration: TimeInterval) {
        // The outgoing copy is visual only: it cannot keep accepting actions or
        // VoiceOver focus once the Web source has been restored.
        if duration > 0, let host = view.superview, let parent = host.superview,
           !view.isHidden, !host.isHidden, let copy = view.snapshotView(afterScreenUpdates: false) {
            copy.frame = host.convert(view.frame, to: parent)
            copy.alpha = CGFloat(view.layer.presentation()?.opacity ?? Float(view.alpha))
            copy.isUserInteractionEnabled = false
            copy.isAccessibilityElement = false
            copy.accessibilityElementsHidden = true
            parent.insertSubview(copy, aboveSubview: host)
            UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseInOut]) {
                copy.alpha = 0
            } completion: { _ in
                copy.removeFromSuperview()
            }
        }
        view.removeFromSuperview()
    }
}
