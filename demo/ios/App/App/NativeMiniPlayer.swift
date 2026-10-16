import SwiftUI
import IonicNativeUIShellPlugin

private struct MiniPlayerProps: Decodable {
    let title: String
    let artist: String
    let playing: Bool
    let elapsed: Double
    let duration: Double
}

@available(iOS 26.0, *)
private struct MiniPlayerView: View {
    let props: MiniPlayerProps
    let actions: NativeUIActions
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @GestureState private var lift: CGFloat = 0
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 2) {
            HStack(spacing: 12) {
                Button { activate("open") } label: {
                    HStack(spacing: 10) {
                        Image("MiniPlayerArtwork")
                            .resizable().scaledToFill()
                            .frame(width: 40, height: 40).clipShape(.rect(cornerRadius: 8))
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(props.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                            Text(props.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .accessibilityLabel("Open Now Playing")
                .accessibilityIdentifier("mini-player-open")
                .simultaneousGesture(DragGesture(minimumDistance: 12)
                    .updating($lift) { value, state, _ in
                        if abs(value.translation.height) > abs(value.translation.width) {
                            state = max(-64, min(0, value.translation.height))
                        }
                    }
                    .onEnded { value in
                        if value.translation.height < -32 && abs(value.translation.height) > abs(value.translation.width) {
                            activate("open")
                        }
                    })
                if placement != .inline {
                    Text("\(time(props.elapsed)) / \(time(props.duration))")
                        .font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                }
                Button { activate("toggle") } label: {
                    Image(systemName: props.playing ? "pause.fill" : "play.fill")
                        .font(.title3).frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                }
                .accessibilityLabel(props.playing ? "Pause" : "Play")
                .accessibilityIdentifier("mini-player-playback")
            }
            if placement != .inline {
                ProgressView(value: min(max(0, props.elapsed), max(1, props.duration)), total: max(1, props.duration))
                    .accessibilityLabel("Track progress")
            }
            if let error { Text(error).font(.caption2).foregroundStyle(.secondary) }
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .padding(.horizontal, 12).padding(.vertical, 4)
        .offset(y: lift).opacity(1 + lift / 160)
        .animation(reduceMotion ? nil : .snappy(duration: 0.2), value: lift == 0)
    }

    private func time(_ seconds: Double) -> String {
        let value = Int(max(0, seconds))
        return String(format: "%d:%02d", value / 60, value % 60)
    }

    private func activate(_ name: String) {
        guard !busy else { return }
        busy = true
        Task { @MainActor in
            defer { busy = false }
            do { try await actions.activate(name); error = nil }
            catch { self.error = "Action unavailable" }
        }
    }
}

@MainActor func registerNativeMiniPlayer() throws {
    guard #available(iOS 26.0, *) else { return }
    try NativeUIShell.register("demo.mini-player") { (props: MiniPlayerProps, actions: NativeUIActions) in
        MiniPlayerView(props: props, actions: actions)
    }
}
