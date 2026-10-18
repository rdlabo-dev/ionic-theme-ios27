import UIKit

/// Image returned by the TypeScript read context's image() helper.
public struct NativeUIImage: Decodable {
    public let data: String
    public let width: Double
    public let height: Double
    public let template: Bool

    public init(data: String, width: Double, height: Double, template: Bool = false) {
        self.data = data
        self.width = width
        self.height = height
        self.template = template
    }
}

/// Conversion primitives shared by standard controls and app-local extensions.
public enum NativeUIRendering {
    /// Decodes base64 PNG artwork at its declared CSS size. Returns nil for invalid data.
    public static func image(_ image: NativeUIImage) -> UIImage? {
        guard image.width.isFinite, image.height.isFinite, image.width > 0, image.height > 0,
              let bytes = Data(base64Encoded: image.data), let raw = UIImage(data: bytes), let cg = raw.cgImage else { return nil }
        return UIImage(cgImage: cg, scale: CGFloat(cg.width) / image.width, orientation: .up)
            .withRenderingMode(image.template ? .alwaysTemplate : .alwaysOriginal)
    }

    /// Converts computed rgb()/rgba() colors used by standard readers. Other CSS formats use the fallback.
    public static func color(_ css: String?, fallback: UIColor = .label) -> UIColor {
        guard let css, css.hasPrefix("rgb(") || css.hasPrefix("rgba("), !css.contains("%") else { return fallback }
        let numbers = css.components(separatedBy: CharacterSet(charactersIn: "0123456789.-").inverted).compactMap(Double.init)
        guard (numbers.count == 3 || numbers.count == 4), numbers.allSatisfy(\.isFinite) else { return fallback }
        return UIColor(red: min(255, max(0, numbers[0])) / 255,
                       green: min(255, max(0, numbers[1])) / 255,
                       blue: min(255, max(0, numbers[2])) / 255,
                       alpha: numbers.count == 4 ? min(1, max(0, numbers[3])) : 1)
    }
}
