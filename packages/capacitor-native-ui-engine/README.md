# Capacitor Native UI Engine

`@rdlabo/capacitor-native-ui-engine` is infrastructure **for Capacitor plugin maintainers**. It is a library dependency that renders no controls, registers no application-facing Capacitor plugin, and requires no Ionic or Angular runtime. Its native registration owns a scoped internal WebView channel.

The engine associates DOM layout with native views, tracks scrolling, prepares native images before interaction, and manages image handoff and native restoration. The consuming plugin supplies its native views, corresponding DOM and presentation events. Existing renderers can also use the low-level APIs with their own ordered transport.

The native libraries support iOS (`UIKit` / `WKWebView`) and Android (`View` / `WebView`). TypeScript geometry and image presentation are framework-independent. APIs are experimental during extraction. Android placement requires API 24+, and composited snapshots require API 26+.

## Ownership

| Engine                                                        | Consuming plugin                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| DOM geometry, clipping and native scroll binding              | Creating native buttons, SDK views, or SwiftUI content               |
| Startup, event subscriptions and native draw acknowledgements | Providing the fallback DOM at the correct layer                      |
| Prepared image cache, decoding, display and retirement        | Reporting appearance changes and the intended projection destination |
| Native capture and temporary return images                    | Providing native views and SDK capture eligibility                   |
| Image invalidation, token cleanup and observer teardown       | Owning business actions and the interactive Web fallback             |

A DOM slot does not necessarily contain a Web replacement: a UI plugin can restore a button, while an ad plugin may hide its slot. Image handoff is explicit and noninteractive. The engine never forwards clicks through an image or replaces SDK click/impression handling.

## Register from the native plugin

Keep the plugin's normal `registerPlugin()` export and public methods unchanged. Create and retain a registration after creating the native renderer. The engine ships its Web runtime with the Swift/Android library, starts it in the current document and future documents, finds the existing fallback DOM, and subscribes to the plugin's notifications. Applications do not call a separate JS initializer.

The integration has three responsibilities:

1. The consumer provides an existing, laid-out Web fallback container in the correct layer. Pass this projection destination as the required `projectionSelector: string`; there is no `null` / automatic DOM creation mode.
2. The plugin registers its native views and notification names once on each platform.
3. The plugin emits notifications after its updates and releases the registration at teardown.

### iOS: add the registration to your `CAPPlugin` class

In `ios/Sources/ExamplePlugin/ExamplePlugin.swift`, retain the registration as a property and initialize it in `load()`, **after your existing renderer creates and attaches its view**.

In this diff, `nativeView` is the `UIView` your plugin already owns; its existing rendering code is represented by comments.

Use the existing **`jsName`**, not `identifier`: Capacitor uses `jsName` for JS plugin calls and event subscriptions. Do not repeat the plugin name in the Engine configuration.

```diff
 import Capacitor
 import UIKit
+import CapacitorNativeUIEngine

 @objc(ExamplePlugin)
 public class ExamplePlugin: CAPPlugin, CAPBridgedPlugin {
     public let identifier = "ExamplePlugin"
     public let jsName = "Example"
     public let pluginMethods: [CAPPluginMethod] = [
         CAPPluginMethod(name: "setColors", returnType: CAPPluginReturnPromise)
     ]
     private var nativeView: UIView?
+    private var projection: NativeUIProjection?

     public override func load() {
         // Existing code creates and attaches nativeView here.
+        do {
+            projection = try NativeUIProjection(
+                webView: bridge?.webView,
+                plugin: jsName,
+                projectionSelector: "#native-ui-fallback",
+                receiveListeners: .init(
+                    update: ["appearanceChanged"],
+                    projection: .init(
+                        native: ["shown"],
+                        web: ["transitionStarted"],
+                        none: ["hidden"]
+                    )
+                ),
+                view: { [weak self] in
+                    self?.nativeView
+                }
+            )
+        } catch {
+            CAPLog.print("Native UI projection unavailable: \(error)")
+        }
     }

     @objc func setColors(_ call: CAPPluginCall) {
         DispatchQueue.main.async {
             // Existing code applies the requested colors to nativeView.
+            self.notifyListeners("appearanceChanged", data: [:])
             call.resolve()
         }
     }
+
+    deinit {
+        projection?.destroy()
+    }
 }
```

