# Extraction and adoption

The invariant is one visible, authoritative representation: live native content, prepared noninteractive pixels, or the consumer's fallback. Image preparation and content updates are separate from the handoff path. An unsuccessful image preparation must not delay an overlay, and an unsuccessful native acquisition must not make the Web source inaccessible.

The kit is kept in the existing monorepo so extraction and its first consumer can be tested together. Its primary native distribution is a Git-resolved Swift Package; the separate npm companion supplies DOM/image code. No application-facing `registerPlugin` API is introduced.

## Current extraction

- TypeScript: generic geometry, scroll ownership, per-plugin image scope and prepared-image handoff.
- Android: clipped views, shared session/sequence validation, optional coordinate channel, composited PixelCopy preparation and WebView visual readiness.
- Swift: native overflow matching/observation, clipped native content, composited capture, local image storage and temporary entry/return copies.
- Native UI adapter: Ionic source selection, rail proxy resolution, modal lifecycle and the actual renderer remain in the native UI package.
- Existing native/Web wire ordering is preserved; no extra coordinate bridge or action-dispatch route is added.

## Next consumer: AdMob

Use a separate scope per feed/plugin lifetime. Map ad slot identity to kit source identity; preserve the SDK's native view and action handling. Ads do not acquire a fake clickable Web replacement. Failed placement hides the native ad or delegates to the existing feed fallback. Image handoff is explicitly selected by the plugin author and must preserve SDK lifecycle requirements.

First migrate iOS geometry/tracking and validate against the existing NativeAd tests. Then enable prepared-image handoff only for covered, noninteractive ads. Validate ad-origin gestures and SDK accessibility separately; the Native UI counter test does not prove those behaviors.

Android remains a separate backend: preserve the existing rAF coalescing, direct coordinate channel and update sequence guards demonstrated by the AdMob implementation. Do not replace HTML scrolling with root WebView scrolling or promise native-offset tracking that has not been demonstrated on Android.

## Acceptance gates

- The first consumer deletes its copied geometry/image implementation rather than retaining both paths.
- No Ionic, SwiftUI control renderer, Google Mobile Ads SDK or app framework dependency enters the kit.
- Foreground motion does not trigger per-frame capture, full SwiftUI rebuilds or new action messages.
- Snapshot entry performs no capture/encoding/decode wait. Pre-interaction pixels remain usable only while geometry is valid.
- Return ACKs are revision- and source-specific; delayed replies cannot revive disposed views.
- Two plugin scopes and multiple image surfaces cannot clear each other's caches or subscriptions.
- Exercise real WKWebView, regular iPhone/Duo, modal drag/cancel, popover, repeated entry/exit, RTL/fractional geometry and unavailable capture.
- Validate packed npm archives, SwiftPM linkage, dependency publication order and the CocoaPods distribution path before release.

Reference: [Native Ad scroll tracking investigation](https://rdlabo.dev/articles/capacitor-admob-nativead-approaches).
