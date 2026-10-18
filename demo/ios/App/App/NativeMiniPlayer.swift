import SwiftUI
import IonicNativeUIShellPlugin

private struct MiniPlayerProps: Decodable {
    let title: String
    let artist: String
    let playing: Bool
}

@available(iOS 26.0, *)
private struct MiniPlayerView: View {
    let props: MiniPlayerProps
    let actions: NativeUIActions
    let context: NativeUIContext
    @State private var busy = false
    @State private var showError = false

    var body: some View {
        HStack(spacing: context.sourceFrame.width < 240 ? 2 : 4) {
            Button { activate("open") } label: {
                HStack(spacing: 10) {
                    AlbumArtwork()
                        .frame(width: 32, height: 32)
                        .clipShape(.rect(cornerRadius: 6))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(props.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        Text(props.artist)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .contentShape(Rectangle())
            }
            .layoutPriority(1)
            .accessibilityLabel("Open Now Playing")
            .accessibilityIdentifier("mini-player-open")
            .disabled(!actions.isAvailable("open"))
            .simultaneousGesture(DragGesture(minimumDistance: 16).onEnded { value in
                if value.translation.height < -32 && abs(value.translation.height) > abs(value.translation.width) {
                    activate("open")
                }
            })
            Button { activate("toggle") } label: {
                Image(systemName: props.playing ? "pause.fill" : "play.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(props.playing ? "Pause" : "Play")
            .accessibilityIdentifier("mini-player-playback")
            .disabled(!actions.isAvailable("toggle"))
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .padding(.leading, 10)
        .padding(.trailing, 2)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .glassEffect(.regular, in: .capsule)
        .alert("Action unavailable", isPresented: $showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Please try again.")
        }
    }

    private func activate(_ name: String) {
        guard !busy else { return }
        busy = true
        Task { @MainActor in
            defer { busy = false }
            do { try await actions.activate(name) }
            catch { showError = true }
        }
    }
}

private struct AlbumArtwork: View {
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                LinearGradient(colors: [Color(red: 0.13, green: 0.16, blue: 0.35), Color(red: 0.7, green: 0.31, blue: 0.43)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                Circle().fill(Color(red: 1, green: 0.76, blue: 0.55))
                    .frame(width: geometry.size.width * 0.44)
                    .offset(x: geometry.size.width * 0.12, y: -geometry.size.height * 0.08)
                Rectangle().fill(Color(red: 0.1, green: 0.17, blue: 0.27))
                    .frame(height: geometry.size.height * 0.38)
                    .frame(maxHeight: .infinity, alignment: .bottom)
            }
        }
    }
}

@MainActor func registerNativeMiniPlayer() throws {
    guard #available(iOS 26.0, *) else { return }
    try NativeUIShell.register("demo.mini-player") { (props: MiniPlayerProps, actions: NativeUIActions, context: NativeUIContext) in
        MiniPlayerView(props: props, actions: actions, context: context)
    }
}
