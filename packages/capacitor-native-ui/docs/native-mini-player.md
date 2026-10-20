---
title: Native UI Extension: Now Playing
---

# Native UI Extension: Now Playing

This example uses the experimental extension API, which may change in future releases.

Use the [app-local extension API](native-ui-extensions.md) to add a SwiftUI mini-player with a Web fallback. The demo's Index → Native UI Extension page provides a sample you can copy into your application.

- [Web component](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/demo/src/app/mini-player/mini-player.component.ts): owns playback state and the Now Playing modal. Play/pause is separate from opening the player. Tap or swipe up on the track opens the same modal.
- [Web renderer + DOM reader](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/demo/src/native-ui/mini-player.ts): renders the Web UI from attributes, sends title, artist and playback state to SwiftUI, and maps `open` / `toggle` to the original Web buttons.
- [SwiftUI View](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/demo/ios/App/App/NativeMiniPlayer.swift): uses `Button`, SF Symbols, `DragGesture`, and a capsule glass background. It awaits `NativeUIActions.activate()` rather than duplicating playback state or presenting its own modal.

The SwiftUI sample uses `NativeUIContext.sourceFrame.width` for compact spacing and `actions.isAvailable(...)` to disable actions whose Web targets are unavailable. See [projection context](native-ui-extensions.md#read-source-geometry-and-presentation-state) for coordinate units and system placement.

Register the View once in the app delegate and pass `miniPlayer` in `enableNativeUIShell({ extensions: [miniPlayer] })`. Copy these app-local files to adapt the sample to your own playback state and artwork. The original sunset artwork is drawn with SwiftUI shapes, with a matching local SVG for the Web. The compact player shows only artwork, track metadata and playback; elapsed time stays in Now Playing.

The sample uses the default **element projection**: SwiftUI follows the Web element’s position and size on iOS 26+, with ordinary tabs or Vertical Bars. Browsers and unsupported environments retain the Web player. Use the **Native extension** toggle to switch native projection on or off. The player starts in Web mode; disabling the extension restores its Web UI. It is shown only on this demo page; leaving the page hides it without resetting playback state.

The Web fallback reserves its own bottom-slot space and keeps play state across tab changes. Opening Now Playing retires the native player through the shell's existing overlay policy; dismissing it restores the current Web state.

This is a UI example: elapsed time is fixed and no audio engine is started. Applications own playback and reflect current values into the Web DOM. Connect your application's audio engine to the sample's playback events before using it as a player.

## Use the Web + SwiftUI set in your application

The local TypeScript file includes both a renderer for an ordinary DOM element and its native reader. Copy it together with `NativeMiniPlayer.swift`; in your app, replace the demo’s relative `defineNativeUI` import with `@rdlabo/capacitor-native-ui`. The Web renderer works without Angular, Capacitor or an enabled Native UI Shell; SwiftUI replaces it only after native accepts the projection.

```ts
import { miniPlayer, mountNowPlaying } from './native-ui/mini-player';
import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui';

const player = document.querySelector<HTMLElement>('[data-mini-player]')!;
const destroyWeb = mountNowPlaying(player); // Run on every platform, including the Web.
player.addEventListener('togglePlayback', () => {
  player.setAttribute('data-playing', String(player.getAttribute('data-playing') !== 'true'));
});
player.addEventListener('openNowPlaying', () => openNowPlaying());
await enableNativeUIShell({ extensions: [miniPlayer] });
// Call destroyWeb() when the application's source element is destroyed.
```

```html
<section data-mini-player data-title="Midnight Drive" data-artist="The Coast" data-playing="true"></section>
```

The sample does not specify `placement`; the default is `'element'`. Applications can opt into `placement: 'tab-accessory'` when they want a system tab accessory; see the [placement options and host requirements](native-ui-extensions.md#content-and-placement-are-independent). Its surrounding Web layout belongs to the application. The same attributes feed the Web view and SwiftUI; both dispatch the same events. The application updates attributes after its playback state changes. Mount into an empty element. The Web renderer owns only its generated children and releases its observer and handlers on teardown. Frameworks own the host's attributes, not those children. Text is rendered as text, never interpreted as HTML.