Pass `bridge?.webView` directly. If the WebView is unavailable, the Engine throws an initialization error into the same `catch`; a separate guard or force unwrap is unnecessary.

If the view is created later in an existing `initialize` / `show` method, put the registration there after view creation instead of in `load()`. Retain one registration for that renderer's lifetime; do not create another on every update. When replacing a renderer, destroy its old registration before registering the replacement.

### Android: add the registration to your `Plugin` class

Make the corresponding changes in `android/src/main/java/<your-package>/ExamplePlugin.kt`. **`pluginHandle.id`** is Capacitor's registered plugin name, derived from `@CapacitorPlugin`; no second name string is needed.

```diff
 import android.view.View
 import com.getcapacitor.Plugin
 import com.getcapacitor.PluginCall
 import com.getcapacitor.PluginMethod
 import com.getcapacitor.annotation.CapacitorPlugin
+import android.util.Log
+import com.getcapacitor.JSObject
+import dev.rdlabo.capacitor.nativeuiengine.NativeUIProjection
+import dev.rdlabo.capacitor.nativeuiengine.NativeUIProjection.ReceiveListeners

 @CapacitorPlugin(name = "Example")
 class ExamplePlugin : Plugin() {
     private var nativeView: View? = null
+    private var projection: NativeUIProjection? = null

     override fun load() {
         // Existing code creates and attaches nativeView here.
+        projection = runCatching {
+            NativeUIProjection(
+                window = activity.window,
+                webView = bridge.webView,
+                plugin = pluginHandle.id,
+                projectionSelector = "#native-ui-fallback",
+                receiveListeners = ReceiveListeners(
+                    update = listOf("appearanceChanged"),
+                    projection = ReceiveListeners.Projection(
+                        native = listOf("shown"),
+                        web = listOf("transitionStarted"),
+                        none = listOf("hidden")
+                    )
+                ),
+                view = { nativeView }
+            )
+        }.onFailure {
+            Log.e(javaClass.simpleName, "Native UI projection unavailable", it)
+        }.getOrNull()
     }

     @PluginMethod
     fun setColors(call: PluginCall) {
         activity.runOnUiThread {
             // Existing code applies the requested colors to nativeView.
+            notifyListeners("appearanceChanged", JSObject())
             call.resolve()
         }
     }
+
+    override fun handleOnDestroy() {
+        projection?.close()
+        projection = null
+        super.handleOnDestroy()
+    }
 }
```

Both diffs add a private property, native registration, an update notification and teardown. They add no Engine methods to `pluginMethods`, no public JS wrapper, and no application-side Engine initializer.

Keep your plugin's existing `registerPlugin()` export. Use the same event names in the registration and `notifyListeners`; if the plugin already emits a suitable event (such as `tabSelected`), list that event instead of emitting it twice.

### Which events to emit

All incoming event declarations belong to `receiveListeners`. Its `update` list refreshes the image, its `projection` lists select the destination, and its optional `match` filters notifications for the owning surface.

| Notification                            | Where to emit it in the existing plugin                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `appearanceChanged` (an `update` event) | After a successful native appearance update, such as `setColors`                      |
| `transitionStarted` (`web`)             | Before the fallback DOM starts moving or a Web layer covers the native view           |
| `shown` (`native`)                      | After the plugin's existing show operation, or when returning from the Web projection |
| `hidden` (`none`)                       | After the plugin's existing hide operation                                            |

The names in the examples are conventions you choose, not reserved Engine methods. An `update` event refreshes the prepared image without changing the requested destination. It does not call `setColors` again.

