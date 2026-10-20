import SwiftUI
import NativeUIPlugin

private struct CounterProps: Decodable {
    let count: Int
}

private struct CounterView: View {
    let props: CounterProps
    let actions: NativeUIActions
    let accessory: Bool
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        HStack {
            Text("\(accessory ? "Accessory count" : "Count"): \(props.count)")
            Button(accessory ? "Increment native accessory" : "Increment native counter") {
                busy = true
                Task { @MainActor in
                    defer { busy = false }
                    do {
                        try await actions.activate("increment")
                        error = nil
                    } catch {
                        self.error = "Action unavailable"
                    }
                }
            }
            .disabled(busy)
            if let error { Text(error).font(.caption) }
        }
        .padding(.horizontal)
    }
}

@MainActor func registerNativeUICounter() throws {
    for name in ["demo.counter", "demo.accessory-counter"] {
        try NativeUI.register(name) { (props: CounterProps, actions: NativeUIActions) in
            CounterView(props: props, actions: actions, accessory: name == "demo.accessory-counter")
        }
    }
}
