import UIKit

final class NativeUIControlRendering {
    private var images: [String: UIImage] = [:]
    func clear() { images.removeAll() }

    func image(_ item: NativeUIItemContent) -> UIImage? {
        guard let data = item.icon, let width = item.iconWidth else { return nil }
        let template = item.iconTemplate == true
        let key = "\(width):" + (template ? "template:" : "original:") + data
        if let cached = images[key] { return cached }
        guard let result = NativeUIRendering.image(NativeUIImage(data: data, width: width, height: item.iconHeight ?? width, template: template)) else { return nil }
        if images.count >= 128 { images.removeAll() }
        images[key] = result
        return result
    }

    func color(_ css: String?) -> UIColor {
        NativeUIRendering.color(css)
    }
}
