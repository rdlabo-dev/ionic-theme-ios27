---
title: App-local SwiftUI mini-player
---

# App-local SwiftUI mini-player

The demo's Library tab reimplements the mini-player proposed in PR #248 using the [app-local extension API](./native-ui-extensions.md). Its implementation lives in the application; there is no mini-player component or playback API in the theme package.

- [Web component](../demo/src/app/mini-player/mini-player.component.ts): owns playback state and the Now Playing modal. Play/pause is separate from opening the player. Tap or swipe up on the track opens the same modal.
- [DOM reader](../demo/src/native-ui/mini-player.ts): sends title, artist, playback state and progress, and maps `open` / `toggle` to the original Web buttons.
- [SwiftUI View](../demo/ios/App/App/NativeMiniPlayer.swift): uses `Button`, `ProgressView`, `DragGesture`, and the system tab accessory supplied by the shell. It awaits `NativeUIActions.activate()` rather than duplicating playback state or presenting its own modal.

Register the View once in the app delegate and pass `miniPlayer` in `enableNativeUIShell({ extensions: [miniPlayer] })` (or `enableVerticalControlArea`). Copy these app-local files to adapt the sample to your own playback state and artwork. The sample artwork is bundled in both the Web assets and the app asset catalog, so no image request is needed.

Native placement currently requires **Vertical Bars on iOS 26.1+**, matching the extension host in PR #276. Ordinary tabs, older iOS and browsers retain the Web player. The Web fallback reserves its own bottom-slot space and keeps play state across tab changes. Opening Now Playing retires the native accessory through the shell's existing overlay policy; dismissing it restores the current Web state.

This is a UI example: elapsed time is fixed and no audio engine is started. Applications own playback and reflect current values into the Web DOM. This implementation replaces #248's dedicated UIKit accessory/controller and theme-level mini-player API; it does not include that PR's unrelated segment/browser-support changes or add a system accessory host for ordinary UIKit tabs.
