import SwiftUI
import CapacitorNativeUIKit
typealias NativeUICoveredSnapshots = CapacitorNativeUIKit.NativeUICoveredSnapshots

/// A public, non-interactive layout anchor for content hosted inside the system tab accessory.
struct NativeUICoveredSnapshotAnchor: UIViewRepresentable {
    let id: String
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        return view
    }
    func updateUIView(_ view: UIView, context: Context) { view.accessibilityIdentifier = id }
}