Emit `transitionStarted` before the DOM starts moving, `shown` when native projection is requested again, and `hidden` after the plugin's own hide operation. Native capture, URL conversion, image preparation, draw acknowledgement, image retirement and listener cleanup stay inside the engine. The engine never invokes the plugin's `show`, `hide`, selection or ad-loading methods. End the registration with `projection.destroy()` on iOS or `projection.close()` on Android when the renderer is destroyed. Retain the registration for its full lifetime and call native APIs on the UI thread.

`projectionSelector` is required and must resolve to **one existing container when projection starts**, including one retrieved by the plugin's own `querySelector`. The engine does not create a DOM or choose its size, placement, layer or z-index. Keep the container's normal layout and any interactive Web controls; an empty zero-size placeholder is not a usable fallback. It is a fixed scope, not a discovery root.

The container does not have to exist at registration time. A missing DOM waits without showing native content; replacing it creates a new binding and retires old images. The engine preserves the container's children, listeners and values. Pass the native view itself through `view`; a group of controls can use their common native container. The engine manages the internal identifier, so no ID list or view dictionary is required. Independent surfaces use separate registrations.

A Web Component host can be the destination, for example `projectionSelector: 'native-ad[placement="home"]'`. Give the host a layout box (`display: block` with the intended dimensions); the engine observes insertion, removal and selector attribute changes. The selector runs in the document and does not search inside shadow roots. The fallback content, including shadow content, must inherit the host's `visibility`: do not override it with `visibility: visible`, and reserve the host's `::before` for the projection image. These requirements apply to open and closed shadow roots.

For independently moving AdMob slots, retain one registration per loaded native view/surface, use a slot-specific selector and filter the plugin's notifications through `receiveListeners.match` (`match: ["slotKey": slotKey, "loadId": loadId]` / `match = mapOf("slotKey" to slotKey, "loadId" to loadId)`). Dispose the registration when a loaded ad is replaced, even if its host view is reused. Keep SDK loading, impression and click handling in the ad plugin. Supply `canCapture` with its existing capture eligibility checks (for example, test-ad / opaque-background / no-video restrictions); the engine does not grant permission to snapshot an SDK view.

Scrolling is internal: iOS uses a uniquely matched native scroll binding when available; otherwise, including Android, scrolling temporarily uses the prepared image and restores native content after motion settles. Automatic scroll handling never overrides explicit `web` or `none`. Unsupported capture or geometry keeps the normal DOM fallback; it does not wait for a new capture on the transition path. The latest explicit destination survives WebView reload, and old-document replies cannot complete a new document's requests.

By default, the internal channel is limited to the main frame on Capacitor's localhost origins. Pass the application's exact `allowedOrigins` for a different configured origin. Android requires WebView's `WEB_MESSAGE_LISTENER` and `DOCUMENT_START_SCRIPT` features; registration fails explicitly on unsupported WebView implementations. Do not use wildcard origins for remotely navigable WebViews.

## Ionic overlay support (optional)

For an Ionic application, call this once during application startup. When calling it directly from the application, install `@rdlabo/capacitor-native-ui-engine` as a direct application dependency:

```ts
import { enableSupportIonicOverlays } from '@rdlabo/capacitor-native-ui-engine/ionic';

enableSupportIonicOverlays();
```

Plugin maintainers can include this snippet in their application setup instructions, or call it inside an existing JS initializer. `@rdlabo/capacitor-native-ui` already calls the same initializer internally; its users need no additional call. Non-Ionic applications omit it. Native registration alone does not install Ionic event listeners.

One monitor is shared per document, including between the npm module and the runtime injected by Swift/Android. Repeated initialization does not add listeners or erase explicit configuration. Destroying one projection removes only its subscription; it does not stop the monitor used by other plugins. The monitor lives with the document.

The default covers Modal, Popover, Alert, Action Sheet, Loading, Picker, Toast and Menu lifecycle events. It compares each projection's DOM with the active overlay stack: content inside the front modal stays native, while covered content temporarily uses its prepared image. Toasts and inactive sheet backdrops do not cover a surface. Nested overlays keep it covered until the remaining stack permits restoration. Missing images retain the normal Web fallback. This temporary coverage never overwrites a plugin's explicit `web` or `none` destination. Projections registered later read the current state.

