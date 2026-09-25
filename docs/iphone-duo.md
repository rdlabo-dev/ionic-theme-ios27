---
title: iPhone Duo support
---

# iPhone Duo support

iPhone Duo folds along a hinge and reserves a physical system rail on one side of the display. On iOS 27.1 and later, the system reports both facts to the app: the rail's edge with its safe-area inset, and the hinge posture while the device opens and closes.

This package provides three independent pieces for that hardware. Each works **without the iOS 27 theme stylesheets** and **without the full Native UI Shell**:

- `dist/css/vertical-bars.css` — opt-in classes that reserve the rail's safe area, plus a registered custom property for a posture-driven split-pane width.
- `enableVerticalControlArea()` — moves eligible tabs and toolbar controls into the reserved area. On Capacitor iOS they are rendered by a native SwiftUI `TabView` and toolbar; everywhere else the same controls appear as Web clones.
- Device-layout reporting — the bundled Capacitor plugin reports rail placement, hinge status and the WebView corner radius through `getDeviceLayout()` and the `deviceLayoutChange` event.

## Choose what to adopt

| Goal                                             | Stylesheet          | Runtime                                                            |
| ------------------------------------------------ | ------------------- | ------------------------------------------------------------------ |
| Hinge posture only (split pane, layout switches) | `vertical-bars.css` | none — subscribe to the plugin directly                            |
| Vertical rail for tabs and toolbar actions       | `vertical-bars.css` | `enableVerticalControlArea()`                                      |
| Native shell plus the rail                       | `vertical-bars.css` | `enableNativeUIShell()` — already includes rail and posture support |

```scss
@use '@rdlabo/ionic-theme-ios27/dist/css/vertical-bars.css';
```

The stylesheet never changes ordinary Ionic UI by itself; every rule requires an opt-in class. Load it unconditionally — these values are simulation and layout inputs, independent from Ionic's normal safe-area variables.

## Read the device layout

`npx cap sync ios` registers the plugin automatically; no `configure` call is needed for device layout. An app that only wants the hinge posture — for example to drive a split pane — uses this API alone, with no projection runtime:

```ts
import { Capacitor } from '@capacitor/core';
import { HingeStatus, IonicNativeUIShell } from '@rdlabo/ionic-theme-ios27/vertical-bars';

// The plugin has no Web implementation; guard the subscription.
if (Capacitor.getPlatform() === 'ios') {
  await IonicNativeUIShell.startDeviceLayoutMonitoring();
  const listener = await IonicNativeUIShell.addListener('deviceLayoutChange', ({ hingeStatus }) => {
    // apply the posture
  });
  const { hingeStatus } = await IonicNativeUIShell.getDeviceLayout(); // initial value

  // When the consumer goes away:
  // await listener.remove();
  // await IonicNativeUIShell.stopDeviceLayoutMonitoring();
}
```

`DeviceLayout` carries:

| Field                   | Meaning                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `placement`             | `{ edge: 'left' \| 'right' \| null, inset }` — the physical rail edge and its UIKit safe-area inset in points; `edge` is `null` on devices without a rail |
| `hingeStatus`           | `HingeStatus.Unavailable` (no hinge), `Closed`, `PartiallyOpen`, or `FullyOpen`                              |
| `webViewMetrics.radius` | the WebView's effective top-left corner radius in points                                                   |

Monitoring is reference-counted: each consumer pairs `startDeviceLayoutMonitoring()` with `stopDeviceLayoutMonitoring()`, and events stop when the last consumer releases it. `getDeviceLayout()` also works without monitoring for a one-shot read. While `enableVerticalControlArea()` or `enableNativeUIShell()` has native projection active it already holds a monitoring reference, so those users only add a listener and read the initial value — no extra start/stop pair.

The plugin reports device facts and never applies them to the DOM. The application decides what each value means for its layout — this boundary keeps the native values easy to mock in tests and keeps the theme's responsibility limited to the stylesheets and runtime below.

## Reserve the vertical rail

Add `.ios-theme-vertical-bars` to `ion-app` to reserve the rail region on the physical right, or add `.ios-theme-vertical-bars-left` as well to use the physical left:

```html
<ion-app class="ios-theme-vertical-bars">...</ion-app>
```

For Chrome development, no native plugin is needed — the class alone reserves `80px` to simulate iPhone Duo. When `setPlacement` receives a native placement, the measured UIKit inset replaces the simulated width, even when that inset is less than `80px`. Override `--ios-theme-vertical-bars-safe-area-left` or `--ios-theme-vertical-bars-safe-area-right` when simulating a different layout.

This keeps routers and component backgrounds full-viewport. `ion-content` moves its scroll foreground, `ion-toolbar` moves its container foreground, and `ion-fab` adjusts only when placed beside the system UI. The corresponding Ionic safe-area variable is reset inside those foreground components so descendants do not add the inset again.

`ion-menu`, `ion-modal`, and `ion-popover` are handled as separate surfaces: their internal foreground components do not receive the main-page conversion and retain Ionic's standard safe-area handling. A menu presented beside the system UI keeps Ionic's full-viewport animation host and offsets only its visible container by the corresponding inset; a menu from the opposite side is unchanged. Left and right remain physical coordinates in RTL, while Ionic's `side="start"` and `side="end"` values remain logical.

The mode is component-mode independent: an app can keep Ionic `mode: 'md'` on iOS and still enable Vertical Bars. No component needs `mode="ios"`.

## Project controls into the rail

Start the standalone runtime once at application startup:

```ts
import { Capacitor } from '@capacitor/core';
import { enableVerticalControlArea, IonicNativeUIShell } from '@rdlabo/ionic-theme-ios27/vertical-bars';

// Start on Chrome too; the Web projection stays idle until the class is present.
const rail = await enableVerticalControlArea();

if (Capacitor.getPlatform() === 'ios') {
  // The runtime already monitors device layout; only subscribe.
  await IonicNativeUIShell.addListener('deviceLayoutChange', ({ placement }) => rail.setPlacement(placement));
  rail.setPlacement((await IonicNativeUIShell.getDeviceLayout()).placement);
}
```

`setPlacement` on the handle and the exported `setVerticalControlAreaPlacement` are the same function; either applies the application's chosen placement to the CSS layout and both projections. Passing `null` restores the ordinary layout. It requires a mounted `ion-app` — call it after the app root exists. The device-layout listener reports what iOS chose; the application decides whether to apply it. An app that wants to keep its own fixed edge can ignore `placement.edge` and pass `'left'` or `'right'`.

Start either `enableVerticalControlArea()` or the full `enableNativeUIShell()` — not both. Repeating the same configuration returns the shared runtime; starting a different configuration while it is active throws an error. The application should have one owner responsible for destroying that runtime. If the app already uses `enableNativeUIShell()`, keep that single runtime and call `setVerticalControlAreaPlacement(placement)` from its listener.

On supported iOS versions the runtime hands eligible tabs, back navigation, menu buttons, and fixed-toolbar actions to a native SwiftUI `TabView` and toolbar; on Web, Android, or when native projection is unavailable, Web clones remain the fallback. Back navigation can come from outside a fixed toolbar; other actions still require one. Fixed-toolbar actions need an icon or SVG, no direct text node, and standard `fill="default"` or `fill="clear"` — text-only actions stay in the original Web toolbar. Add `.ios-theme-horizontal-only` to an `ion-buttons` group or individual `ion-button` to keep it in the horizontal toolbar. Placement is chosen when a routed page enters; changing an existing button's content does not move it between the toolbar and rail until the page leaves and re-enters. Menus, modals, and popovers retain their own toolbar layout.

When the app contains `ion-tabs`, its tab bar moves into the reserved region and aligns above the bottom safe area; the Ionic `slot` value does not select a different position. Without native projection, the stable Web rail is icon-only, matching a four-tab SwiftUI `TabView`. While the user presses and drags across that rail, every icon-and-label tab reveals its label so the pending destination stays identifiable. The Web tab bar receives pointer input in the simulated system region. Use `ion-menu` when navigation should become a sidebar; this mode does not convert tabs into a menu. Web clones also work when no `ion-tabs` exists. Disabling the mode or leaving the page removes the native ownership or Web clones and restores their sources. Override `--ios-theme-vertical-bars-toolbar-top` when the simulated system controls use a different vertical layout.

