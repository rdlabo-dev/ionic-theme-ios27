---
title: App-local Native UI extensions (experimental)
---

# App-local Native UI extensions (experimental)

> **Experimental:** The extension API, native registration interfaces and behavior may change in future releases. This applies to both SwiftUI and Kotlin/Compose extensions, including `element` and `tab-accessory` placement.

> This guide targets the upcoming package split. Until the first native package release, use the [candidate archive installation](../README.md#try-the-unreleased-packages) in place of registry install commands.

An extension projects your existing Web UI into a SwiftUI View on iOS or Jetpack Compose content on Android. Keep both definitions in your application: no npm package, separate library, or Capacitor plugin is required. The Web element remains the source of truth and the fallback UI.

## Before you start

Start with an existing Capacitor 8 app and install the plugin if you have not already:

```sh
npm install @rdlabo/capacitor-native-ui
```

Choose the native platform you want to support:

- **Android:** use your Capacitor Android project and an API 24+ device or emulator. Follow step 1, then the [Kotlin/Compose registration](#2b-register-compose-content-on-android), and steps 3–4. No iOS project, Xcode, Ionic, or theme package is required.
- **iOS:** use your Capacitor iOS project, Xcode 26+, and an iOS 26+ device or simulator. Follow step 1, the [SwiftUI registration](#2a-register-a-swiftui-view-on-ios), and steps 3–4. To also project standard controls, follow [Ionic setup](setup.md) or [HTML setup](framework-independent.md).
- **Both:** share the DOM reader from step 1 and register native content for the same name on each platform.

The TypeScript examples below use the Ionic entry. Without Ionic, import both `defineNativeUI` and `enableNativeUI` from `@rdlabo/capacitor-native-ui/core`.

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

For example, use this Web source. Its reserved space also accommodates native content and an action error:

```html
<div data-counter data-count="0" style="width: 280px; min-height: 128px">
  <p data-count-label>Count: 0</p>
  <button type="button">Increment</button>
</div>
```

Keep your framework's click handler updating the count and `data-count`. In plain HTML, this is enough:

```ts
const source = document.querySelector<HTMLElement>('[data-counter]')!;
source.querySelector('button')!.addEventListener('click', () => {
  const count = Number(source.dataset.count ?? 0) + 1;
  source.dataset.count = String(count);
  source.querySelector('[data-count-label]')!.textContent = `Count: ${count}`;
});
```
 The shell observes DOM changes and sends the new props to the native content. State rendered into DOM attributes or text is observed automatically. For properties or external state read by the reader that do not mutate the DOM, call `shell.markForCheck()` after changing them.

The reader is synchronous and read-only. Return `null` when the source should stay on the Web. Props are a JSON object (finite numbers, strings, booleans, null, arrays and objects), limited to 64K characters. Action names map to the source itself or its descendants; missing, hidden and disabled targets cannot be activated. Up to 30 actions are supported per source.

## 2a. Register a SwiftUI View on iOS

Run `npx cap sync ios` after installing the plugin, then add a Swift file to the application's Xcode target. Import `NativeUIPlugin`, the module supplied by `@rdlabo/capacitor-native-ui`. Keep your existing SPM or CocoaPods integration.

```swift
import SwiftUI
import NativeUIPlugin

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
            .disabled(!actions.isAvailable("increment"))
            if let error { Text(error) }
        }
    }
}

@MainActor func registerAppNativeUI() throws {
    try NativeUI.register("app.counter") {
        (props: CounterProps, actions: NativeUIActions) in
        CounterView(props: props, actions: actions)
    }
}
```

Call `registerAppNativeUI()` once from `application(_:didFinishLaunchingWithOptions:)`, before JavaScript enables the shell. Handle a registration error there; duplicate or empty names are rejected. Swift source is compiled into the app, so adding or changing a View requires an iOS rebuild. Registration is synchronous setup, not a native bridge command.

## 2b. Register Compose content on Android

Android supports **element extensions only**. Standard Ionic and HTML controls stay on the Web, including explicitly marked buttons. Native Vertical Bars and `tab-accessory` are iOS features; Android can combine a Web side rail with element extensions. The same DOM reader, props, action targets, and `markForCheck()` work on both platforms.

Run `npx cap sync android` after installing the plugin. Use Kotlin in your Android app. In the root `build.gradle`, add the Kotlin and Compose compiler plugins to `buildscript.dependencies`, using the same Kotlin version as the app (the plugin defaults to `2.2.20`). Define `ext.kotlin_version = '2.2.20'` in the root `buildscript` if it is not already defined:

```groovy
classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"
classpath "org.jetbrains.kotlin:compose-compiler-gradle-plugin:$kotlin_version"
```

In `app/build.gradle`, apply `kotlin-android` and `org.jetbrains.kotlin.plugin.compose`, and enable `android { buildFeatures { compose true } }`. The Native UI dependency exposes Compose UI and Foundation; add Material dependencies yourself if your extension uses them.

Register once from your `Application.onCreate()`, on the main thread, before JavaScript enables the shell. Use an `Application` subclass configured with `android:name=".App"` on `<application>` in `AndroidManifest.xml`; avoid registering on each Activity recreation.

```kotlin
import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import dev.rdlabo.capacitor.nativeui.NativeUI
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        NativeUI.register(
            name = "app.counter",
            decode = { json -> json.getInt("count") },
        ) { count, actions, context ->
            val scope = rememberCoroutineScope()
            var error by remember { mutableStateOf<String?>(null) }
            val enabled = actions.isAvailable("increment")
            val foreground = if (context.dark) Color.White else Color.Black
            val background = if (context.dark) Color(0xFF202020) else Color.White
            val textStyle = TextStyle(color = foreground)
            Column(Modifier.fillMaxSize().background(background).padding(8.dp)) {
                BasicText("Count: $count", style = textStyle)
                Box(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp)
                        .alpha(if (enabled) 1f else 0.5f)
                        .clickable(enabled = enabled, role = Role.Button, onClickLabel = "Increment count") {
                            scope.launch {
                                try {
                                    actions.activate("increment")
                                    error = null
                                } catch (cancelled: CancellationException) {
                                    throw cancelled
                                } catch (unavailable: IllegalStateException) {
                                    error = "Action unavailable. Try again."
                                }
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) { BasicText("Increment", style = textStyle) }
                BasicText(
                    error ?: "",
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    style = textStyle,
                )
            }
        }
    }
}
```

The shell sizes and positions the Compose host from the source DOM rectangle. `context.sourceFrame` contains CSS pixels; `sourceFrameInDp` contains Compose dp, with `dpPerCSSPixel` as the conversion factor. `sourceID` and `viewportWidth` describe the current source and viewport. `rtl` is also applied through `LocalLayoutDirection`; use `dark` to select your app's Compose theme. Do not apply the source's `x` and `y` again inside your content.

The `decode` callback runs before accepting the projection. If it throws, that source stays on the Web. Empty or duplicate registration names are rejected. Compose content owns its styling and accessibility. Rebuild the Android app after changing Kotlin code.

## 3. Enable with local definitions

```ts
import { enableNativeUI } from '@rdlabo/capacitor-native-ui';
import { counter } from './native-ui/counter';

const shell = await enableNativeUI({ ionic: { auto: false }, extensions: [counter] });
```

This example enables your extensions without automatically projecting Ionic controls. Explicit `data-native-ui` sources remain opted in. To also project standard Ionic controls on supported iOS, omit `ionic: { auto: false }`. Android standard controls remain Web-rendered either way.

Replace your existing startup call with the one above; do not start a second shell. Connect it to your framework using the [app-root lifecycle examples](setup.md#place-startup-in-your-frameworks-app-root), putting these options in the shared startup call.

Keep extension objects stable across repeated enable calls. Changing extensions while running requires `await shell.destroy()` first. Extension names must be unique within an activation. Do not register overlapping selectors for the same source. An extension owns its source subtree, so built-in controls inside it are not projected separately.

## 4. Build and try the extension

Build your Web assets, then sync and rebuild the platform you configured:

- **Android:** run `npx cap sync android`, then build and launch the app from Android Studio. The counter should render with Compose.
- **iOS:** run `npx cap sync ios`, then build and launch the app from Xcode. On iOS 26+, the counter should render with SwiftUI.

Tap Increment: the original Web handler should update `data-count`, and the native count should follow. In a browser, the original Web counter should still work.

For source-specific fallback reasons, temporarily enable [`debug: true`](configuration.md#understand-why-a-source-stays-on-the-web). If the source stays on the Web, confirm that registration runs before JavaScript enables the shell and that the names and props agree on both sides. On Android, check that your `Application` subclass is declared in the manifest; on iOS, check that the Swift file belongs to the app target.

## Content and placement are independent

| `placement` | Behavior |
| --- | --- |
| Omitted or `'element'` | Hosts native content in the source element's Web frame on iOS 26+ or Android API 24+. |
| `'tab-accessory'` | Attaches the View to a projected tab bar's system SwiftUI tab accessory on iOS 26.1+. |

For `tab-accessory`, place the source inside its owning `ion-tabs`. The shell resolves that tabs element's `ion-tab-bar`; applications do not pass native controller references. Currently only the **Vertical Bars SwiftUI tab host** supports this placement. Ordinary UIKit tab bars, missing native tabs, iOS 26.0, or multiple competing accessories keep the source on the Web. The shell does not approximate a system accessory with a floating overlay. Keep an equivalent Web layout (for example, a fixed footer); the source retains its layout space while hidden.

`enableVerticalControlArea({ extensions: [...] })` also accepts extensions. In this standalone mode only accessories belonging to native Vertical Bars are eligible; ordinary element projections require `enableNativeUI`.

## Read source geometry and presentation state

The shell measures the source DOM element automatically. With the default `element` placement, it positions and sizes the SwiftUI host to match that rectangle. You do not need to send coordinates in `props` or position the native view yourself.

Use the three-argument registration closure to receive that information:

```swift
try NativeUI.register("app.counter") {
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

The shell owns discovery, geometry, state synchronization, native controller containment, overlay retirement, suspension and teardown. Extensions do not implement attach/detach hooks. Web sources are hidden only after native accepts the projection. An unregistered renderer, a failing props decoder, unsupported placement or failed reader leaves that instance on the Web. Existing shell overlay policy applies; extensions return to the Web while Web overlays cover the page.

Element placement requires the source to fit fully inside the viewport and its ancestors' overflow clipping bounds, including Ionic's shadow scroll containers. Partially clipped sources stay on the Web and become eligible again when scrolled fully into view. Tab accessories use the system host's placement instead.

`try await actions.activate(name)` completes after the original Web element receives its click. It does **not** wait for application work launched by the click handler (network requests, navigation or modal presentation). Disabled, removed or stale actions reject; teardown, native task cancellation and bridge timeouts settle pending calls. The bridge acknowledgement is a Capacitor Promise method.

The [demo reader](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/demo/src/native-ui/counter.ts) and [demo SwiftUI View](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/demo/ios/App/App/NativeUICounter.swift) show both placements using app-local files. Open the Native UI demo page to compare native projection with its Web fallback.

For a complete application feature, see the [SwiftUI mini-player example](native-mini-player.md): artwork, track metadata, playback controls and swipe-to-open, all defined in the demo application.
