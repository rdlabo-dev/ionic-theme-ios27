# Capacitor Native UI Engine

`@rdlabo/capacitor-native-ui-engine` is infrastructure **for Capacitor plugin maintainers**. It is a library dependency, not an application-facing Capacitor plugin: it registers no bridge, renders no controls, and requires no Ionic or Angular runtime.

The engine associates DOM layout with native views, tracks scrolling, prepares native images before interaction, and manages image handoff and native restoration. The consuming plugin supplies its renderer, existing ordered transport, and presentation policy.

The native libraries support iOS (`UIKit` / `WKWebView`) and Android (`View` / `WebView`). TypeScript geometry and image presentation are framework-independent. APIs are experimental during extraction. Android placement requires API 24+, and composited snapshots require API 26+.

## Ownership

| Engine                                                                | Consuming plugin                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| DOM geometry, clipping and native scroll binding                      | Creating native buttons, SDK views, or SwiftUI content                   |
| Binding acquisition, reuse validation and stale acquisition detection | Sending updates and applying acknowledgements on its existing bridge     |
| Prepared image cache, decoding, display and retirement                | Choosing which surface is covered or moving                              |
| Native capture, clipped view and temporary return images              | Measuring the actual native view and reporting renderer state changes    |
| Image invalidation, token cleanup and scroll observer teardown        | Restoring interactive Web content or hiding a slot when projection fails |

A DOM slot does not necessarily contain a Web replacement: a UI plugin can restore a button, while an ad plugin may hide its slot. Image handoff is explicit and noninteractive. The engine never forwards clicks through an image or replaces SDK click/impression handling.

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

## Web projection

A scope binds one existing Web fallback element for its lifetime. Obtain that element from your plugin's DOM; the engine does not create a replacement host or choose a page, stacking order or z-index. A different fallback element requires a new scope. Its Document is derived from `element.ownerDocument`.

```ts
import { createWebProjectionScope, createWebProjection } from '@rdlabo/capacitor-native-ui-engine';
import { Capacitor } from '@capacitor/core';

const fallback = container.querySelector<HTMLElement>('[data-web-fallback]');
if (!fallback) throw new Error('Web fallback is missing');
const scope = createWebProjectionScope(fallback, 'my-plugin');
const projection = await createWebProjection(
  scope,
  {
    send: (request) => plugin.snapshot(request),
    listen: (listener) => plugin.addListener('snapshotInteraction', listener),
    resolveURL: (url) => Capacitor.convertFileSrc(url),
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

`NativeUIClippedView` applies position and clipping without resetting unchanged dimensions. The consuming plugin retains its existing coordinate measurements and ordered bridge; the engine adds no separate coordinate channel. Android does not claim WKWebView-style native overflow binding.

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
