---
title: App-local Native UI extensions
---

# App-local Native UI extensions

An extension projects your existing Web UI into a SwiftUI View. Keep both definitions in your application: no npm package, separate library, or Capacitor plugin is required. The Web element remains the source of truth and the fallback UI.

## Before you start

Complete [Ionic setup](setup.md) or [HTML setup](framework-independent.md) first. You need access to the iOS app target to add a SwiftUI View. The examples below use the Ionic entry; without Ionic, import both `defineNativeUI` and `enableNativeUIShell` from `@rdlabo/capacitor-native-ui/core`.

## 1. Define a DOM reader

```ts
// src/native-ui/counter.ts
import { defineNativeUI } from '@rdlabo/capacitor-native-ui';

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

For example, render `<div data-counter data-count="0"><button>Increment</button></div>` with your framework. Its click handler updates the Web state and `data-count` attribute. The shell observes DOM changes and sends the new props to SwiftUI. State rendered into DOM attributes or text is observed automatically. For properties or external state read by the reader that do not mutate the DOM, call `shell.markForCheck()` after changing them.

The reader is synchronous and read-only. Return `null` when the source should stay on the Web. Props are a JSON object (finite numbers, strings, booleans, null, arrays and objects), limited to 64K characters. Action names map to the source itself or its descendants; missing, hidden and disabled targets cannot be activated. Up to 30 actions are supported per source.

## 2. Register a SwiftUI View in the app target

Add a Swift file to the application's Xcode target. Import `IonicNativeUIShellPlugin`, the module supplied by `@rdlabo/capacitor-native-ui`. Follow the [Native UI Shell setup](native-ui-shell.md#enable-the-shell) first.

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
import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui';
import { counter } from './native-ui/counter';

const shell = await enableNativeUIShell({ extensions: [counter] });
```

Replace your existing startup call with the one above; do not start a second shell.

Keep extension objects stable across repeated enable calls. Changing extensions while running requires `await shell.destroy()` first. Extension names must be unique within an activation. Do not register overlapping selectors for the same source. An extension owns its source subtree, so built-in controls inside it are not projected separately.

## 4. Build and try the extension

Build your Web assets, run `npx cap sync ios`, and rebuild the iOS app in Xcode. On iOS 26+, the counter should render with SwiftUI. Tap Increment: the original Web handler should update `data-count`, and the native count should follow. In a browser, the original Web counter should still work.

If the source stays on the Web, confirm that the Swift file belongs to the app target, registration runs before startup, and the names and props agree on both sides.

## Content and placement are independent

| `placement` | Behavior |
| --- | --- |
| Omitted or `'element'` | Hosts the View in the source element's Web frame on iOS 26+. |
| `'tab-accessory'` | Attaches the View to a projected tab bar's system SwiftUI tab accessory on iOS 26.1+. |

For `tab-accessory`, place the source inside its owning `ion-tabs`. The shell resolves that tabs element's `ion-tab-bar`; applications do not pass native controller references. Currently only the **Vertical Bars SwiftUI tab host** supports this placement. Ordinary UIKit tab bars, missing native tabs, iOS 26.0, or multiple competing accessories keep the source on the Web. The shell does not approximate a system accessory with a floating overlay. Keep an equivalent Web layout (for example, a fixed footer); the source retains its layout space while hidden.

`enableVerticalControlArea({ extensions: [...] })` also accepts extensions. In this standalone mode only accessories belonging to native Vertical Bars are eligible; ordinary element projections require `enableNativeUIShell`.

## Read source geometry and presentation state

The shell measures the source DOM element automatically. With the default `element` placement, it positions and sizes the SwiftUI host to match that rectangle. You do not need to send coordinates in `props` or position the native view yourself.

Use the three-argument registration closure to receive that information:

```swift
try NativeUIShell.register("app.counter") {
    (props: CounterProps, actions: NativeUIActions, context: NativeUIContext) in
    CounterView(props: props, actions: actions)
        .padding(.horizontal, context.sourceFrame.width < 240 ? 4 : 12)
}
```

