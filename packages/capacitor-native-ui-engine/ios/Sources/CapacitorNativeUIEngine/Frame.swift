import CoreGraphics
public struct NativeUIFrame: Codable, Equatable {
 public let x: Double
 public let y: Double
 public let width: Double
 public let height: Double
 public init(x: Double, y: Double, width: Double, height: Double) { self.x = x; self.y = y; self.width = width; self.height = height }
 public var rect: CGRect { CGRect(x: x, y: y, width: width, height: height) }
 public var isValid: Bool { [x, y, width, height].allSatisfy(\.isFinite) && width > 0 && height > 0 }
}
public struct NativeUIScrollNode: Decodable {
 public let id: String
 public let scroll: NativeUIScrollPlacement?
 public init(id: String, scroll: NativeUIScrollPlacement?) { self.id = id; self.scroll = scroll }
}
