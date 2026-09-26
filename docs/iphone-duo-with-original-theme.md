---
title: iPhone Duo with your existing theme (experimental)
---

# iPhone Duo with your existing theme (experimental)

Keep your application's existing Ionic theme and add only iPhone Duo support. This setup is experimental, like [Native UI Shell](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/native-ui-shell); its APIs and supported behavior may change.

The standalone Vertical Control Area does not require the iOS 27 theme stylesheets or the full Native UI Shell. Ordinary content and horizontal controls retain your existing theme. On supported Capacitor iOS, eligible controls in the vertical area use the system's native SwiftUI appearance. This does not reproduce your custom Web theme in native controls. Web clones provide the fallback on Web, Android, and when native projection is unavailable.

## Install the standalone support

Install the prerelease and its Capacitor peer dependency:

```bash
npm install @rdlabo/ionic-theme-ios27@1.2.0-0 @capacitor/core@^8
```

Keep your existing theme imports. Add only this stylesheet to your global Sass file:

```scss
@use '@rdlabo/ionic-theme-ios27/dist/css/vertical-bars.css';
```

It is independent of the normal theme stylesheets and requires opt-in classes. The `/vertical-bars` entry point imports `@capacitor/core` even for Web-only use. Stylesheet-only use needs no runtime or Capacitor dependency.

For Capacitor iOS, run `npx cap sync ios`. The plugin uses Swift Package Manager; see [Native UI Shell setup](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/native-ui-shell#enable-the-shell) for existing CocoaPods apps. The real system rail and hinge reporting require Xcode 27.1 or newer and linking against the iOS 27.1 SDK or later. Older toolchains retain the DOM-driven compatibility layout, without native rail measurements or hinge posture.

## Enable the vertical area

Opt the app into the rail layout:

```html
<ion-app class="ios-theme-vertical-bars">...</ion-app>
```

The class reserves the physical right side; also add `ios-theme-vertical-bars-left` for the physical left. Without a native measurement, it reserves `80px` for development. The runtime's `setPlacement()` resolves the plugin's logical edge through the document's direction and applies the measured inset. Passing `null` restores the ordinary layout.

After `ion-app` is mounted, start the runtime once and apply device placement:

```ts
import { Capacitor } from '@capacitor/core';
import { enableVerticalControlArea, IonicNativeUIShell } from '@rdlabo/ionic-theme-ios27/vertical-bars';

const rail = await enableVerticalControlArea();

if (Capacitor.getPlatform() === 'ios') {
  // The runtime already monitors device layout; only subscribe.
  await IonicNativeUIShell.addListener('deviceLayoutChange', ({ placement }) => rail.setPlacement(placement));
  rail.setPlacement((await IonicNativeUIShell.getDeviceLayout()).placement);
}
```

Keep one application owner for the runtime and remove the listener and call `rail.destroy()` when that owner is disposed. Do not start `enableNativeUIShell()` as well. If your app already uses the full shell, keep that runtime and use `setVerticalControlAreaPlacement()` instead.

The vertical area supports eligible tabs, back navigation, menu buttons, and icon-based fixed-toolbar actions. Text-only actions remain in the horizontal toolbar. Add `.ios-theme-horizontal-only` to an `ion-buttons` group or individual `ion-button` to keep it there. This mode works with both Ionic `ios` and `md` component modes; it does not require changing your existing mode.

## Use hinge posture without projecting controls

If your existing theme needs only a posture-driven split pane or a layout switch, do not start a projection runtime or add `.ios-theme-vertical-bars`. Use `getDeviceLayout()` and `deviceLayoutChange` directly, pairing `startDeviceLayoutMonitoring()` with `stopDeviceLayoutMonitoring()` and removing the listener when finished.

See [Read the device layout](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo#read-the-device-layout) for the subscription example, null values, and monitoring lifetime. See [Adapt the split pane](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo#adapt-the-split-pane) for the opt-in width rules and half-open state.

## Shared layout rules and API

Safe-area handling, overlays, RTL, control eligibility, Web simulation, and the handle API are documented in [iPhone Duo support](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo). Those rules apply to this standalone setup too.
