import UIKit
/// Keeps native content at full size while clipping hit testing and visible pixels.
public final class NativeUIClippedView: UIView {
 public let content: UIView
 public init(content: UIView) { self.content = content; super.init(frame: .zero); addSubview(content) }
 @available(*, unavailable) required init?(coder: NSCoder) { fatalError() }
 public func place(_ frame: CGRect, clip: CGRect? = nil) {
  clipsToBounds = clip != nil
  let visible = clip.map { frame.intersection($0) } ?? frame
  isHidden = visible.isNull || visible.isEmpty
  guard !isHidden else { return }
  if self.frame != visible { self.frame = visible }
  let local = CGRect(x: frame.minX - visible.minX, y: frame.minY - visible.minY, width: frame.width, height: frame.height)
  if content.frame != local { content.frame = local }
 }
}
