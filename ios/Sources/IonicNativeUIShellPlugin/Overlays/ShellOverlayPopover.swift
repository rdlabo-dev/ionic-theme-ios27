import SwiftUI
import UIKit

struct ShellAnchoredPopover: Identifiable {
    let id: String
    let host: ShellOverlayHost
    let presented: () -> Void
}

/// SwiftUI owns the native toolbar button's standard popover presentation.
@available(iOS 26.0, *)
struct ShellOverlayPopover: View {
    let presentation: ShellAnchoredPopover

    private struct Content: UIViewControllerRepresentable {
        let host: ShellOverlayHost
        func makeUIViewController(context: Context) -> ShellOverlayHost { host }
        func updateUIViewController(_ controller: ShellOverlayHost, context: Context) {}
    }

    var body: some View {
        let host = presentation.host
        Content(host: host)
            .frame(width: host.preferredContentSize.width, height: host.preferredContentSize.height)
            .presentationCompactAdaptation(.popover)
            .preferredColorScheme(host.options?["dark"] as? Bool == true ? .dark : .light)
            .interactiveDismissDisabled(host.options?["backdropDismiss"] as? Bool == false)
            .presentationBackground(Color(uiColor: ShellRendering().color(host.options?["backgroundColor"] as? String)))
            .onAppear { host.anchoredVisible = true; presentation.presented() }
            .onDisappear {
                host.anchoredVisible = false
                let finished = host.anchoredDidDismiss
                host.anchoredDidDismiss = nil
                finished?()
            }
    }
}
