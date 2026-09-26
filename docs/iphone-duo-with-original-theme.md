---
title: iPhone Duo with your existing theme (experimental)
---

# iPhone Duo with your existing theme (experimental)

Add a vertical navigation area to your Ionic app while keeping its existing theme. Tabs and supported toolbar actions move to the side of the screen; your content and horizontal controls keep their current appearance. Both Ionic `ios` and `md` modes are supported.

**Try it in Chrome first.** You can preview the layout with Web controls before setting up an iPhone Duo or an iOS build. On supported Capacitor iOS, the same Ionic markup supplies native SwiftUI controls in the system rail.

Available in `1.2.0-0` as an **experimental** feature. APIs and supported behavior may change.

## Try it in your existing Ionic app

### 1. Install and load the standalone stylesheet

This guide assumes an existing Ionic app with Ionic `>=8.8.1 <10` and Capacitor Core `>=8 <9`. Keep your existing Capacitor 8 installation. If your app uses another Capacitor major, migrate its Core, CLI, and platform packages together before following this guide. For a Web-only app without Capacitor, also install `@capacitor/core@^8`; the JavaScript entry point needs it even in Chrome.

```bash
npm install @rdlabo/ionic-theme-ios27@1.2.0-1
```

Keep your existing theme imports. Add this to your global Sass file:

```scss
@use '@rdlabo/ionic-theme-ios27/dist/css/vertical-bars.css';
```

The standalone JavaScript entry point needs `@capacitor/core` even in Chrome. The iOS 27 theme stylesheets are not required.

### 2. Opt your app into the side layout

Add the class to your existing app root and keep the content inside it:

```html
<ion-app class="ios-theme-vertical-bars">
  <!-- Keep your existing pages, tabs, and toolbar controls here. -->
</ion-app>
```

The preview reserves `80px` on the physical right. To preview the left side, also add `ios-theme-vertical-bars-left`.

### 3. Connect your navigation animation

Configure `navAnimation` before Ionic initializes. Starting the rail runtime does not register this option. The adapter waits for native control retirement and coordinates swipe progress and cancellation while keeping your existing animation.

#### Keep Ionic's default animation

If you have not configured `navAnimation`, wrap Ionic's standard builders. Select the builder from Ionic's transition `mode` so both `ios` and `md` keep their usual animation:

```ts
import { iosTransitionAnimation, mdTransitionAnimation, type AnimationBuilder } from '@ionic/core';
import { withNativeUIShellTransition } from '@rdlabo/ionic-theme-ios27/vertical-bars';

const defaultTransition: AnimationBuilder = (baseEl, opts) =>
  (opts.mode === 'ios' ? iosTransitionAnimation : mdTransitionAnimation)(baseEl, opts);

const ionicConfig = {
  navAnimation: withNativeUIShellTransition(defaultTransition),
};
```

Merge this option into your existing Ionic configuration before initialization: pass it to Angular's `provideIonicAngular()`, React's `setupIonicReact()`, or Vue's `IonicVue` plugin options. Keep your existing theme stylesheet imports. No iOS 27 theme stylesheet is required.

#### Use this package's iOS animation

If you already use the iOS 27 transition, keep this configuration. It includes the native adapter and excludes the horizontal back-button effect in vertical layouts; no additional wrapper is needed. Importing this JavaScript entry point does not load the theme stylesheets.

```ts
import { iosTransitionAnimation } from '@rdlabo/ionic-theme-ios27';

const ionicConfig = {
  navAnimation: iosTransitionAnimation,
};
```

Apply this option to your existing iOS-mode configuration and keep your MD configuration.

#### Keep your custom animation

If your app uses another builder for `navAnimation`, wrap it:

```ts
import type { AnimationBuilder } from '@ionic/core';
import { withNativeUIShellTransition } from '@rdlabo/ionic-theme-ios27/vertical-bars';

// Pass the animation builder your app already uses.
const configureNavigation = (existingTransition: AnimationBuilder) => ({
  navAnimation: withNativeUIShellTransition(existingTransition),
});
```

The adapter returns the original `Animation`, preserving its effects, duration, and easing. Use it only for navigation, not modal or popover animations. The builder must return a fresh `Animation` for each navigation; Ionic destroys it after the transition. Keep lifecycle events for control registration and transitions without animation.

