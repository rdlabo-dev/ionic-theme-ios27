import Capacitor
import UIKit

func shellRect(_ node: JSObject) -> CGRect? {
    guard let x = node["x"] as? Double, let y = node["y"] as? Double,
          let width = node["width"] as? Double, let height = node["height"] as? Double,
          [x, y, width, height].allSatisfy({ $0.isFinite }), width > 0, height > 0 else { return nil }
    return CGRect(x: x, y: y, width: width, height: height)
}

final class ShellRendering {
    private var images: [String: UIImage] = [:]
    func clear() { images.removeAll() }

    func image(_ item: JSObject) -> UIImage? {
        guard let data = item["icon"] as? String, let width = item["iconWidth"] as? Double, width > 0 else { return nil }
        let template = item["iconTemplate"] as? Bool == true
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