The existing `(props, actions)` closure remains supported. Both forms use the same registration names and duplicate-name checks.

| Context property | Meaning |
| --- | --- |
| `sourceID` | Opaque source identity for its current lifetime; not the HTML `id`. |
| `sourceFrame` | DOM `getBoundingClientRect()` in CSS pixels relative to the Web viewport, including `x`, `y`, `width`, and `height`. |
| `sourceFrameInWebView` | The source rectangle converted to UIKit points in the WebView's local coordinate system; not screen coordinates. |
| `viewportWidth` | CSS viewport width used for that snapshot's coordinate conversion. |
| `pointsPerCSSPixel` | UIKit points per CSS pixel; not device pixel density. |
| `placement` | `.element` or `.tabAccessory`. |
| `colorScheme` | `.light` or `.dark`, also applied to the SwiftUI environment. |
| `layoutDirection` | `.leftToRight` or `.rightToLeft`, also applied to the SwiftUI environment. |

The closure receives a fresh context when the shell applies an updated snapshot, including source movement, resizing, and appearance changes. Use the current context rather than caching its geometry in `@State`. Updates cross the Web/native bridge; they are not a synchronous DOM measurement from Swift.

For `tabAccessory`, `sourceFrame` still describes the original DOM element. The system assigns the accessory's actual location and size. Use SwiftUI's `GeometryReader` inside your View for the actual local space in either placement:

```swift
GeometryReader { geometry in
    CounterView(props: props, actions: actions)
        .frame(width: geometry.size.width, height: geometry.size.height)
}
```

Do not apply `sourceFrame.x` or `y` as another SwiftUI offset: the shell already positions the host for `element`. Your View lays out its contents within that host.

## Use the shared projection capabilities

| Capability | How an extension uses it |
| --- | --- |
| Position and size | Automatic host placement plus `NativeUIContext`; actual local bounds through `GeometryReader`. |
| Dark mode and RTL | `context` or SwiftUI `@Environment(\.colorScheme)` and `@Environment(\.layoutDirection)`. |
| Reduce Motion and accessibility | SwiftUI environment values such as `@Environment(\.accessibilityReduceMotion)` and native accessibility modifiers. Give custom controls accessible names. |
| DOM-backed application state | Return JSON `props` from `read(element)`; DOM changes trigger synchronization. For changes without a DOM mutation, call `shell.markForCheck()`. |
| Enabled/visible action targets | `actions.availableNames` or `actions.isAvailable("increment")`; unavailable DOM targets are omitted. |
| Invoke the original Web action | `try await actions.activate("increment")`; completion and failure follow the contract below. |
| Temporary Web fallback and teardown | Managed automatically for unsupported content, overlays, navigation suspension, and source removal. |
| Application-controlled suspension | Use the shell handle's `suspend()`, the returned token's `resume()`, and `destroy()` from JavaScript. |

For example, disable a native button when its original action is unavailable:

```swift
Button("Increment") {
    Task { @MainActor in
        do { try await actions.activate("increment") }
        catch { /* Present an application-appropriate error. */ }
    }
}
.disabled(!actions.isAvailable("increment"))
```

Availability is a snapshot, not a reservation: a target can disappear before activation, so handle errors too. Custom text, selected state, fonts, colors, and badges belong in your extension's `props` and SwiftUI View; the shell does not infer a custom component's visual structure from CSS. Read the desired element's computed styles and attributes in your reader. Use the shared image and color conversion APIs below instead of reimplementing those transformations.

## Schedule a source check

DOM attributes, text, children, observed element sizes, scrolling, and supported lifecycle events trigger automatic checks. The shell does not poll JavaScript variables or arbitrary DOM properties. After changing state that your reader uses without a DOM mutation, request a check:

```ts
source.playbackPosition = newPosition; // An application-defined property read by your extension.
shell.markForCheck();
```