The adapter keeps the builder's animation targets, including any horizontal back-button effect. If you need the iOS 27 transition with that effect excluded in vertical layouts, use `iosTransitionAnimation` from `@rdlabo/ionic-theme-ios27` as your `navAnimation` instead. It already includes the adapter, so no wrapper is needed.

`withNativeUIShellTransition()` is available in `1.2.0-1` and later.

### 4. Start the controls after the app root is mounted

Call this once from your application startup after `ion-app` exists in the DOM:

```ts
import { enableVerticalControlArea } from '@rdlabo/ionic-theme-ios27/vertical-bars';

const rail = await enableVerticalControlArea();
```

**What you should see:** your existing tab bar moves to the side, and supported icon-based fixed-toolbar actions appear there too. Content keeps its existing theme and leaves room for the controls. The Web tab rail displays icons; pressing and dragging reveals tab labels.

Use your existing Ionic click handlers and routing. Text-only toolbar actions remain horizontal. Add `.ios-theme-horizontal-only` to an `ion-buttons` group or individual `ion-button` to keep an action in the horizontal toolbar.

When the application owner is disposed, call `await rail.destroy()` to restore the original controls and release the runtime. If you already use `enableNativeUIShell()`, keep that runtime and follow the [shared placement guide](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo#project-controls-into-the-rail).

### If the preview does not appear

| What you see | What to check |
| --- | --- |
| No space at the side | Load `vertical-bars.css` and put the class on `ion-app`. |
| Space appears, but controls stay horizontal | Start `enableVerticalControlArea()` after mounting the app root. Use existing tabs or supported icon-based actions in a fixed toolbar. |
| One action stays horizontal | Text-only actions, custom fills, and explicitly excluded controls keep their original presentation. See [control requirements](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo#project-controls-into-the-rail). |

## Connect an iPhone Duo

For Capacitor iOS, run `npx cap sync ios`. Build with Xcode 27.1 or newer and link against the iOS 27.1 SDK or later to receive the actual rail edge, safe-area inset, and hinge posture. The plugin uses Swift Package Manager; existing CocoaPods apps can follow [Native UI Shell setup](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/native-ui-shell#enable-the-shell).

Replace the browser-only startup above with this after `ion-app` is mounted:

```ts
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { enableVerticalControlArea, IonicNativeUIShell } from '@rdlabo/ionic-theme-ios27/vertical-bars';

const rail = await enableVerticalControlArea();
let layoutListener: PluginListenerHandle | undefined;

if (Capacitor.getPlatform() === 'ios') {
  // The runtime already monitors device layout; only subscribe.
  layoutListener = await IonicNativeUIShell.addListener('deviceLayoutChange', ({ placement }) =>
    rail.setPlacement(placement),
  );
  rail.setPlacement((await IonicNativeUIShell.getDeviceLayout()).placement);
}

// Call when the application owner is disposed.
const stopVerticalArea = async () => {
  await layoutListener?.remove();
  await rail.destroy();
};
```

`setPlacement()` applies the measured inset and resolves the logical edge through the document direction. A `null` edge restores the ordinary layout. Devices without a rail and apps built with older SDKs report `null`, so this example restores the ordinary layout there. To deliberately preview a DOM rail on such an iOS build, have your application choose a fixed edge with `rail.setPlacement('trailing')` instead of applying that null placement. This simulates the layout; it does not provide a real system rail or hinge measurements.

On supported iOS, controls in the rail use the system SwiftUI appearance; your custom Web styling still applies to ordinary content and horizontal controls. Web and Android use Web clones.

## Use hinge posture without projecting controls

If your existing theme needs only a posture-driven split pane or a layout switch, do not start a projection runtime or add `.ios-theme-vertical-bars`. Use `getDeviceLayout()` and `deviceLayoutChange` directly, pairing `startDeviceLayoutMonitoring()` with `stopDeviceLayoutMonitoring()` and removing the listener when finished.

See [Read the device layout](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo#read-the-device-layout) for the subscription example, null values, and monitoring lifetime. See [Adapt the split pane](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo#adapt-the-split-pane) for the opt-in width rules and half-open state.

## Shared layout rules and API

Safe-area handling, overlays, RTL, control eligibility, Web simulation, and the handle API are documented in [iPhone Duo support](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo). Those rules apply to this standalone setup too.
