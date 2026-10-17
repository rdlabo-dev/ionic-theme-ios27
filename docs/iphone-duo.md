---
title: iPhone Duo support (preview)
---

# iPhone Duo support (preview)

Adapt your Ionic app to iPhone Duo: place navigation and actions in its vertical system rail, and adjust your split pane as the device opens and closes. Existing Ionic markup remains the source of labels, icons, routing, and click handlers.

**New here?** Start with [iPhone Duo with your existing theme](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo-with-original-theme) to preview the side layout in Chrome. This page explains device events, placement and split panes. [Vertical Bars](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/vertical-bars) documents control projection and the runtime API.

Available in `1.2.0` as a **preview** feature alongside [Native UI Shell](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/native-ui-shell). APIs and supported behavior may change before stable status. Stable status is planned after the official release of Xcode 27.1. The real system rail and hinge reporting require iOS 27.1 or later and an app built with Xcode 27.1 or newer.

This package provides two independent pieces for that hardware. Each works **without the iOS 27 theme stylesheets** and **without the full Native UI Shell**:

- `dist/css/vertical-bars.css` — opt-in classes that reserve the rail's safe area, plus a registered custom property for a posture-driven split-pane width.
- `enableVerticalControlArea()` — moves eligible tabs and toolbar controls into the reserved area. On Capacitor iOS they are rendered by a native SwiftUI `TabView` and toolbar; everywhere else the same controls appear as Web clones.

