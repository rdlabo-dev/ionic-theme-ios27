import UIKit

/// Custom `UIPopoverBackgroundView` so fallback popovers share the anchored
/// morph's chrome: a liquid-glass surface with a 34pt continuous corner and a
/// soft drop shadow. Registered through `popoverBackgroundViewClass`, which
/// keeps everything inside the public API surface.
final class ShellPopoverBackgroundView: UIPopoverBackgroundView {
    /// `UIGlassEffect` owns its backing layer and discards an installed mask, so
    /// the silhouette mask lives on this plain clip view instead.
    private let clip = UIView()
    private let surface: UIVisualEffectView
    private let shapeMask = CAShapeLayer()
    private var edge: UIPopoverArrowDirection = .unknown
    private var centerOffset: CGFloat = 0

    /// UIKit forwards `popoverPresentationController.backgroundColor` here; the
    /// glass supplies the surface, so the backing view itself stays clear.
    override var backgroundColor: UIColor? {
        get { .clear }
        set { super.backgroundColor = .clear }
    }

    override var arrowDirection: UIPopoverArrowDirection {
        get { edge }
        set { edge = newValue; setNeedsLayout() }
    }

    override var arrowOffset: CGFloat {
        get { centerOffset }
        set { centerOffset = newValue; setNeedsLayout() }
    }

    override class func arrowBase() -> CGFloat { 26 }
    override class func arrowHeight() -> CGFloat { 13 }
    override class func contentViewInsets() -> UIEdgeInsets { .zero }

    override init(frame: CGRect) {
        if #available(iOS 26.0, *) {
            surface = UIVisualEffectView(effect: UIGlassEffect(style: .regular))
        } else {
            surface = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))
        }
        super.init(frame: frame)
        super.backgroundColor = .clear
        clip.layer.mask = shapeMask
        clip.addSubview(surface)
        addSubview(clip)
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.18
        layer.shadowRadius = 24
        layer.shadowOffset = CGSize(width: 0, height: 8)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        clip.frame = bounds
        surface.frame = clip.bounds
        shapeMask.frame = clip.bounds
        let arrowDepth = Self.arrowHeight()
        var body = bounds
        switch edge {
        case .up: body.origin.y += arrowDepth; body.size.height -= arrowDepth
        case .down: body.size.height -= arrowDepth
        case .left: body.origin.x += arrowDepth; body.size.width -= arrowDepth
        case .right: body.size.width -= arrowDepth
        default: break
        }
        let radius = min(34, min(body.width, body.height) / 2)
        let half = Self.arrowBase() / 2
        let path = UIBezierPath(roundedRect: body, cornerRadius: radius)
        switch edge {
        case .up:
            let cx = min(max(bounds.midX + centerOffset, body.minX + radius), body.maxX - radius)
            path.move(to: CGPoint(x: cx - half, y: body.minY))
            path.addLine(to: CGPoint(x: cx, y: body.minY - arrowDepth))
            path.addLine(to: CGPoint(x: cx + half, y: body.minY))
        case .down:
            let cx = min(max(bounds.midX + centerOffset, body.minX + radius), body.maxX - radius)
            path.move(to: CGPoint(x: cx + half, y: body.maxY))
            path.addLine(to: CGPoint(x: cx, y: body.maxY + arrowDepth))
            path.addLine(to: CGPoint(x: cx - half, y: body.maxY))
        case .left:
            let cy = min(max(bounds.midY + centerOffset, body.minY + radius), body.maxY - radius)
            path.move(to: CGPoint(x: body.minX, y: cy - half))
            path.addLine(to: CGPoint(x: body.minX - arrowDepth, y: cy))
            path.addLine(to: CGPoint(x: body.minX, y: cy + half))
        case .right:
            let cy = min(max(bounds.midY + centerOffset, body.minY + radius), body.maxY - radius)
            path.move(to: CGPoint(x: body.maxX, y: cy + half))
            path.addLine(to: CGPoint(x: body.maxX + arrowDepth, y: cy))
            path.addLine(to: CGPoint(x: body.maxX, y: cy - half))
        default: break
        }
        path.close()
        shapeMask.path = path.cgPath
        layer.shadowPath = path.cgPath
    }
}
