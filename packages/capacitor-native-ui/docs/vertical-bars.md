---
title: Vertical Bars (preview)
---

# Vertical Bars (preview)

Vertical Bars moves eligible Ionic navigation and actions into a side rail while keeping the original components as the source of labels, icons and behavior. It works with the iOS theme or an existing Ionic theme, independently of hinge posture and the full Native UI Shell.

Use this page for layout, control eligibility, native button appearance and the runtime API. For device events and split panes, see [iPhone Duo support](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo.md). For a step-by-step browser preview and native setup, start with [iPhone Duo with your existing theme](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo-with-original-theme.md).

Available in `1.2.0` as a **preview** feature. APIs and supported behavior may change.

See [shared configuration](configuration.md) for all defaults and live `rail.enableVerticalControlArea()` / `rail.disableVerticalControlArea()` methods. [Plain HTML controls](framework-independent.md) use the same native rail renderers.

## Enable Vertical Bars

Install the native package as a direct dependency:

```sh
npm install @rdlabo/capacitor-native-ui
```

For Capacitor iOS, build your Web assets and run `npx cap sync ios`. Supply the Web layout through your app or theme as described below.

After `ion-app` is mounted, start one runtime:

```ts
import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui';

const rail = await enableNativeUIShell({ verticalBars: { only: true } });
```