Native Popover ownership is supplied by the Native UI vertical-bars renderer. The shared monitor does not treat its source DOM as a covering Web overlay. If native presentation fails, the renderer releases ownership and normal DOM coverage resumes.

Optional settings are document-wide:

```ts
enableSupportIonicOverlays({
  exclude: '[data-nonblocking-overlay]',
  additional: [
    {
      selector: 'app-dialog',
      events: {
        willPresent: 'appDialogWillPresent',
        didDismiss: 'appDialogDidDismiss',
      },
    },
  ],
});
```

Use `covers(overlay, target)` only when a registered DOM projection needs a custom coverage rule; return `undefined` for the default, or a boolean to override it. Exclusions and explicit native-window ownership take precedence. The standard relationship uses overlay order, DOM containment and backdrop state, rather than attempting to interpret arbitrary CSS stacking contexts. Configure unusual layouts explicitly.

## Install inside a plugin

```sh
npm install @rdlabo/capacitor-native-ui-engine
```

The npm archive contains TypeScript declarations, ESM, Swift sources and a podspec. Native dependencies must also be declared by the consuming plugin; an npm dependency alone does not link Swift code.

The primary native distribution is Swift Package Manager. Depend on the repository-root library from your plugin:

```swift
.package(url: "https://github.com/rdlabo-dev/ionic-theme-ios27.git", revision: "<released Git tag or immutable commit>")
// In the plugin target's dependencies:
.product(name: "CapacitorNativeUIEngine", package: "ionic-theme-ios27")
```

`import CapacitorNativeUIEngine` requires neither Capacitor registration nor an npm install of Swift sources. The npm companion supplies DOM measurement and Web image handoff; it is not the native dependency resolver. The current monorepo uses `ios27-v…` release tags, so pin a Git revision/tag rather than assuming unprefixed SwiftPM semantic version tags exist.

Within a source checkout, the first consumer uses the sibling Swift package for development. Installed Native UI plugins resolve Git: versioned releases pin their release tag, and beta artifacts pin the source commit. This avoids relying on npm hoisting or the location of `node_modules` to find Swift sources.

### CocoaPods compatibility through npm

CocoaPods uses the Swift sources and podspec shipped in npm; no CocoaPods Trunk publication is required. The plugin maintainer declares the matching dependency in the plugin's podspec:

```ruby
s.dependency 'CapacitorNativeUIEngine', '<matching engine version>'
```

The maintainer must also document this one-time application setup. Install the matching engine version as a direct npm dependency, then add the local pod **inside the application's target, outside `def capacitor_pods`**, which Capacitor regenerates:

```sh
npm install @rdlabo/capacitor-native-ui-engine@<matching-engine-version>
```

```ruby
# ios/App/Podfile; adjust the path for a different native project layout.
target 'App' do
  capacitor_pods
  pod 'CapacitorNativeUIEngine', :path => '../../node_modules/@rdlabo/capacitor-native-ui-engine'
end
```

Run `npx cap sync ios` and rebuild. Keep the direct engine version aligned with the consuming plugin's dependency when upgrading. With a nonstandard node_modules layout, point `:path` at the installed engine package directory. An npm dependency alone does not register a Pod, and a podspec dependency cannot specify this local path. The engine intentionally has no Capacitor plugin registration or Podfile rewriting hook. SwiftPM consumers do not need this CocoaPods setup.

## Low-level Web projection

A scope binds one existing Web fallback element for its lifetime. Obtain that element from your plugin's DOM; the engine does not create a replacement host or choose a page, stacking order or z-index. A different fallback element requires a new scope. Its Document is derived from `element.ownerDocument`.

