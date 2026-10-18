---
title: iPhone Duo with your existing theme (preview)
---

# iPhone Duo with your existing theme (preview)

Add a vertical navigation area to your Ionic app while keeping its existing theme. Tabs and supported toolbar actions move to the side of the screen; your content and horizontal controls keep their current appearance. Both Ionic `ios` and `md` modes are supported.

**Try it in Chrome first.** You can preview the layout with Web controls before setting up an iPhone Duo or an iOS build. On supported Capacitor iOS, the same Ionic markup supplies native SwiftUI controls in the system rail.

Available in `1.2.0` as a **preview** feature. APIs and supported behavior may change.

## Try it in your existing Ionic app

### 1. Install and load the standalone stylesheet

This guide assumes an existing Ionic app with Ionic `>=8.8.1 <10` and Capacitor Core `>=8 <9`. Keep your existing Capacitor 8 installation. If your app uses another Capacitor major, migrate its Core, CLI, and platform packages together before following this guide. For a Web-only app without Capacitor, also install `@capacitor/core@^8`; the JavaScript entry point needs it even in Chrome.

```bash
npm install @rdlabo/ionic-theme-ios27 @rdlabo/capacitor-native-ui
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
import { withNativeUIShellTransition } from '@rdlabo/ionic-theme-ios27';

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
import { withNativeUIShellTransition } from '@rdlabo/ionic-theme-ios27';

// Pass the animation builder your app already uses.
const configureNavigation = (existingTransition: AnimationBuilder) => ({
  navAnimation: withNativeUIShellTransition(existingTransition),
});
```

The adapter returns the original `Animation`, preserving its effects, duration, and easing. Use it only for navigation, not modal or popover animations. The builder must return a fresh `Animation` for each navigation; Ionic destroys it after the transition. Keep lifecycle events for control registration and transitions without animation.

The adapter keeps the builder's animation targets, including any horizontal back-button effect. If you need the iOS 27 transition with that effect excluded in vertical layouts, use `iosTransitionAnimation` from `@rdlabo/ionic-theme-ios27` as your `navAnimation` instead. It already includes the adapter, so no wrapper is needed.

### 4. Start the controls after the app root is mounted

Call this once from your application startup after `ion-app` exists in the DOM:

```ts
import { enableVerticalControlArea } from '@rdlabo/capacitor-native-ui/vertical-bars';

const rail = await enableVerticalControlArea();
```

**What you should see:** your existing tab bar moves to the side, and fixed-toolbar buttons with an `ion-icon` or SVG using `slot="icon-only"` appear there too. Content keeps its existing theme and leaves room for the controls. The Web tab rail displays icons; pressing and dragging reveals tab labels.

Use your existing Ionic click handlers, routing, and form associations. All button fills (`default`, `clear`, `solid`, and `outline`) use the same `icon-only` rule, including submit buttons. Actions without that slot remain horizontal. Add `.ios-theme-horizontal-only` to an `ion-buttons` group or individual `ion-button` to keep an action in the horizontal toolbar.

When the application owner is disposed, call `await rail.destroy()` to restore the original controls and release the runtime. If you already use `enableNativeUIShell()`, keep that runtime and follow the [shared placement guide](iphone-duo.md#project-controls-into-the-rail).

### Optional: choose native button appearance

`buttonProjection` and local projection settings are available in `1.2.0`. See [Choose button appearance](../../packages/capacitor-native-ui/docs/vertical-bars.md#choose-button-appearance) for availability and migration details.

The new default is `system`: SwiftUI styles vertical buttons and tints their icons. If your existing theme should supply their fill and colors, use:

```ts
const rail = await enableVerticalControlArea({ buttonProjection: 'source', buttonDefaultFill: 'solid' });
```

The `solid` default suits ordinary Ionic buttons. Buttons inside `ion-buttons` still default to clear; set `fill="solid"` explicitly to project their background. For one-off exceptions, use the [local projection settings](../../packages/capacitor-native-ui/docs/vertical-bars.md#override-individual-buttons-or-groups). These settings affect native vertical buttons only; Web clones keep their existing appearance.

### If the preview does not appear

| What you see | What to check |
| --- | --- |
| No space at the side | Load `vertical-bars.css` and put the class on `ion-app`. |
| Space appears, but controls stay horizontal | Start `enableVerticalControlArea()` after mounting the app root. Use existing tabs or `slot="icon-only"` actions in a fixed header/footer toolbar. |
| One action stays horizontal | Check for `slot="icon-only"` on the icon and a fixed toolbar outside scrolling content. Explicitly excluded controls and controls in centered modals stay horizontal; `fill` and `type="submit"` do not prevent movement. See [control requirements](../../packages/capacitor-native-ui/docs/vertical-bars.md#toolbar-actions). |

## Connect an iPhone Duo

Install [`@erkamyaman/capacitor-foldable`](https://github.com/erkamyaman/capacitor-foldable) for device state:

```bash
npm install @erkamyaman/capacitor-foldable
npx cap sync ios
```

Use Capacitor 8.5 or later and build with Xcode 27.1 or newer for actual rail placement and hinge posture on iOS 27.1. Native UI Shell uses Swift Package Manager; existing CocoaPods apps can follow [Native UI Shell setup](../../packages/capacitor-native-ui/docs/native-ui-shell.md#enable-the-shell). Keep this package's `vertical-bars.css`; the device plugin's `ionic-tabs.css` is not needed with our rail projection.

Replace the browser-only startup with the [device placement setup](iphone-duo.md#project-controls-into-the-rail). That setup sends initial values and `barPlacementChange` events to `setVerticalControlAreaPlacement({ edge: verticalBarEdge, nativeEdge: verticalBarEdge, inset })`, with subscriptions and cleanup kept in your application.

Pass both the requested and native edge with Foldable's measured inset. The placement API resolves RTL. A null edge restores the ordinary layout.

On supported iOS, controls in the rail use native SwiftUI rendering; your custom Web styling still applies to ordinary content and horizontal controls. Web and Android use Web clones.

## Use hinge posture without projecting controls

If your existing theme needs only a posture-driven split pane or a layout switch, do not start a projection runtime or add `.ios-theme-vertical-bars`. Pass `Foldable.getFoldState()` results and `foldStateChange` events to `applyFoldStateClasses(root, fold)`, removing the listener when finished. There is no separate start/stop monitoring call.

See [Read the device layout](iphone-duo.md#read-the-device-layout) for the subscription example, null values, and monitoring lifetime. See [Adapt the split pane](iphone-duo.md#adapt-the-split-pane) for the opt-in width rules and half-open state.

## Shared layout rules and API

Safe-area handling, overlays, RTL, control eligibility, Web simulation, and the handle API are documented in [Vertical Bars](../../packages/capacitor-native-ui/docs/vertical-bars.md). Those rules apply to this standalone setup too.
