import UIKit

final class ShellRendering {
    private var images: [String: UIImage] = [:]
    func clear() { images.removeAll() }

    func image(_ item: ShellItemContent) -> UIImage? {
        guard let data = item.icon, let width = item.iconWidth, width > 0 else { return nil }
        let template = item.iconTemplate == true
        let key = (template ? "template:" : "original:") + data
        if let cached = images[key] { return cached }
        guard let bytes = Data(base64Encoded: data), let raw = UIImage(data: bytes), let cg = raw.cgImage else { return nil }
        let result = UIImage(cgImage: cg, scale: CGFloat(cg.width) / width, orientation: .up)
            .withRenderingMode(template ? .alwaysTemplate : .alwaysOriginal)
        if images.count >= 128 { images.removeAll() }
        images[key] = result
        return result
    }

    func color(_ css: String?) -> UIColor {
        guard let css else { return .label }
        let numbers = css.components(separatedBy: CharacterSet(charactersIn: "0123456789.").inverted).compactMap(Double.init)
        guard numbers.count >= 3 else { return .label }
        return UIColor(red: numbers[0] / 255, green: numbers[1] / 255, blue: numbers[2] / 255,
                       alpha: numbers.count > 3 ? numbers[3] : 1)
    }
}