## Adapt the split pane

For a side-by-side menu on iPhone Duo, opt the `ion-split-pane` into the separately measured Settings layout. The sidebar is 320pt when fully unfolded and reaches the display midpoint when half-opened (50vw). The application supplies the posture; both states have the same viewport width, so a width media query cannot distinguish them:

```html
<ion-split-pane
  [class.ios-theme-split-pane-half-open]="halfOpened"
  contentId="main-content"
  when="(min-width: 900px)"
>
  <ion-menu contentId="main-content">...</ion-menu>
  <div id="main-content">...</div>
</ion-split-pane>
```

Set the ordinary split-pane width to 320pt in the application's stylesheet, and let the half-open class change only the width value:

```css
ion-split-pane {
  --ios-theme-menu-width: var(--ios-theme-split-pane-width);
  --side-width: var(--ios-theme-menu-width);
  --side-max-width: var(--ios-theme-menu-width);
  transition: --ios-theme-split-pane-width 300ms ease;
}
```

The registered `--ios-theme-split-pane-width` defaults to `320px`; `.ios-theme-split-pane-half-open` sets it to `50vw`. Set `halfOpened` when `deviceLayoutChange` reports `HingeStatus.PartiallyOpen` (and read the initial value with `getDeviceLayout`). Ionic's `when` decides whether the menu is a persistent side pane; choose its breakpoint so the pane is hidden when closed — `HingeStatus.Unavailable` means the device has no hinge, so restore the ordinary breakpoint for it. The application chooses where to apply this width rule; an ordinary split pane elsewhere is unchanged. This layout does not enable Vertical Bars or move an overlay menu.

## Vertical Control Area API

The generated reference below documents the handle returned by `enableVerticalControlArea()`.

<docgen-index>

* [`setPlacement(...)`](#setplacement)
* [`getStatus()`](#getstatus)
* [`suspend()`](#suspend)
* [`destroy()`](#destroy)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### setPlacement(...)

```typescript
setPlacement(placement: VerticalBarEdge | VerticalBarPlacement) => void
```

Applies the application's chosen placement to both Web and native controls.

| Param           | Type                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **`placement`** | <code><a href="#verticalbaredge">VerticalBarEdge</a> \| <a href="#verticalbarplacement">VerticalBarPlacement</a></code> |

--------------------


### getStatus()

```typescript
getStatus() => NativeUIShellStatus
```

Returns the current Web/native projection state.

**Returns:** <code><a href="#nativeuishellstatus">NativeUIShellStatus</a></code>

--------------------


### suspend()

```typescript
suspend() => Promise<NativeUIShellSuspension>
```

Restores projected controls to the Web until the returned lease is resumed.

**Returns:** <code>Promise&lt;<a href="#nativeuishellsuspension">NativeUIShellSuspension</a>&gt;</code>

--------------------


### destroy()

```typescript
destroy() => Promise<void>
```

Stops synchronization, restores Web controls and releases native resources.

--------------------


### Interfaces


#### VerticalBarPlacement

| Prop        | Type                                                        | Description                                                         |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| **`edge`**  | <code><a href="#verticalbaredge">VerticalBarEdge</a></code> |                                                                     |
| **`inset`** | <code>number</code>                                         | UIKit safe-area inset on the physical vertical-bar edge, in points. |


#### NativeUIShellStatus

| Prop            | Type                                        |
| --------------- | ------------------------------------------- |
| **`state`**     | <code>'native' \| 'stopped' \| 'web'</code> |
| **`projected`** | <code>number</code>                         |
| **`updates`**   | <code>number</code>                         |
| **`reason`**    | <code>string</code>                         |


#### NativeUIShellSuspension

| Method     | Signature                    | Description                                                                                    |
| ---------- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| **resume** | () =&gt; Promise&lt;void&gt; | Releases this suspension. Native projection resumes after all active suspensions are released. |


### Type Aliases


#### VerticalBarEdge

<code>'left' | 'right' | null</code>

</docgen-api>