`markForCheck(): void` schedules a re-read and geometry measurement; it does not update the application's DOM or force a native redraw. Repeated calls are batched, and unchanged snapshots are not sent. A call during a bridge update schedules another check afterwards. Suspended projection stays suspended until resumed. Calls after `destroy()` or in an environment without a projection runtime do nothing.

Call after your framework has committed any relevant DOM changes. This API does not trigger Angular change detection, React rendering, or Vue rendering, and it is not a promise that waits for native completion. It also works for standard controls when their properties change without an observable mutation.

## Reuse native artwork and color conversion

A reader's second argument exposes the standard SVG capture and rasterization path. It accepts a local `svg` or a resolved `ion-icon` belonging to the source and returns an **opaque image reference**, or `null` for unsupported artwork. Return the reference in `props`; do not try to read image bytes synchronously:

```ts
const badge = defineNativeUI({
  name: 'app.badge',
  selector: '[data-badge]',
  read(element, context) {
    return {
      props: {
        icon: context.image(element.querySelector<HTMLElement>('ion-icon')),
        color: getComputedStyle(element).color,
      },
    };
  },
});
```

Before sending the snapshot, the shell resolves references into `{ data, width, height, template }`: base64 PNG data, CSS dimensions, and rendering mode. Nested references and copies are supported; the `$nativeUIImage` key is reserved for references returned by the current read context. Use `{ template: true }` as the second argument to `image()` when SwiftUI should tint the icon; the default preserves source colors. The same local SVG restrictions, RTL capture, display-scale rasterization, and image cache used by standard controls apply. External resources and unsupported SVG content return `null`; unresolved `ion-icon` content should retain your Web fallback until loaded. Rasterization failure or props exceeding the size limit keeps that extension on the Web.

On iOS, decode the resulting value with `NativeUIImage` and use the shared converters:

```swift
struct BadgeProps: Decodable {
    let icon: NativeUIImage?
    let color: String
}

struct BadgeView: View {
    let props: BadgeProps
    var body: some View {
        if let icon = props.icon, let image = NativeUIRendering.image(icon) {
            Image(uiImage: image)
                .foregroundStyle(Color(uiColor: NativeUIRendering.color(props.color)))
        }
    }
}
```

`NativeUIRendering.image` returns `nil` for invalid image data. `NativeUIRendering.color` accepts computed `rgb()`/`rgba()` values; unsupported formats use `.label`, or the `fallback:` color you pass. Both are shared with the standard native renderers. They do not evaluate CSS selectors, variables, named colors, or arbitrary stylesheets.

## Lifecycle and action completion

The shell owns discovery, geometry, state synchronization, native controller containment, overlay retirement, suspension and teardown. Extensions do not implement attach/detach hooks. Web sources are hidden only after native accepts the projection. An unregistered renderer, incompatible Swift props, unsupported placement or failed reader leaves that instance on the Web. Existing shell overlay policy applies; extensions return to the Web while Web overlays cover the page.

Element placement requires the source to fit fully inside the viewport and its ancestors' overflow clipping bounds, including Ionic's shadow scroll containers. Partially clipped sources stay on the Web and become eligible again when scrolled fully into view. Tab accessories use the system host's placement instead.

`try await actions.activate(name)` completes after the original Web element receives its click. It does **not** wait for application work launched by the click handler (network requests, navigation or modal presentation). Disabled, removed or stale actions reject; teardown, Swift task cancellation and bridge timeouts settle pending calls. The bridge acknowledgement is a Capacitor Promise method.

The [demo reader](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/demo/src/native-ui/counter.ts) and [demo SwiftUI View](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/demo/ios/App/App/NativeUICounter.swift) show both placements using app-local files. Open the Native UI Shell demo page to compare native projection with its Web fallback.

For a complete application feature, see the [SwiftUI mini-player example](native-mini-player.md): artwork, track metadata, playback controls and swipe-to-open, all defined in the demo application.