```ts
import { createWebProjectionScope, createWebProjection } from '@rdlabo/capacitor-native-ui-engine';

const fallback = container.querySelector<HTMLElement>('[data-web-fallback]');
if (!fallback) throw new Error('Web fallback is missing');
const scope = createWebProjectionScope(fallback, 'my-plugin');
const projection = await createWebProjection(
  scope,
  {
    send: (request) => plugin.snapshot(request),
    listen: (listener) => plugin.addListener('snapshotInteraction', listener),
  },
  {
    wake: () => schedulePluginUpdate(),
    blocked: () => overlayIsActive(),
    revision: () => lastSentRevision,
  },
);
```

The container, bridge and update callbacks above belong to the consuming plugin. No `document`, `target`, `layer`, CSS selector or layer resolver is passed to the projection manager.

1. After an accepted native update, call `projection.consider(revision, sources)`. Sources associate the native IDs and viewport frames with their source DOM; they need not be inside the fallback element. Images are captured and decoded in advance.
2. Call `projection.changed()` for appearance changes, or `projection.changed(scrollElement)` to invalidate scroll geometry. Layout updates go through `consider`; use `invalidate()` for other geometry changes.
3. Before covering Native with a Web overlay, call `projection.begin()`. It displays already prepared pixels at the fixed fallback. No new capture or decode starts here. If capture is unavailable, the plugin keeps its ordinary Web fallback.
4. Exclude `projection.owners` from normal Native updates while the image owns those sources. `visibleOwners` keeps their return pixels while Native is being restored; `preparedOwners` identifies sources with prepared images. These arrays are read-only snapshots.
5. Call `projection.end()`, send the normal native update, then call `projection.updated(snapshotToken, acceptedIDs, revision)`. A newer acknowledgement containing all captured IDs retires the image.
6. Call `projection.destroy()` when disposing the surface. It releases only its own images and listener; the plugin owns final Native reset and its DOM.

The engine uses a noninteractive, empty CSS `::before` pseudo-element for the prepared image. Supply a container that supports it, such as an existing `div`, `button` or custom element. Replaced/void elements such as `img`, `input` and `video` are rejected when creating the scope; use their existing fallback container. It does not clone, replace, remove or set `inert`/`aria-hidden` on the existing fallback or its children. Removing its temporary image styles restores the same live DOM, including application changes made during projection. Event listeners and form values are preserved. The renderer may move that same element between parents; it must not replace the scope's element or let two managers control it simultaneously.

### Notifications from the existing plugin

The low-level manager can subscribe to the existing plugin's events through `options.events`:

```ts
events: {
  addListener: (name, listener) => plugin.addListener(name, listener),
  update: ['setColors', 'setTabs', 'tabSelected'],
  projection: {
    native: ['shown'],
    web: ['transitionStarted'],
    none: ['hidden'],
  },
}
```

These are **notifications**, not intercepted method names. The plugin emits update events after its native changes succeed. A Web projection event must arrive before movement starts; it uses the previously prepared image. A native event requests restoration, but the image remains until the normal renderer acknowledgement confirms that Native is ready. A hidden event follows the plugin's native hide operation and retires the image; it does not invoke `hide()` or change application-owned fallback DOM. Appearance updates preserve the requested destination, including `none`.

For plugins with several surfaces, provide `accepts(event)` to select this scope's stable surface identity. Events shared by `update` and a destination are subscribed once and processed together. Conflicting destinations for the same event are rejected before subscription. Destroying the manager removes all its subscriptions, including registrations that resolve late after initialization fails. No public plugin methods are wrapped or replayed.

The manager converts private native file URLs with Capacitor internally. Plugin authors do not supply a URL resolver.

This section describes the lower-level manager for renderers that already own batch reconciliation, such as the Ionic adapter. Prefer the native registration above for a new integration; it owns startup, measurements and draw acknowledgements.

### Multiple fallbacks in one Native transaction

Use `createWebProjectionBatch(transport, options)` when several fallback elements must switch together. It uses the same image engine, one listener and one capture/cover/restore token. Pass `{ scope, element, control, ... }` for each entry to `batch.consider(revision, sources)`. Several native IDs may share one scope, such as a button group.