Device state belongs to [`@erkamyaman/capacitor-foldable`](https://github.com/erkamyaman/capacitor-foldable). The **application** subscribes to its events and chooses its layout. This package's **stylesheet and runtime** apply that decision by reserving space, projecting controls and adapting the split pane. The theme does not monitor hinge state or bar placement.

## Choose what to adopt

To keep your existing theme and add only the standalone support, follow [iPhone Duo with your existing theme](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo-with-original-theme). This page covers the shared device-layout rules.

| Goal                                             | Stylesheet          | Runtime                                                            |
| ------------------------------------------------ | ------------------- | ------------------------------------------------------------------ |
| Hinge posture only (layout switches) | none | none — subscribe to `Foldable` directly |
| Posture-driven split-pane width | `vertical-bars.css` | none — subscribe to `Foldable` directly |
| Vertical rail for tabs and toolbar actions       | `vertical-bars.css` | `enableVerticalControlArea()`                                      |
| Native shell plus the rail                       | `vertical-bars.css` | `enableNativeUIShell()` — includes rail projection |

```scss
@use '@rdlabo/ionic-theme-ios27/dist/css/vertical-bars.css';
```

The stylesheet never changes ordinary Ionic UI by itself; every rule requires an opt-in class. Load it unconditionally — these values are simulation and layout inputs, independent from Ionic's normal safe-area variables.

The `/vertical-bars` entry point imports `@capacitor/core` at module load, so install it even for Web-only use (it is an optional peer dependency). Apps that want only the stylesheet and its opt-in classes need nothing else.

## Read the device layout

Install the device-state plugin in the application, then sync the native project:

```bash
npm install @erkamyaman/capacitor-foldable
npx cap sync
```

Use Capacitor 8.5 or later and build with Xcode 27.1 or newer for iPhone Duo's iOS 27.1 APIs. The dependency is needed for device-driven layout, not for the theme's CSS, browser simulation, or native control projection alone. Do not import the plugin's `ionic-tabs.css` alongside this package's rail projection; both would reposition the same tabs.

After `ion-app` is mounted, pass device state to `applyFoldStateClasses`. The application owns subscriptions and cleanup. No projection runtime is needed for posture-driven layout.

```ts
import { Foldable } from '@erkamyaman/capacitor-foldable';
import { applyFoldStateClasses } from '@ionic-theme/capacitor-native-ui/vertical-bars';

const root = document.querySelector('ion-app')!;
const listener = await Foldable.addListener('foldStateChange', (fold) => applyFoldStateClasses(root, fold));
applyFoldStateClasses(root, await Foldable.getFoldState());
```

When the application owner is disposed:

```ts
await listener.remove();
```

Subscribe to changes, then read the current state. The same helper handles initial values and events.

`applyFoldStateClasses` keeps one of `ios-theme-fold-flat`, `ios-theme-fold-half-opened`, and `ios-theme-fold-closed` on the supplied root, preserving unrelated classes. It also sets `ios-theme-fold-expanded` for a half-opened state or a flat state with hinge geometry. A flat state without geometry (including the Web fallback) and a closed state clear that class. The helper does not subscribe to the plugin or change Ionic's split-pane `when` property.

For rail placement, use `setVerticalControlAreaPlacement` as shown below. Pass the reported logical edge as both `edge` and `nativeEdge`, together with the measured `inset`. Leading is the physical left in LTR and the physical right in RTL. A null edge restores the ordinary layout; an inset of zero clears the explicit width. No start/stop monitoring calls are needed.

WebView corner radius remains a rendering concern: `configureNativeTransition()` uses the shell's `getWebViewMetrics()` API, independently of `Foldable`.

**Migration:** the theme's former `DeviceLayout`, `HingeStatus`, `getDeviceLayout()`, `deviceLayoutChange`, and start/stop device-layout monitoring APIs have been removed. Replace device subscriptions with the `Foldable` APIs above; use `getWebViewMetrics()` for one-shot radius reads. Foldable can infer Duo bar placement from safe-area insets when the app is built without the iOS 27.1 SDK. Hinge data still requires the newer SDK. Apps can also request a fixed rail placement independently of the reported edge.

## Reserve the vertical rail

Load `vertical-bars.css` as shown above. For class-based browser simulation, safe-area handling, RTL and overlay layout, see [Reserve the vertical rail](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/vertical-bars#reserve-the-vertical-rail). On device, the placement helper below applies the layout classes and measured inset.

## Project controls into the rail

Start the standalone runtime once after `ion-app` is mounted, and apply the plugin's placement with `setVerticalControlAreaPlacement`:

```ts
import { Foldable } from '@erkamyaman/capacitor-foldable';
import { setVerticalControlAreaPlacement, enableVerticalControlArea } from '@ionic-theme/capacitor-native-ui/vertical-bars';

const rail = await enableVerticalControlArea();
const listener = await Foldable.addListener('barPlacementChange', ({ verticalBarEdge, inset }) =>
  setVerticalControlAreaPlacement({ edge: verticalBarEdge, nativeEdge: verticalBarEdge, inset }),
);
const { verticalBarEdge, inset } = await Foldable.getBarPlacement();
setVerticalControlAreaPlacement({ edge: verticalBarEdge, nativeEdge: verticalBarEdge, inset });
```

When the application owner is disposed:

```ts
await listener.remove();
await rail.destroy();
```

Supply `nativeEdge` on both the initial read and each event so the renderer knows which rail the system actually provides. The measured `inset` is passed through instead of assuming a fixed width. Devices without a reported rail, including Web and Android, return a null edge and retain the ordinary layout. For browser simulation, use the [class-based preview](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/vertical-bars#reserve-the-vertical-rail) without connecting device placement.

Start either `enableVerticalControlArea()` or the full `enableNativeUIShell()` — not both. If the app already uses Native UI Shell, keep that runtime and use the same `setVerticalControlAreaPlacement` callback. The application owner removes its listeners and destroys its runtime on teardown.

On supported iOS versions the runtime hands eligible tabs, back navigation, menu buttons, and fixed-toolbar actions to a native SwiftUI `TabView` and toolbar; on Web, Android, or when native projection is unavailable, Web clones remain the fallback. See [Toolbar actions](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/vertical-bars#toolbar-actions) for control eligibility.

### Toolbar actions

See [Vertical Bars: Toolbar actions](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/vertical-bars#toolbar-actions) for eligible markup, placement, button appearance and local overrides.

### Tab bar

See [Vertical Bars: Tab bar](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/vertical-bars#tab-bar) for navigation, labels and Web fallback behavior.

## Adapt the split pane

For a side-by-side menu on iPhone Duo, opt the `ion-split-pane` into the separately measured Settings layout. The sidebar is 320pt when fully unfolded and reaches the display midpoint when half-opened (50vw). The application supplies the posture; both states have the same viewport width, so a width media query cannot distinguish them:

```html
<ion-split-pane
  class="split-pane-fold-layout"
  contentId="main-content"
  when="(min-width: 900px)"
>
  <ion-menu contentId="main-content">...</ion-menu>
  <div id="main-content">...</div>
</ion-split-pane>
```

Set the ordinary split-pane width to 320pt in the application's stylesheet, and let the half-open class change only the width value:

```css
ion-split-pane.split-pane-fold-layout {
  --ios-theme-menu-width: var(--ios-theme-split-pane-width);
  --side-width: var(--ios-theme-menu-width);
  --side-max-width: var(--ios-theme-menu-width);
  transition: --ios-theme-split-pane-width 300ms ease;
}
```

The registered `--ios-theme-split-pane-width` defaults to `320px`. `applyFoldStateClasses` sets `ios-theme-fold-half-opened` on `ion-app`; the stylesheet then sets only descendant split panes with `split-pane-fold-layout` to `50vw`. Add this opt-in class once; no state-dependent class binding is needed. Other split panes retain their existing width.

Ionic's `when` still controls whether the menu is persistent. The example chooses a fixed 900px breakpoint. If your app needs different breakpoints for folded and ordinary displays, use the `ios-theme-fold-expanded` class applied by the helper to select that policy in your application's layout code. The helper only updates state classes, not `when`. This layout does not enable Vertical Bars or move an overlay menu.

## Vertical Control Area API

The runtime handle reference is maintained in [Vertical Bars](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/vertical-bars#vertical-control-area-api).