Configure your Web rail layout and [apply device placement](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo.md#project-controls-into-the-rail) for an iPhone Duo. The application owns placement and cleanup: call `await rail.destroy()` when its owner is disposed. If you already use `enableNativeUIShell()`, keep that runtime; it includes Vertical Bars. Do not start both.

The `/vertical-bars` entry point requires `@capacitor/core`, including in browser builds. Using only the theme’s rail CSS needs no native runtime. For native setup and navigation transitions, follow the [existing-theme guide](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo-with-original-theme.md).

On supported Capacitor iOS, eligible controls use native SwiftUI rendering. Web, Android and unavailable native projection use Web clones. A browser preview can verify layout and actions, but cannot compare native button appearance.

## Placement and Web layout

The application or theme owns Web spacing, rail positioning, and fallback styles. The plugin reads the supplied Ionic layout and placement; it does not reserve Web content space on its own. With the iOS27 theme, use its `setVerticalBarsLayout({ edge, inset })` helper. Native-only applications use their own CSS; no theme helper is required. Native availability comes from device metrics, independently of Web layout.

The [theme's optional rail stylesheet](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/vertical-bars-layout.md) supplies one ready-made layout. Its classes and CSS variables are not a requirement to install the theme package: applications may provide equivalent layout themselves. The runtime currently uses the `ios-theme-vertical-bars` class on `ion-app` to identify the rail layout, regardless of who supplies its styles.

## Native rendering

On supported iOS versions, adding `.ios-theme-vertical-bars` changes only controls that the system relocates into the physical side rail. Native UI Shell presents eligible tabs, back navigation, menu buttons, and toolbar actions through a SwiftUI `TabView` and toolbar once the class is applied. When the OS reports a rail edge — on iPhone Duo linked against iOS 27.1 or later — it must agree with the applied placement; a disagreeing report keeps the rail on the Web. Without a device-reported edge, projection retains its Web fallback. A placement preference cannot enable an unsupported native rail. SwiftUI owns their adaptive placement and Liquid Glass appearance; Ionic remains the source of labels, icons, selected/disabled state, routing, form submission, and click handlers.

The SwiftUI surface is clipped and hit-tested to the system rail. Web content remains visible and interactive outside that physical region. The runtime optimistically updates tab selection before forwarding the action to the original `ion-tab-button`, using the same event and stale-revision protection as the other native controls. Overlay layout follows the [optional theme rail layout](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/vertical-bars-layout.md#reserve-the-vertical-rail) when that stylesheet is used; custom layouts remain the application’s responsibility.


### Native popovers (Vertical Bars only)

Native popover presentation is limited to popovers anchored to accepted native Vertical Bars `ion-button` controls. It is available with the standalone Vertical Bars runtime; the full Native UI Shell is not required. Enable it explicitly when starting the runtime (`popover` defaults to `false`):

```ts
import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui';

const rail = await enableNativeUIShell({
  verticalBars: { only: true, popover: true },
});
```

Use an `ion-popover` whose `trigger` identifies the projected button, or pass that button's click event to `PopoverController.create({ event, ... })`. Ordinary toolbar and body popovers remain on the Web. If a rail-anchored popover falls back to Web rendering, the rail also returns to Web projection until dismissal. See [native popover behavior and limitations](native-ui-shell.md#popovers-anchored-to-vertical-bars).


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

A toolbar whose content has all moved into the rail collapses while projection is active. Toolbars containing a title, direct text, other content or a horizontal-only control remain visible. Removing projection restores the original toolbar.

### Choose button appearance

`buttonProjection` and the local projection settings below are available in `1.2.0`.

For native vertical `ion-button` and `ion-menu-button` actions, choose who controls appearance:

| `buttonProjection` | Appearance |
| --- | --- |
| `'system'` (default) | SwiftUI styles the buttons and tints their icons. Ionic fill, colors and borders are not applied. |
| `'source'` | Projects the supported Ionic fill and computed colors described in [Source fill rules](#source-fill-rules). |

```ts
const rail = await enableNativeUIShell({ verticalBars: { only: true, buttonProjection: 'source' } });
```

`enableNativeUIShell()` accepts these settings inside `verticalBars`; the legacy global `enableVerticalControlArea()` still accepts its original top-level settings. Use one runtime, and destroy it before restarting with different options. Either mode preserves actions, disabled state and grouping. Disabled icons use the native disabled appearance. These appearance settings do not affect horizontal controls, source elements or Web fallback clones, so compare the native appearance on supported iOS.

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

Only native vertical `ion-button` and `ion-menu-button` actions interpret these settings. Other ancestors, back buttons, tabs and FABs do not. They do not change Web styling. To keep a control or subtree on the Web entirely, use [`data-shell="disabled"`](native-ui-shell.md#supported-markup).

### Source fill rules

For an `ion-button` resolved to `source`, fill is chosen separately from the projection mode:

| Button | Effective fill |
| --- | --- |
| Explicit `fill="clear"`, `"solid"` or `"outline"` | The explicit value |
| Omitted fill or `fill="default"` inside `ion-buttons` | `clear` |
| Omitted fill or `fill="default"` outside `ion-buttons` | `buttonDefaultFill` |

`verticalBars.buttonDefaultFill` accepts `'solid'` or `'glass'`; omission is equivalent to `'glass'`. Use `'solid'` for Ionic's default button design, or `'glass'` for a glass design. It applies to every button resolved to `source`, including a local exception under a global `system` setting.

```ts
// Keep system styling globally; local source buttons use Ionic's default fill.
const rail = await enableNativeUIShell({ verticalBars: { only: true, buttonDefaultFill: 'solid' } });
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
* [`enableVerticalControlArea()`](#enableverticalcontrolarea)
* [`disableVerticalControlArea()`](#disableverticalcontrolarea)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### setPlacement(...)

```typescript
setPlacement(placement: VerticalBarEdge | VerticalBarPlacement, rtl?: boolean | undefined) => void
```

Legacy Web CSS adapter. Use the theme setVerticalBarsLayout helper instead.

| Param           | Type                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **`placement`** | <code><a href="#verticalbaredge">VerticalBarEdge</a> \| <a href="#verticalbarplacement">VerticalBarPlacement</a></code> |
| **`rtl`**       | <code>boolean</code>                                                                                                    |

--------------------


### enableVerticalControlArea()

```typescript
enableVerticalControlArea() => Promise<void>
```

Enable rail projection when available, preserving other settings. Rejects after destroy.

--------------------


### disableVerticalControlArea()

```typescript
disableVerticalControlArea() => Promise<void>
```

Restore rail sources to the Web without stopping ordinary native controls. Rejects after destroy.

--------------------


### Interfaces


#### VerticalBarPlacement

| Prop             | Type                                                        | Description                                                                         |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **`edge`**       | <code><a href="#verticalbaredge">VerticalBarEdge</a></code> |                                                                                     |
| **`inset`**      | <code>number</code>                                         | Explicit rail width in CSS pixels; omitted to use the stylesheet's safe-area rules. |
| **`nativeEdge`** | <code><a href="#verticalbaredge">VerticalBarEdge</a></code> | Ignored. Native availability is read from the plugin’s own device metrics.          |


### Type Aliases


#### VerticalBarEdge

Logical edge in the reading direction, matching UIVerticalBarEdge and capacitor-foldable.

<code>'leading' | 'trailing' | null</code>

</docgen-api>
