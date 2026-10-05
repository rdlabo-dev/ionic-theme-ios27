import UIKit

/// iOS-style anchored morph: the projected control's capsule expands into the
/// popover surface instead of a separate bubble beside it. The surface lives in
/// a window-level layer so it always draws above every shell projection.
final class ShellAnchoredMorph: UIView {
    /// Grow direction mirrors the platform: a top toolbar item grows downward
    /// from its capsule, a bottom one upward, a trailing rail item leftward.
    enum Growth { case down, up, left }
    private enum PinX { case leading, center, trailing }
    private enum PinY { case top, center, bottom }

    /// Keeps the final-size content pinned to the clip corner that does not move
    /// while the capsule grows, so the reveal slides over a still image instead
    /// of stretching it. Plain autoresizing cannot express this because the
    /// hosted view starts larger than the clip.
    private final class ClipView: UIView {
        var pinX: PinX = .trailing
        var pinY: PinY = .top
        var hostedSize = CGSize.zero
        weak var hosted: UIView?
        override func layoutSubviews() {
            super.layoutSubviews()
            guard let hosted else { return }
            let x: CGFloat = switch pinX {
            case .leading: 0
            case .center: (bounds.width - hostedSize.width) / 2
            case .trailing: bounds.width - hostedSize.width
            }
            let y: CGFloat = switch pinY {
            case .top: 0
            case .center: (bounds.height - hostedSize.height) / 2
            case .bottom: bounds.height - hostedSize.height
            }
            hosted.frame = CGRect(origin: CGPoint(x: x, y: y), size: hostedSize)
        }
    }

    private let surface = UIView()
    private let clip = ClipView()
    private let anchorView: UIView
    private let anchorFrame: CGRect
    private let targetFrame: CGRect
    private let onDismiss: () -> Void
    private var dismissStarted = false
    private var restoredAnchor = false

    private static let edgeMargin: CGFloat = 8
    /// Matches the theme's popover radius (34px) — small surfaces become capsules.
    private static let surfaceRadius: CGFloat = 34

    init(anchorView: UIView, host: ShellOverlayHost, growth: Growth, onDismiss: @escaping () -> Void) {
        self.anchorView = anchorView
        self.onDismiss = onDismiss
        let window = anchorView.window
        anchorFrame = anchorView.convert(anchorView.bounds, to: window)
        let bounds = window?.bounds ?? .zero
        let size = host.preferredContentSize
        var target = CGRect(origin: .zero, size: size)
        let leadingAligned = anchorFrame.midX < bounds.midX
        switch growth {
        case .down:
            target.origin.y = anchorFrame.minY
            target.origin.x = leadingAligned ? anchorFrame.minX : anchorFrame.maxX - size.width
        case .up:
            target.origin.y = anchorFrame.maxY - size.height
            target.origin.x = leadingAligned ? anchorFrame.minX : anchorFrame.maxX - size.width
        case .left:
            target.origin.x = anchorFrame.maxX - size.width
            target.origin.y = anchorFrame.midY - size.height * 0.25
        }
        target.origin.x = min(max(target.origin.x, Self.edgeMargin), max(Self.edgeMargin, bounds.width - Self.edgeMargin - size.width))
        target.origin.y = min(max(target.origin.y, Self.edgeMargin), max(Self.edgeMargin, bounds.height - Self.edgeMargin - size.height))
        targetFrame = target

        super.init(frame: bounds)
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
        backgroundColor = .clear

        surface.frame = anchorFrame
        surface.backgroundColor = .clear
        surface.layer.shadowColor = UIColor.black.cgColor
        surface.layer.shadowOpacity = 0.18
        surface.layer.shadowRadius = 24
        surface.layer.shadowOffset = CGSize(width: 0, height: 8)

        clip.frame = surface.bounds
        clip.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        clip.clipsToBounds = true
        clip.layer.cornerCurve = .continuous
        clip.layer.cornerRadius = anchorFrame.height / 2
        surface.addSubview(clip)

        let background: UIView
        if #available(iOS 26.0, *) {
            background = UIVisualEffectView(effect: UIGlassEffect(style: .regular))
        } else {
            background = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))
        }
        background.frame = clip.bounds
        background.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        clip.addSubview(background)

        // The hosted document keeps its final size; the growing clip reveals it
        // from the corner the morph grows away from.
        clip.hostedSize = size
        clip.pinY = growth == .up ? .bottom : growth == .left ? .center : .top
        clip.pinX = growth == .left ? .trailing : leadingAligned ? .leading : .trailing
        clip.hosted = host.view
        clip.addSubview(host.view)

        addSubview(surface)

        // The capsule becomes the surface; keep its pixels from bleeding through.
        UIView.animate(withDuration: 0.1) { anchorView.alpha = 0 }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    /// Expand the capsule into the popover surface.
    func present(animated: Bool, completion: @escaping () -> Void) {
        let animate = {
            self.surface.frame = self.targetFrame
            self.clip.layer.cornerRadius = Self.surfaceRadius
        }
        guard animated else {
            animate()
            completion()
            return
        }
        let animator = UIViewPropertyAnimator(duration: 0.38, dampingRatio: 0.82, animations: animate)
        animator.addCompletion { _ in completion() }
        animator.startAnimation()
    }

    /// Collapse the surface back into the capsule before the anchor returns.
    func dismiss(animated: Bool, completion: @escaping () -> Void) {
        guard !dismissStarted else { completion(); return }
        dismissStarted = true
        let finish = {
            self.restoreAnchor()
            self.removeFromSuperview()
            completion()
        }
        // The surface stays opaque while it shrinks so it reads as the capsule
        // itself collapsing; the real anchor swaps back in once they overlap.
        let animate = {
            self.surface.frame = self.anchorFrame
            self.clip.layer.cornerRadius = self.anchorFrame.height / 2
        }
        guard animated else {
            animate()
            finish()
            return
        }
        let animator = UIViewPropertyAnimator(duration: 0.28, dampingRatio: 0.9, animations: animate)
        animator.addCompletion { _ in finish() }
        animator.startAnimation()
    }

    private func restoreAnchor() {
        guard !restoredAnchor else { return }
        restoredAnchor = true
        anchorView.alpha = 1
    }

    /// Outside touches are eaten like a UIKit popover dismissal; the surface
    /// itself receives its own touches so the hosted web content stays live.
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        if hit === self {
            if !dismissStarted { onDismiss() }
            return dismissStarted ? nil : self
        }
        return hit
    }
}
