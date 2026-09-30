---
title: Vertical Bars (preview)
---

# Vertical Bars (preview)

Vertical Bars moves eligible Ionic navigation and actions into a side rail while keeping the original components as the source of labels, icons and behavior. It works with this theme or an existing Ionic theme, independently of hinge posture and the full Native UI Shell.

Use this page for layout, control eligibility, native button appearance and the runtime API. For device events and split panes, see [iPhone Duo support](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo). For a step-by-step browser preview and native setup, start with [iPhone Duo with your existing theme](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo-with-original-theme).

Available in `1.2.0` as a **preview** feature. APIs and supported behavior may change.

## Enable Vertical Bars

Load the opt-in stylesheet:

```scss
@use '@rdlabo/ionic-theme-ios27/dist/css/vertical-bars.css';
```

After `ion-app` is mounted, start one runtime:

```ts
import { enableVerticalControlArea } from '@rdlabo/ionic-theme-ios27/vertical-bars';

const rail = await enableVerticalControlArea();
```

Add the layout class below for browser simulation, or [apply device placement](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo#project-controls-into-the-rail) for an iPhone Duo. The application owns placement and cleanup: call `await rail.destroy()` when its owner is disposed. If you already use `enableNativeUIShell()`, keep that runtime; it includes Vertical Bars. Do not start both.

The `/vertical-bars` entry point requires `@capacitor/core`, including in browser builds. CSS-only use needs no runtime. For native setup and navigation transitions, follow the [existing-theme guide](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo-with-original-theme).

On supported Capacitor iOS, eligible controls use native SwiftUI rendering. Web, Android and unavailable native projection use Web clones. A browser preview can verify layout and actions, but cannot compare native button appearance.

## Reserve the vertical rail

Add `.ios-theme-vertical-bars` to `ion-app` to reserve the rail region on the physical right, or add `.ios-theme-vertical-bars-left` as well to use the physical left:

```html
<ion-app class="ios-theme-vertical-bars">...</ion-app>
```

The classes are physical — `-left` always means the physical left edge — because CSS and the native renderer work in physical coordinates. `setVerticalControlAreaPlacement` applies the logical `verticalBarEdge` reported by the device plugin and resolves it through the document's direction, so an RTL app does not need its own conversion.

For Chrome development, no native plugin is needed — the class alone reserves `80px` to simulate iPhone Duo. When `setVerticalControlAreaPlacement` receives `{ edge, nativeEdge, inset }`, the inset replaces the fallback width, even when it is less than `80px`. Override `--ios-theme-vertical-bars-safe-area-left` or `--ios-theme-vertical-bars-safe-area-right` when simulating a different layout.

This keeps routers and component backgrounds full-viewport. `ion-content` moves its scroll foreground, `ion-toolbar` moves its container foreground, and `ion-fab` adjusts only when placed beside the system UI. The corresponding Ionic safe-area variable is reset inside those foreground components so descendants do not add the inset again.

`ion-modal` applies the same foreground correction when its visible dialog spans the viewport width. With the Vertical Control Area runtime enabled, the topmost full-width modal also projects eligible toolbar buttons into its own rail; centered dialogs keep their toolbar buttons and receive no page-rail inset. This includes full-width sheet modals: their rail follows the visible sheet bounds as the breakpoint changes. Eligibility follows the visible dialog width, not the hinge posture or modal type. `ion-menu` and `ion-popover` are handled as separate surfaces: their internal foreground components do not receive the main-page conversion and retain Ionic's standard safe-area handling. A menu presented beside the system UI keeps Ionic's full-viewport animation host and offsets only its visible container by the corresponding inset; a menu from the opposite side is unchanged. Left and right remain physical coordinates in RTL, while Ionic's `side="start"` and `side="end"` values remain logical.

The mode is component-mode independent: an app can keep Ionic `mode: 'md'` on iOS and still enable Vertical Bars. No component needs `mode="ios"`.

## Native rendering

On supported iOS versions, adding `.ios-theme-vertical-bars` changes only controls that the system relocates into the physical side rail. Native UI Shell presents eligible tabs, back navigation, menu buttons, and toolbar actions through a SwiftUI `TabView` and toolbar once the class is applied. When the OS reports a rail edge — on iPhone Duo linked against iOS 27.1 or later — it must agree with the applied placement; a disagreeing report keeps the rail on the Web. Older toolchains that cannot report an edge trust the DOM placement directly. SwiftUI owns their adaptive placement and Liquid Glass appearance; Ionic remains the source of labels, icons, selected/disabled state, routing, form submission, and click handlers.

The SwiftUI surface is clipped and hit-tested to the system rail. Web content remains visible and interactive outside that physical region. The runtime optimistically updates tab selection before forwarding the action to the original `ion-tab-button`, using the same event and stale-revision protection as the other native controls. Overlay layout follows the [rail reservation rules](#reserve-the-vertical-rail).


## Toolbar actions

A standard `ion-back-button` can project from outside a fixed toolbar, including routed content or a persistent app shell. `ion-menu-button` and other toolbar actions require a fixed toolbar.

An `ion-button` moves into the rail when it contains an `ion-icon` or SVG with `slot="icon-only"`. The button must be in a fixed `ion-toolbar` directly inside `ion-header` or `ion-footer`, outside scrolling `ion-content`.

| Icon markup | Placement |
| --- | --- |
| `slot="icon-only"` | Vertical rail |
| `slot="start"`, `slot="end"`, or no slot | Original horizontal toolbar |
| No icon | Original horizontal toolbar |

```html
<ion-header>
  <ion-toolbar>
    <ion-buttons slot="end">
      <ion-button aria-label="Done">
        <ion-icon name="checkmark-outline" slot="icon-only"></ion-icon>
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</ion-header>
```

All fills (`default`, `clear`, `solid`, and `outline`) and Ionic colors follow this placement rule. Keep accessible names and the original click or form-submit handlers on the source buttons. `type="submit"` and `.button-submit` do not select a different placement.

The rule applies to individual buttons and buttons inside `ion-buttons`, on ordinary pages and in the topmost full-width modal. Centered modals, menus, and popovers keep their own toolbar layout. Add `.ios-theme-horizontal-only` to a group or individual button to keep it horizontal. Placement is chosen when a routed page enters; changing an existing button's content or icon slot does not move it between the toolbar and rail until the page leaves and re-enters.

A toolbar whose element content has all moved into the rail collapses while projection is active. Toolbars containing a title, other content or a horizontal-only control remain visible. Removing projection restores the original toolbar.

### Choose button appearance

`buttonProjection` and the local projection settings below are available in `1.2.0`.

For native vertical `ion-button` and `ion-menu-button` actions, choose who controls appearance:

| `buttonProjection` | Appearance |
| --- | --- |
| `'system'` (default) | SwiftUI styles the buttons and tints their icons. Ionic fill, colors and borders are not applied. |
| `'source'` | Projects the supported Ionic fill and computed colors described in [Source fill rules](#source-fill-rules). |

```ts
const rail = await enableVerticalControlArea({ buttonProjection: 'source' });
```

Both `enableVerticalControlArea()` and `enableNativeUIShell()` accept the option. Use one runtime, and destroy it before restarting with different options. Either mode preserves actions, disabled state and grouping. Disabled icons use the native disabled appearance. These appearance settings do not affect horizontal controls, source elements or Web fallback clones, so compare the native appearance on supported iOS.

**Migration from the experimental releases:** the default changes from source styling to `system`. Set `buttonProjection: 'source'` to retain the previous projection behavior.

### Override individual buttons or groups

Use `data-projection` for local exceptions. Existing classes remain supported:

| Attribute | Equivalent class |
| --- | --- |
| `data-projection="source"` | `ios-theme-projection-source` |
| `data-projection="system"` | `ios-theme-projection-system` |

```html
<ion-buttons data-projection="source">
  <ion-button fill="solid" aria-label="Add">
    <ion-icon name="add-outline" slot="icon-only"></ion-icon>
  </ion-button>
  <ion-button data-projection="system" aria-label="Search">
    <ion-icon name="search-outline" slot="icon-only"></ion-icon>
  </ion-button>
</ion-buttons>
```

The first matching setting wins:

1. The button's local setting.
2. Its nearest `ion-buttons` local setting.
3. The startup `buttonProjection` option, or `system` if omitted.

On the same element, a valid `data-projection` value takes precedence over the classes. Empty or unknown values are ignored. Without a valid attribute, `system` wins if both classes are present. Removing an attribute falls back to the element's classes, then the next level above. Attribute and class changes apply without restarting the runtime; grouping and placement stay unchanged.

Only native vertical `ion-button` and `ion-menu-button` actions interpret these settings. Other ancestors, back buttons, tabs and FABs do not. They do not change Web styling. To keep a control or subtree on the Web entirely, use [`data-shell="disabled"`](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/native-ui-shell#supported-markup).

### Source fill rules

For an `ion-button` resolved to `source`, fill is chosen separately from the projection mode:

| Button | Effective fill |
| --- | --- |
| Explicit `fill="clear"`, `"solid"` or `"outline"` | The explicit value |
| Omitted fill or `fill="default"` inside `ion-buttons` | `clear` |
| Omitted fill or `fill="default"` outside `ion-buttons` | `buttonDefaultFill` |

`buttonDefaultFill` accepts only `'solid'` or `null`; omission is equivalent to `null`. Use `'solid'` for Ionic's default button design, or `null` for this theme's default glass design. It applies to every button resolved to `source`, including a local exception under a global `system` setting.

```ts
// Keep system styling globally; local source buttons use Ionic's default fill.
const rail = await enableVerticalControlArea({ buttonDefaultFill: 'solid' });
```

```html
<!-- In a fixed toolbar, outside ion-buttons: omitted fill resolves to solid. -->
<ion-button data-projection="source" aria-label="Add">
  <ion-icon name="add-outline" slot="icon-only"></ion-icon>
</ion-button>
```

| Effective fill | Native appearance in `source` mode |
| --- | --- |
| `clear` | Icon color, without a glass background; CSS backgrounds are ignored |
| `solid` | Computed background color tints a prominent glass button |
| `outline` | Computed border color and width, with native glass |
| `null` | Native glass with source icon colors |

Inside `ion-buttons`, explicitly set `fill="solid"` to project a background; `buttonDefaultFill: 'solid'` does not override the group's clear default. Native Liquid Glass tinting can differ from the CSS color, especially for translucent backgrounds. With the iOS theme, ordinary `ion-buttons` retain group projection; `ion-buttons.ios-theme-disabled` projects eligible buttons individually. Local projection settings do not change that grouping rule.

## Tab bar

When the app contains `ion-tabs`, its tab bar moves into the reserved region and uses the native Duo edge spacing; the Ionic `slot` value does not select a different position. Without native projection, the stable Web rail is icon-only, matching the native resting presentation. While the user presses and drags across that rail, every icon-and-label tab reveals its label so the pending destination stays identifiable. The Web tab bar receives pointer input in the simulated system region. Native tabs and a restored Web tab bar fade in over 180ms; disappearance remains immediate. Reduced motion disables this fade. Use `ion-menu` when navigation should become a sidebar; this mode does not convert tabs into a menu. Web clones also work when no `ion-tabs` exists. Disabling the mode or leaving the page removes the native ownership or Web clones and restores their sources. Override `--ios-theme-vertical-bars-toolbar-top` when the simulated system controls use a different vertical layout.

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
setPlacement(placement: VerticalBarEdge | VerticalBarPlacement, rtl?: boolean | undefined) => void
```

Applies the application's chosen placement to both Web and native controls.

| Param           | Type                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **`placement`** | <code><a href="#verticalbaredge">VerticalBarEdge</a> \| <a href="#verticalbarplacement">VerticalBarPlacement</a></code> |
| **`rtl`**       | <code>boolean</code>                                                                                                    |

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

| Prop             | Type                                                        | Description                                                                                                                                                                                                                       |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`edge`**       | <code><a href="#verticalbaredge">VerticalBarEdge</a></code> |                                                                                                                                                                                                                                   |
| **`inset`**      | <code>number</code>                                         | Explicit rail width in CSS pixels; omitted to use the stylesheet's safe-area rules.                                                                                                                                               |
| **`nativeEdge`** | <code><a href="#verticalbaredge">VerticalBarEdge</a></code> | Native logical edge reported by the application's device plugin. Null or an unregistered edge uses a Web rail in verticalBarsOnly mode, or the ordinary Native UI Shell layout otherwise. Omission keeps the last supplied value. |


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

Logical edge in the reading direction, matching UIVerticalBarEdge and capacitor-foldable.

<code>'leading' | 'trailing' | null</code>

</docgen-api>
