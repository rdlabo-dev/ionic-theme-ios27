---
title: Vertical Bars
---

# Vertical Bars

Vertical Bars moves eligible Ionic controls or explicitly marked HTML buttons into a side rail while keeping the original elements as the source of labels, icons and behavior. It works with the iOS theme or an existing Ionic theme, independently of hinge posture and the full Native UI.

Choose your setup before using this reference:

- **Ionic with a custom or default theme:** [Ionic rail setup](ionic-vertical-bars.md#try-it-in-your-existing-ionic-app).
- **No Ionic:** [HTML setup](framework-independent.md) and its [device rail setup](framework-independent.md#device-placement-for-vertical-bars). Use `/core` and your own layout; the Ionic setup below does not apply.
- **Existing iOS 27 theme and Native UI:** [Connect device placement](../../capacitor-native-ui/docs/vertical-bars.md#use-with-capacitor-foldable) using your existing runtime.

This page covers device-plugin integration, control eligibility, native appearance and runtime options. For posture-driven Ionic split panes, see [Device layout and split panes](../../theme-ios27/docs/vertical-bars-layout.md).

Vertical Bars and iPhone Duo support are stable starting with version 2.0.0.

See [shared configuration](configuration.md) for all defaults and live `rail.enableVerticalControlArea()` / `rail.disableVerticalControlArea()` methods. [Plain HTML controls](framework-independent.md) use the same native rail renderers.

## Enable Vertical Bars

Install Native UI and the required Foldable device-state plugin as direct application dependencies:

```sh
npm install @rdlabo/capacitor-native-ui @erkamyaman/capacitor-foldable
```

For Ionic, follow the [standard setup](ionic-vertical-bars.md): load your rail CSS, configure navigation, then connect Foldable's initial placement and `barPlacementChange` events before starting one runtime. The [integration below](#use-with-capacitor-foldable) also covers existing runtimes and application-owned CSS. Build your Web assets, run `npx cap sync ios`, and rebuild the native app.

A runtime alone does not reserve Web space. Keep the device subscription for the standard setup; manual placement belongs to the [optional browser preview](ionic-vertical-bars.md#optional-browser-preview). If Native UI is already active, reuse it rather than starting another runtime.

The `/vertical-bars` entry point requires `@capacitor/core`, including in browser builds. Using only the theme’s rail CSS needs no native runtime. For native setup and navigation transitions, follow the [existing-theme guide](ionic-vertical-bars.md).

On supported Capacitor iOS, eligible controls use native SwiftUI rendering. Web, Android and unavailable native projection use Web clones. A browser preview can verify layout and actions, but cannot compare native button appearance.

## Placement and Web layout

The application or theme owns Web spacing, rail positioning, and fallback styles. The plugin reads the supplied Ionic layout and placement; it does not reserve Web content space on its own. With the iOS27 theme, use its `setVerticalBarsLayout({ edge, inset })` helper. Native-only applications use their own CSS; no theme helper is required. Native availability comes from device metrics, independently of Web layout.

The [theme's optional rail stylesheet](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/vertical-bars-layout.md) supplies one ready-made layout. Its classes and CSS variables are not a requirement to install the theme package: applications may provide equivalent layout themselves. The runtime currently uses the `ios-theme-vertical-bars` class on `ion-app` to identify the rail layout, regardless of who supplies its styles.

## Use with Capacitor Foldable

[`@erkamyaman/capacitor-foldable`](https://github.com/erkamyaman/capacitor-foldable) is required in the standard Vertical Bars setup. Install it with Native UI as shown above, and connect its device placement to your Web layout. Native UI does not subscribe to Foldable automatically.

| Owner                | Responsibility                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Foldable             | Report initial device state and subsequent placement/posture changes.                       |
| Application or theme | Reserve Web space and choose the layout using the reported logical edge and measured inset. |
| Native UI            | Check native rail availability independently and project eligible source controls.          |

### With the theme's Ionic rail layout

After loading [the rail stylesheet](../../theme-ios27/docs/vertical-bars-layout.md) and mounting `ion-app`, connect device placement and start the runtime once:

```ts
import { Foldable, type BarPlacement } from '@erkamyaman/capacitor-foldable';
import { setVerticalBarsLayout } from '@rdlabo/ionic-theme-ios27';
import { enableNativeUI } from '@rdlabo/capacitor-native-ui';

const applyPlacement = ({ verticalBarEdge, inset }: BarPlacement) => setVerticalBarsLayout({ edge: verticalBarEdge, inset });
const listener = await Foldable.addListener('barPlacementChange', applyPlacement);
applyPlacement(await Foldable.getBarPlacement());
const rail = await enableNativeUI({ controls: 'verticalOnly' });
```

If a runtime is already active, keep it and add only the placement subscription. `setVerticalBarsLayout` resolves logical edges for RTL; a null edge restores the ordinary Web layout. Use the measured inset instead of a fixed width. Keep the theme's rail stylesheet; Foldable's `ionic-tabs.css` is not needed for this integration.

When the application owner is disposed, remove its subscription and destroy the runtime it owns:

```ts
await listener.remove();
await rail.destroy();
```

### With application-owned CSS or without Ionic

Use the same `getBarPlacement()` / `barPlacementChange` subscription, but apply the edge and inset to your own CSS instead of calling `setVerticalBarsLayout`. A null edge means your layout should restore its ordinary spacing. For Ionic, retain the rail layout classes described above; for plain HTML, use the `/core` entry and [device rail setup](framework-independent.md#device-placement-for-vertical-bars). Neither Foldable nor Native UI supplies the application's CSS. Explicit HTML rail markers remain active independently of CSS; to return those sources to their original placement on a null edge, call `disableVerticalControlArea()`, then `enableVerticalControlArea()` when a rail edge returns. Serialize these changes with your layout updates.

Keep Web layout updates separate from native availability: do not pass Foldable's edge through the deprecated `nativeEdge` option. Native UI reads that capability itself. Only an optional browser layout preview substitutes simulated placement for this subscription.

For hinge-driven content layout, read `getFoldState()` and subscribe to `foldStateChange` separately. Hinge posture does not select controls or enable the rail; see the theme's [posture subscription and split-pane example](../../theme-ios27/docs/vertical-bars-layout.md#read-the-device-layout).

## Native rendering

On supported iOS versions, adding `.ios-theme-vertical-bars` changes only controls that the system relocates into the physical side rail. Native UI presents eligible tabs, back navigation, menu buttons, and toolbar actions through a SwiftUI `TabView` and toolbar once the class is applied. When the OS reports a rail edge — on iPhone Duo linked against iOS 27.1 or later — it must agree with the applied placement; a disagreeing report keeps the rail on the Web. Without a device-reported edge, projection retains its Web fallback. A placement preference cannot enable an unsupported native rail. SwiftUI owns their adaptive placement and Liquid Glass appearance; Ionic remains the source of labels, icons, selected/disabled state, routing, form submission, and click handlers.

The SwiftUI surface is clipped and hit-tested to the system rail. Web content remains visible and interactive outside that physical region. The runtime optimistically updates tab selection before forwarding the action to the original `ion-tab-button`, using the same event and stale-revision protection as the other native controls. Overlay layout follows the [optional theme rail layout](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/vertical-bars-layout.md#reserve-the-vertical-rail) when that stylesheet is used; custom layouts remain the application’s responsibility.

### Native popovers (Vertical Bars only)

Native popover presentation is limited to popovers anchored to accepted native Vertical Bars `ion-button` controls. It is available with the standalone Vertical Bars runtime; the full Native UI is not required. Enable it explicitly when starting the runtime (`popover` defaults to `false`):

```ts
import { enableNativeUI } from '@rdlabo/capacitor-native-ui';

const rail = await enableNativeUI({
  controls: 'verticalOnly',
  ionic: { verticalBars: { popover: true } },
});
```

Use an `ion-popover` whose `trigger` identifies the projected button, or pass that button's click event to `PopoverController.create({ event, ... })`. Ordinary toolbar and body popovers remain on the Web. If a rail-anchored popover falls back to Web rendering, the rail also returns to Web projection until dismissal. See [native popover behavior and limitations](native-ui.md#popovers-anchored-to-vertical-bars).

## Toolbar actions

A standard `ion-back-button` can project from outside a fixed toolbar, including routed content or a persistent app shell. `ion-menu-button` and other toolbar actions require a fixed toolbar.

By default, an `ion-button` moves into the rail when it contains an `ion-icon` or SVG with `slot="icon-only"`. The button must be in a fixed `ion-toolbar` directly inside `ion-header` or `ion-footer`, outside scrolling `ion-content`.

| Icon markup                              | Placement                   |
| ---------------------------------------- | --------------------------- |
| `slot="icon-only"`                       | Vertical rail               |
| `slot="start"`, `slot="end"`, or no slot | Original horizontal toolbar |
| No icon                                  | Original horizontal toolbar |

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

### Select actions and grouping independently

Use `controls` to configure toolbar selection and grouping. Each field accepts `true`, `false`, `'horizontalOnly'`, or `'verticalOnly'`, with omitted fields defaulting to `true`. Use `controls: 'verticalOnly'` for all default selection in the rail. Local attributes can override selection; explicit sources and extensions remain independent. See [all selection defaults](configuration.md#selection-defaults).

| Option        | Responsibility                                                                                                     | What it does not do                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `button`      | Automatically select eligible `ion-button` and `ion-menu-button` actions, whether inside or outside `ion-buttons`. | Does not select back buttons.                        |
| `buttonGroup` | Allow selected actions in `ion-buttons` to project as a group when the existing grouping rules allow it.           | Does not select, enable or disable any child action. |
| `backButton`  | Automatically select eligible `ion-back-button` elements, independently of their parent group.                     | Does not group back buttons with other actions.      |

For ordinary icon-only buttons in a group, with no local attributes:

| `buttonGroup` | `button` | Result                                                       |
| ------------- | -------- | ------------------------------------------------------------ |
| `true`        | `true`   | Eligible buttons project together when the group qualifies.  |
| `false`       | `true`   | Eligible buttons project individually.                       |
| `true`        | `false`  | No ordinary buttons project; grouping alone selects nothing. |
| `false`       | `false`  | No ordinary buttons project.                                 |

These results concern ordinary actions only. Back navigation, tabs and native
search are independent. For example, to select only back navigation among toolbar
actions:

```ts
const rail = await enableNativeUI({
  controls: { buttonGroup: false, button: false, backButton: 'verticalOnly', tabs: 'verticalOnly', segment: false, fab: false },
});
```

This does not disable tab projection or tab rail CSS.

### Explicit action selection and local grouping

Use `data-vertical-bars="true|false"` on the element whose behavior you want to
override. The attribute is **not inherited**.

| Element                          | `data-vertical-bars="true"`                                                    | `data-vertical-bars="false"`                                    | Default when absent or invalid                     |
| -------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------- |
| `ion-button` / `ion-menu-button` | Select the action, including supported text actions without an icon-only slot. | Exclude the action from the rail.                               | `controls.button` and automatic shape rules.       |
| `ion-buttons`                    | Allow grouping of already-selected actions.                                    | Project selected actions individually.                          | `controls.buttonGroup` and grouping eligibility.   |
| `ion-back-button`                | Select back navigation independently of its group.                             | Exclude this back button from the rail.                         | `controls.backButton` and back-button eligibility. |
| `ion-tab-bar`                    | Select eligible rail tabs and their native search presentation.                | Disable native rail tab selection; existing Web layout remains. | `controls.tabs` and tab-bar eligibility.           |

The group's attribute never selects or excludes its children. All opt-ins remain subject to structural exclusions and rail availability.

Empty or unknown attribute values are ignored. To disable automatic action
selection and explicitly select a text button:

```ts
const rail = await enableNativeUI({
  controls: { buttonGroup: 'verticalOnly', button: false, backButton: false, tabs: 'verticalOnly', segment: false, fab: false },
});
```

```html
<ion-buttons>
  <ion-button data-vertical-bars="true">Save</ion-button>
  <ion-button>Cancel</ion-button>
</ion-buttons>
```

Only Save moves; Cancel stays in the horizontal toolbar. Adding
`data-vertical-bars="true"` to the group would not select Cancel.

To group two explicitly selected actions even when `buttonGroup: false`:

```html
<ion-buttons data-vertical-bars="true">
  <ion-button data-vertical-bars="true">Save</ion-button>
  <ion-button data-vertical-bars="true">Done</ion-button>
</ion-buttons>
```

Set the group's attribute to `false` to project the same actions individually.
Grouping keeps the existing eligibility rules: the entire group must qualify,
and a single ordinary button projects on its own. A group with horizontal
content projects its selected actions individually. The source group and its
unselected children remain in their original toolbar.

Explicit action selection still requires a fixed header/footer toolbar.
Shell opt-outs, horizontal-only classes and overlay restrictions still apply.
Placement and grouping are captured for the routed-page visit: attribute changes
take effect after leaving and re-entering the page. Restart the runtime to change
startup options.

### Back buttons inside groups

An `ion-back-button` remains a navigation action even inside `ion-buttons`.
It ignores `buttonGroup`, `button`, and the group's `data-vertical-bars` attribute.
Its own attribute overrides `backButton`. It uses the dedicated back position,
never an ordinary action group, and is not duplicated as a toolbar action.

```html
<ion-buttons data-vertical-bars="false">
  <!-- Still projects when backButton is true. -->
  <ion-back-button></ion-back-button>
</ion-buttons>
```

The Ionic DOM container does not redefine the navigation role. The theme forwards
the projected back action to Ionic; it does not replace Ionic routing with a
native navigation stack. Native layout remains system-managed.

Existing back-button eligibility still applies, including the supported default
icon/color and page-position rules. Ancestor `data-native-ui="disabled"`,
`.ios-theme-horizontal-only` on `ion-buttons`, and other structural exclusions
remain opt-outs; those are distinct from the grouping setting.

### Placement versus appearance

| Setting                    | Values                              | Responsibility                                              | Applies to                                                                                                         |
| -------------------------- | ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `data-native-ui`           | `button`, `back-button`, `disabled` | Declare an explicit source or exclude a subtree.            | [Explicit source elements](framework-independent.md#2-mark-source-controls); `disabled` also applies to ancestors. |
| `data-native-ui-placement` | `element`, `rail`                   | Choose the original element position or request the rail.   | Explicit sources; `element` also keeps automatic Ionic controls at their original position.                        |
| `data-vertical-bars`       | `true`, `false`                     | Override rail selection or grouping defaults.               | Ionic actions and groups listed above.                                                                             |
| `data-horizontal-bars`     | `true`, `false`                     | Override ordinary-placement selection or grouping defaults. | [Ordinary Ionic controls](native-ui.md#toolbar-selection-and-grouping).                                            |
| `data-projection`          | `system`, `source`                  | Choose native appearance without selecting an action.       | Native vertical `ion-button` and `ion-menu-button`; inherited from the nearest `ion-buttons`.                      |

Selection attributes are not inherited. Appearance follows the button-then-group priority described below. An attribute never makes unsupported markup or a missing native rail available.

The rail shares one light/dark appearance across projected controls. See [Shared Vertical Bars appearance](appearance.md#shared-vertical-bars-appearance) when configuring your Web theme.

### Choose button appearance

Use `ionic.verticalBars.buttonProjection` to choose native button appearance.

For native vertical `ion-button` and `ion-menu-button` actions, choose who controls appearance:

| `buttonProjection`   | Appearance                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `'system'` (default) | SwiftUI styles the buttons and tints their icons. Ionic fill, colors and borders are not applied.           |
| `'source'`           | Projects the supported Ionic fill and computed colors described in [Source fill rules](#source-fill-rules). |

```ts
const rail = await enableNativeUI({ controls: 'verticalOnly', ionic: { verticalBars: { buttonProjection: 'source' } } });
```

`enableNativeUI()` and the standalone `enableVerticalControlArea()` accept these settings inside `ionic.verticalBars`. Use one runtime, and destroy it before restarting with different options. Either mode preserves actions, disabled state and grouping. Disabled icons use the native disabled appearance. These appearance settings do not affect horizontal controls, source elements or Web fallback clones, so compare the native appearance on supported iOS.

### Override individual buttons or groups

Use `data-projection` for local exceptions. Existing classes remain supported:

| Attribute                  | Equivalent class              |
| -------------------------- | ----------------------------- |
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

Only native vertical `ion-button` and `ion-menu-button` actions interpret these settings. Other ancestors, back buttons, tabs and FABs do not. They do not change Web styling. To keep a control or subtree on the Web entirely, use [`data-native-ui="disabled"`](native-ui.md#supported-markup).

### Source fill rules

For an `ion-button` resolved to `source`, fill is chosen separately from the projection mode:

| Button                                                 | Effective fill      |
| ------------------------------------------------------ | ------------------- |
| Explicit `fill="clear"`, `"solid"` or `"outline"`      | The explicit value  |
| Omitted fill or `fill="default"` inside `ion-buttons`  | `clear`             |
| Omitted fill or `fill="default"` outside `ion-buttons` | `buttonDefaultFill` |

`verticalBars.buttonDefaultFill` accepts `'solid'` or `'glass'`; omission is equivalent to `'glass'`. Use `'solid'` for Ionic's default button design, or `'glass'` for a glass design. It applies to every button resolved to `source`, including a local exception under a global `system` setting.

```ts
// Keep system styling globally; local source buttons use Ionic's default fill.
const rail = await enableNativeUI({ controls: 'verticalOnly', ionic: { verticalBars: { buttonDefaultFill: 'solid' } } });
```

```html
<!-- In a fixed toolbar, outside ion-buttons: omitted fill resolves to solid. -->
<ion-button data-projection="source" aria-label="Add">
  <ion-icon name="add-outline" slot="icon-only"></ion-icon>
</ion-button>
```

| Effective fill | Native appearance in `source` mode                                  |
| -------------- | ------------------------------------------------------------------- |
| `clear`        | Icon color, without a glass background; CSS backgrounds are ignored |
| `solid`        | Computed background color tints a prominent glass button            |
| `outline`      | Computed border color and width, with native glass                  |
| `null`         | Native glass with source icon colors                                |

Inside `ion-buttons`, explicitly set `fill="solid"` to project a background; `buttonDefaultFill: 'solid'` does not override the group's clear default. Native Liquid Glass tinting can differ from the CSS color, especially for translucent backgrounds. With the iOS theme, ordinary `ion-buttons` retain group projection; `ion-buttons.ios-theme-disabled` projects eligible buttons individually. Local projection settings do not change that grouping rule.

## Tab bar

When the app contains `ion-tabs`, its tab bar moves into the reserved region and uses the native Duo edge spacing; the Ionic `slot` value does not select a different position. Without native projection, the stable Web rail is icon-only, matching the native resting presentation. While the user presses and drags across that rail, every icon-and-label tab reveals its label so the pending destination stays identifiable. The Web tab bar receives pointer input in the simulated system region. Native tabs and a restored Web tab bar fade in over 180ms; disappearance remains immediate. Reduced motion disables this fade. Use `ion-menu` when navigation should become a sidebar; this mode does not convert tabs into a menu. Web clones also work when no `ion-tabs` exists. Disabling the mode or leaving the page removes the native ownership or Web clones and restores their sources. Override `--ios-theme-vertical-bars-toolbar-top` when the simulated system controls use a different vertical layout.

## Vertical Control Area API

The generated reference below documents the handle returned by `enableVerticalControlArea()`.

<docgen-index>

- [`setPlacement(...)`](#setplacement)
- [`enableVerticalControlArea()`](#enableverticalcontrolarea)
- [`disableVerticalControlArea()`](#disableverticalcontrolarea)
- [Interfaces](#interfaces)
- [Type Aliases](#type-aliases)

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

---

### enableVerticalControlArea()

```typescript
enableVerticalControlArea() => Promise<void>
```

Enable rail projection when available, preserving other settings. Rejects after destroy.

---

### disableVerticalControlArea()

```typescript
disableVerticalControlArea() => Promise<void>
```

Restore rail sources to the Web without stopping ordinary native controls. Rejects after destroy.

---

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
