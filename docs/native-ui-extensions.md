---
title: App-local Native UI extensions
---

# App-local Native UI extensions

An extension projects your existing Web UI into a SwiftUI View. Keep both definitions in your application: no npm package, separate library, or Capacitor plugin is required. The Web element remains the source of truth and the fallback UI.

## 1. Define a DOM reader

```ts
// src/native-ui/counter.ts
import { defineNativeUI } from '@rdlabo/ionic-theme-ios27/native';

export const counter = defineNativeUI({
  name: 'app.counter',
  selector: '[data-counter]',
  read(element) {
    return {
      props: { count: Number(element.getAttribute('data-count') ?? 0) },
      actions: { increment: element.querySelector<HTMLButtonElement>('button') },
    };
  },
});
```

For example, render `<div data-counter data-count="0"><button>Increment</button></div>` with your framework. Its click handler updates the Web state and `data-count` attribute. The shell observes DOM changes and sends the new props to SwiftUI. State held only in JavaScript variables must first be reflected in the DOM.

The reader is synchronous and read-only. Return `null` when the source should stay on the Web. Props are a JSON object (finite numbers, strings, booleans, null, arrays and objects), limited to 64K characters. Action names map to the source itself or its descendants; missing, hidden and disabled targets cannot be activated. Up to 30 actions are supported per source.

## 2. Register a SwiftUI View in the app target

Add a Swift file to the application's Xcode target. Import `IonicNativeUIShellPlugin`, the module supplied by the theme's existing Capacitor installation.

```swift
import SwiftUI
import IonicNativeUIShellPlugin

struct CounterProps: Decodable {
    let count: Int
}

struct CounterView: View {
    let props: CounterProps
    let actions: NativeUIActions
    @State private var error: String?

    var body: some View {
        HStack {
            Text("Count: \(props.count)")
            Button("Increment") {
                Task { @MainActor in
                    do {
                        try await actions.activate("increment")
                        error = nil
                    } catch {
                        self.error = "Action unavailable"
                    }
                }
            }
            if let error { Text(error) }
        }
    }
}

@MainActor func registerAppNativeUI() throws {
    try NativeUIShell.register("app.counter") {
        (props: CounterProps, actions: NativeUIActions) in
        CounterView(props: props, actions: actions)
    }
}
```

Call `registerAppNativeUI()` once from `application(_:didFinishLaunchingWithOptions:)`, before JavaScript enables the shell. Handle a registration error there; duplicate or empty names are rejected. Swift source is compiled into the app, so adding or changing a View requires an iOS rebuild. Registration is synchronous setup, not a native bridge command.

## 3. Enable with local definitions

```ts
import { enableNativeUIShell } from '@rdlabo/ionic-theme-ios27/native';
import { counter } from './native-ui/counter';

const shell = await enableNativeUIShell({ extensions: [counter] });
```

Keep extension objects stable across repeated enable calls. Changing extensions while running requires `await shell.destroy()` first. Extension names must be unique within an activation. Do not register overlapping selectors for the same source. An extension owns its source subtree, so built-in controls inside it are not projected separately.

## Content and placement are independent

| `placement` | Behavior |
| --- | --- |
| Omitted or `'element'` | Hosts the View in the source element's Web frame on iOS 26+. |
| `'tab-accessory'` | Attaches the View to the system SwiftUI tab accessory on iOS 26.1+. |

For `tab-accessory`, place the source inside its owning `ion-tabs`. The shell resolves that tabs element's `ion-tab-bar`; applications do not pass native controller references. Currently only the **Vertical Bars SwiftUI tab host** supports this placement. Ordinary UIKit tab bars, missing native tabs, iOS 26.0, or multiple competing accessories keep the source on the Web. The shell does not approximate a system accessory with a floating overlay. Keep an equivalent Web layout (for example, a fixed footer); the source retains its layout space while hidden.

`enableVerticalControlArea({ extensions: [...] })` also accepts extensions. In this standalone mode only accessories belonging to native Vertical Bars are eligible; ordinary element projections require `enableNativeUIShell`.

## Lifecycle and action completion

The shell owns discovery, geometry, state synchronization, native controller containment, overlay retirement, suspension and teardown. Extensions do not implement attach/detach hooks. Web sources are hidden only after native accepts the projection. An unregistered renderer, incompatible Swift props, unsupported placement or failed reader leaves that instance on the Web. Existing shell overlay policy applies; extensions return to the Web while Web overlays cover the page.

Element placement requires the source to fit fully inside the viewport and its ancestors' overflow clipping bounds, including Ionic's shadow scroll containers. Partially clipped sources stay on the Web and become eligible again when scrolled fully into view. Tab accessories use the system host's placement instead.

`try await actions.activate(name)` completes after the original Web element receives its click. It does **not** wait for application work launched by the click handler (network requests, navigation or modal presentation). Disabled, removed or stale actions reject; teardown, Swift task cancellation and bridge timeouts settle pending calls. The bridge acknowledgement is a Capacitor Promise method.

The [demo reader](../demo/src/native-ui/counter.ts) and [demo SwiftUI View](../demo/ios/App/App/NativeUICounter.swift) show both placements using app-local files. Open the Native UI Shell demo page to compare native projection with its Web fallback.

For a complete application feature, see the [SwiftUI mini-player example](./native-mini-player.md): artwork, track metadata, playback controls and swipe-to-open, all defined in the demo application.