The batch derives its Document from the first nonempty `consider`; all subsequent scopes and sources must belong to that Document. Before this first update, `begin()` does nothing and `destroy()` is safe. A changed fallback requires a new scope. Scope identity participates in cache invalidation; an active presentation retains its captured scopes until restoration finishes.

`WebProjectionRequest` is an action-discriminated union. `prepare` requires `revision`, `viewportWidth` and `ids`; `cover` requires `token`; `restore` requires `token`, `viewportWidth` and destination `parts`; `painted`, `restored` and `release` require `token`; `reset` takes no payload. Empty preparation results and `{ shown: false }` mean the plugin should use its normal Web fallback. Use the plugin's existing ordered bridge; the engine does not retry user actions.

### Native handoff on both platforms

Call all view and snapshot lifecycle APIs on the main/UI thread. Native input frames use **points relative to the WebView on iOS** and **physical pixels relative to the reference view on Android**. `viewportWidth` is the Web viewport width in CSS pixels. Prepared parts sent to JavaScript are converted to CSS pixels.

On both platforms, `cover` installs the prepared entry image **before hiding the supplied live views**, within the same UI turn. Its boolean result reports whether this was possible; failure leaves visibility unchanged. Supply the actual views for every captured component. Do not separately hide views or create another entry copy.

```swift
let shown = snapshots.cover(token, in: webView, views: renderedViews, transient: movingSurface)
```

```kotlin
val shown = snapshots.cover(token, activity.window, webView, renderedViews, transient = movingSurface)
```

`transient: true` is for a moving foreground surface: it does not replace the background's `coveringToken`. Retire the entry copy with `retireCopy(token)` after Web image readiness. Before applying a normal native update, undo the engine's visibility changes with iOS `restoreControls()` / Android `restoreViews()`. For return, `restore` installs the cached return image, the plugin renders underneath it, and `retireCopy(token, entry: false)` retires it after the corresponding acknowledgement/readiness. These platform-native names remain idiomatic; the lifecycle is the same. `cover` is an entry operation, not a method to repeat on each normal update.

Token cleanup uses `release(token)`; owner teardown uses `reset()` (and Android `close()` when disposing its encoder). A surface manager must not reset another surface's captures. Web fallback remains the renderer's responsibility when a capture or native placement is unavailable.

The optional `eligible(source)` and `current(sources)` callbacks keep framework-specific surface selection outside the engine. `transient: true` supports a moving surface whose return image must be rebased. Arbitrary CSS transforms are not supported by native scroll tracking; such movement can use this image path.

The image transport accepts `WebProjectionRequest` and returns prepared token/parts or `{ shown: false }`. Parts use local `file:` URLs and CSS-pixel viewport coordinates. Requests use the plugin's existing ordered bridge:

| Action     | Native responsibility                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare`  | Validate the current revision and IDs, then `NativeUICoveredSnapshots.prepare` using actual rendered frames.                                            |
| `cover`    | Validate the token and complete native surface ownership; create the entry copy and hide the associated native views. Return `shown: false` on failure. |
| `painted`  | Retire only that token's entry copy.                                                                                                                    |
| `restore`  | Rebase the prepared return copy to supplied frames. Never capture here.                                                                                 |
| `restored` | Retire only that token's return copy after the native update ACK and Web paint boundary.                                                                |
| `release`  | Release the named token, files and associated temporary views.                                                                                          |
| `reset`    | Owner teardown only; release all native capture resources.                                                                                              |

Use `NativeUICoveredSnapshots.observe` to notify the JS listener when interaction starts/ends. Captures use composited pixels so blur/refraction is preserved; they include the background under the clipped native component. Cache validity therefore includes layout and the plugin's visual-change notifications. The engine does not capture continuously or guarantee every possible renderer can be captured.

### Temporary storage and application permissions

Prepared images stay in the app's private temporary storage. iOS uses `FileManager.default.temporaryDirectory`. On Android, construct `NativeUISnapshots` with a directory inside `context.cacheDir`; do not use shared or external storage. Neither platform needs a photo-library or storage permission prompt for this path. No Capacitor Filesystem plugin is required. See [Apple's sandbox directories](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html) and [Android's app-specific storage](https://developer.android.com/training/data-storage/app-specific).

`Capacitor.convertFileSrc` maps the returned file URL to the existing WebView local server. It grants no filesystem permission and does not upload the image. If the application sets a Content Security Policy, its `img-src` must allow the local app origin used by that URL; do not enable broad `file:` access or unrelated WebView file-access settings.

`release(token)` and owner teardown remove owned snapshot files. Abrupt process termination can leave temporary images until the operating system clears the cache or the app is uninstalled; immediate deletion after a crash is not guaranteed. Keep this storage private and treat it as disposable, not persistent application data.

## Native scroll tracking

`readScrollPlacement(element, owner, identify)` measures one untransformed overflow owner. `createScrollBindings()` validates reuse and detects movement while acquisition is awaiting ACK. Keep `reuse` out of layout-deduplication signatures; it describes acknowledgement state, not layout.

On iOS, `NativeUIScrollBindings.replace` groups sources by owner and binds only an unambiguous matching `UIScrollView`. `update()` applies positions and clipping without rebuilding content. `NativeUIClippedView` preserves full content dimensions while restricting visible pixels and hit testing.

An established binding rejected by native loses ownership and may be freshly acquired through the **same** update/ACK path. A failed fresh acquisition stays on the fallback until a relevant layout/scroll-end event. Never add an immediate retry loop or replay user actions. A frame/props change does not recalibrate an established coordinate origin.

This uses WKWebView's internal overflow hierarchy without private class names. Missing/ambiguous views, nested scrolling, document scrolling, unsupported transforms, shaped clipping, or a moving unconfirmed owner cannot be bound. Do not claim support solely because a `UIScrollView` exists. A native view may intercept gestures that begin inside it; routing those gestures and SDK accessibility behavior remain renderer-specific.

## Development

From the monorepo root:

```sh
npm ci
npm run build --workspace @rdlabo/capacitor-native-ui-engine
npm exec --workspace @rdlabo/capacitor-native-ui-engine -- playwright install chromium
npm test --workspace @rdlabo/capacitor-native-ui-engine
xcodebuild -scheme CapacitorNativeUIEngine -destination 'platform=iOS Simulator,id=<booted simulator UUID>' test
```

The engine follows the monorepo release version. Publish order is the native Maven artifact → npm engine → native UI plugin → theme. npm releases verify that the matching POM and AAR exist on Maven Central before publication. No publication is performed by build or test commands. Tests cover plain DOM, fractional/RTL geometry, stale ACKs, image ownership and native WKWebView scroll tracking; consumer tests remain responsible for Ionic/SDK integration.

## Android library

Android uses a Gradle Android library, distributed as an AAR through Maven rather than Capacitor plugin registration. The publication coordinates are `io.github.rdlabo:native-ui-engine:<version>`. The first Maven Central publication is pending; do not add an unresolved dependency to an application. Build and verify the local Maven publication with:

```sh
packages/capacitor-native-ui-engine/android/gradlew -p packages/capacitor-native-ui-engine/android testDebugUnitTest assembleRelease connectedDebugAndroidTest publishReleasePublicationToVerificationRepository
```

`NativeUIClippedView` applies position and clipping without resetting unchanged dimensions. Low-level integrations can retain their existing coordinate measurements and ordered bridge; the native registration owns these messages for new integrations. Android does not claim WKWebView-style native overflow binding.

`NativeUISnapshots` prepares composited PixelCopy images and local PNG files, then covers/restores from that cache. Encoding runs off the UI thread; only one preparation runs per owner. Notify it of visual changes and interaction, and release tokens on teardown. All view/lifecycle calls run on the UI thread. The plugin retains revision, eligibility and fallback policy.

After prepared Web pixels are shown or retired, `NativeUIWebReadiness.prepare` checks readiness for a subsequent WebView draw. Its `current` predicate must validate the owning session, source generation and image revision. The temporary native copy covers this asynchronous handoff; overlay startup itself does not wait. Neither bridge acknowledgement nor this callback proves physical display presentation.

[AdMob PR #487](https://github.com/capacitor-community/admob/pull/487) demonstrates a persistent image underlay for opaque test ads. That policy is not enabled globally: translucent UI would be composited twice, and video/SDK interactions require renderer-specific decisions. Never synthesize clicks through an image. The Native UI consumer uses the engine on both iOS and Android. Android acceptance tests exercise the real Capacitor bridge and translucent Compose content. Other SDK consumers still require their own integration and acceptance testing.

### Translucent Android surfaces

Capture the composited window pixels, including the background, instead of drawing the translucent view onto an empty bitmap. Keep the prepared Web image decoded but hidden. At handoff, `cover(token, window, reference, views)` installs a temporary opaque image copy before hiding those native views in the same UI turn. Reveal the Web image, confirm Web drawing readiness, then retire the entry copy. The overlay starts immediately; image encoding is never on this path.

For return, install the prepared return copy with `restore`, restore the native views underneath it, hide the Web image, and retire the return copy after Web drawing readiness. This avoids compositing live translucent native pixels over their own snapshot. Validate the token and current surface generation at every asynchronous callback. The temporary copy is noninteractive and bounded; teardown releases both copies and cached resources.

This preserves the captured background, not a continuously changing scene behind the image. Background changes must invalidate the cache through the same visual-change notifications as content updates. Video and unsupported capture surfaces retain the consumer's fallback policy.

The Native UI Android plugin declares the engine as a Maven dependency. For local verification, `-PnativeUIEngineRepository=<absolute path to engine/android/build/maven>` adds the generated repository; no relative npm source path is used as the native dependency. With JDK 21 and Android SDK 36 installed, run `sh scripts/verify-native-ui-engine-android.sh <emulator serial>` to test the library and its real Capacitor/Compose consumer. Omit the serial for build/unit/lint checks. The acceptance activity and Web assets are enabled only by `-PnativeUIEngineIntegrationTest` and cannot enter ordinary consumer builds.

## Maven publication

The `Native UI Engine Maven Release` workflow is manually dispatched on `main` with the exact engine package version. That commit must first pass `Native UI Engine` CI. It signs an AAR, source archive, generated Kotlin API documentation and Maven metadata, verifies the consumer against the staged repository, publishes once, and builds the consumer again from Maven Central. Existing coordinates are never overwritten; if an upload times out, inspect the recorded deployment in Central before taking further action.

Configure the repository's Actions secrets with `CENTRAL_USERNAME`, `CENTRAL_PASSWORD` (a Central user token), `MAVEN_SIGNING_KEY` (ASCII-armored private key) and `MAVEN_SIGNING_PASSWORD`. The signing public key must be available to Central. These are the same credential types used by cf-workers-native; GitHub secrets are scoped to their repository and must be provisioned here separately.

For local packaging verification, run `python3 scripts/native-ui-engine-release/verify.py` with JDK 21, Android SDK 36 and GnuPG. It creates a disposable key, validates signatures and checksums, and deletes its test ZIP without uploading. Publication always rebuilds from clean outputs with the real signing key. The engine shares the monorepo version; publish its Maven artifact before the corresponding npm release, including prereleases.

## License

This engine uses the [Zlib license](LICENSE): commercial use, modification and redistribution are permitted. Do not misrepresent the origin or claim authorship of the original software; identify altered source versions and retain the notice in source distributions. Forking, renaming or removing Git history is not itself prohibited by this license.

[NOTICE](NOTICE) preserves the upstream MIT notice for code adapted from ionic-theme-ios27 / capacitor-native-ui. Previously granted MIT permissions remain applicable to those versions and portions. The theme and Native UI plugin remain MIT; the engine's Zlib license does not change their licenses or the licenses of applications that depend on it. The npm archive and Android artifacts include the engine notices; SwiftPM users obtain them in this repository alongside the engine sources.
