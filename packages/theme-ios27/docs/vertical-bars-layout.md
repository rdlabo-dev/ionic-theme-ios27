# Vertical Bars layout

This optional theme stylesheet owns Web spacing and positioning around a vertical rail. It can be used with your existing theme without loading the full iOS 27 appearance. Native rendering and state synchronization are provided separately by [Capacitor Native UI](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/capacitor-native-ui/docs/vertical-bars.md).

```sh
npm install @rdlabo/ionic-theme-ios27 @erkamyaman/capacitor-foldable
```

```scss
@use '@rdlabo/ionic-theme-ios27/dist/css/vertical-bars.css';
```

The layout behavior below assumes this stylesheet is loaded. For native runtime setup and device placement, follow the [integration guide](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/capacitor-native-ui/docs/ionic-vertical-bars.md).

## Reserve the vertical rail

For device setup, use the installed Foldable plugin and apply its initial placement and events through `setVerticalBarsLayout`; follow the [standard Ionic rail setup](../../capacitor-native-ui/docs/ionic-vertical-bars.md). The classes below describe the stylesheet's layout inputs and optional browser simulation, not a manual device setup step.

Add `.ios-theme-vertical-bars` to `ion-app` to reserve the rail region on the physical right, or add `.ios-theme-vertical-bars-left` as well to use the physical left:

```html
<ion-app class="ios-theme-vertical-bars">...</ion-app>
```

The classes are physical — `-left` always means the physical left edge — because CSS and the native renderer work in physical coordinates. `setVerticalBarsLayout` applies the logical `verticalBarEdge` reported by the device plugin and resolves it through the document's direction, so an RTL app does not need its own conversion.

### Rail width

| Source                                   | Reserved width                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Classes alone, including Chrome previews | `80px`; no native plugin required.                                                                  |
| `setVerticalBarsLayout({ edge, inset })` | The supplied inset, even below `80px`.                                                              |
| Custom CSS preview                       | Override `--ios-theme-vertical-bars-safe-area-left` or `--ios-theme-vertical-bars-safe-area-right`. |

### Content and overlay layout

| Surface                                  | Layout with the rail stylesheet                                                                                                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routers and component backgrounds        | Remain full-viewport.                                                                                                                                                                        |
| `ion-content`                            | Insets its scroll foreground.                                                                                                                                                                |
| `ion-toolbar`                            | Insets its container foreground.                                                                                                                                                             |
| `ion-fab`                                | Adjusts only when placed beside the system UI.                                                                                                                                               |
| Full-width `ion-modal`, including sheets | Applies the foreground inset. With the runtime enabled, the topmost modal projects eligible toolbar controls into its own rail; sheet rails follow visible bounds as the breakpoint changes. |
| Centered modal                           | Keeps toolbar buttons and receives no page-rail inset.                                                                                                                                       |
| `ion-menu` / `ion-popover`               | Internal foreground components retain Ionic's standard safe-area handling, without the main-page conversion.                                                                                 |
| Menu beside the system UI                | Keeps its full-viewport animation host; offsets only the visible container by the inset.                                                                                                     |
| Menu on the opposite side                | Unchanged.                                                                                                                                                                                   |

The corresponding Ionic safe-area variable is reset inside inset foreground components so descendants do not add the inset again.

Modal eligibility follows the visible dialog width, not hinge posture or modal type. Left and right remain physical coordinates in RTL; Ionic's `side="start"` and `side="end"` remain logical.

The mode is component-mode independent: an app can keep Ionic `mode: 'md'` on iOS and still enable Vertical Bars. No component needs `mode="ios"`.

## Layout API

```ts
import { setVerticalBarsLayout } from '@rdlabo/ionic-theme-ios27';

setVerticalBarsLayout({ edge: 'trailing', inset: 80 });
// Optionally supply a root element and explicit RTL boolean as the next arguments.
setVerticalBarsLayout({ edge: null }); // restore ordinary Web layout
```

The helper operates on Web CSS only and works without Capacitor or Native UI startup. The application supplies device state and owns subscriptions. Starting, disabling or destroying Native UI does not change these layout classes or the reserved inset. Unsupported native rails retain the chosen Web rail; choose `edge: null` explicitly if the application wants a horizontal layout instead.

## Read the device layout

The standard theme and Native UI setup commands install Foldable as a separate application dependency. After building your Web assets, sync the native project:

```bash
npx cap sync
```

Use Capacitor 8.5 or later and build with Xcode 27.1 or newer for iPhone Duo's iOS 27.1 APIs. Foldable supplies placement and posture in the standard setup. Browser simulation can temporarily replace its subscription with fixed layout values. Do not import the plugin's `ionic-tabs.css` alongside this package's rail projection; both would reposition the same tabs.

After `ion-app` is mounted, pass device state to `applyFoldStateClasses`. The application owns subscriptions and cleanup. No projection runtime is needed for posture-driven layout.

```ts
import { Foldable } from '@erkamyaman/capacitor-foldable';
import { applyFoldStateClasses } from '@rdlabo/ionic-theme-ios27';

const root = document.querySelector('ion-app')!;
const listener = await Foldable.addListener('foldStateChange', (fold) => applyFoldStateClasses(root, fold));
applyFoldStateClasses(root, await Foldable.getFoldState());
```

When the application owner is disposed:

```ts
await listener.remove();
```

Subscribe to changes, then read the current state. The same helper handles initial values and events.

### Posture classes

`applyFoldStateClasses` updates the supplied root while preserving unrelated classes:

| Class                        | Applied when                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ios-theme-fold-flat`        | Flat posture.                                                                                                            |
| `ios-theme-fold-half-opened` | Half-opened posture.                                                                                                     |
| `ios-theme-fold-closed`      | Closed posture.                                                                                                          |
| `ios-theme-fold-expanded`    | Half-opened, or flat with hinge geometry. Cleared for flat without geometry (including Web fallback) and closed posture. |

Only one of the first three classes is retained. The helper does not subscribe to the plugin or change Ionic's split-pane `when` property.

## Adapt the split pane

For a side-by-side menu on iPhone Duo, opt the `ion-split-pane` into the theme's posture-based layout. This stylesheet defaults to `320px` when fully unfolded and `50vw` when half-opened. These are theme defaults, not a guarantee of the widths chosen by the system Settings app. The application supplies the posture; both states can have the same viewport width, so a width media query cannot distinguish them:

```html
<ion-split-pane class="split-pane-fold-layout" contentId="main-content" when="(min-width: 900px)">
  <ion-menu contentId="main-content">...</ion-menu>
  <div id="main-content">...</div>
</ion-split-pane>
```

Connect the split-pane width to the theme variable in the application's stylesheet, and let the half-open class change only the width value:

```css
ion-split-pane.split-pane-fold-layout {
  --ios-theme-menu-width: var(--ios-theme-split-pane-width);
  --side-width: var(--ios-theme-menu-width);
  --side-max-width: var(--ios-theme-menu-width);
  transition: --ios-theme-split-pane-width 300ms ease;
}
```

The registered `--ios-theme-split-pane-width` defaults to `320px`. `applyFoldStateClasses` sets `ios-theme-fold-half-opened` on `ion-app`; the stylesheet then sets only descendant split panes with `split-pane-fold-layout` to `50vw`. Add this opt-in class once; no state-dependent class binding is needed. Other split panes retain their existing width.

`ios-theme-fold-expanded` describes use of the inner display; it does not select the sidebar width. A fully unfolded display keeps the ordinary width. Only `ios-theme-fold-half-opened` selects `50vw` for opted-in split panes.

Ionic's `when` still controls whether the menu is persistent. The example chooses a fixed 900px breakpoint. If your app needs different breakpoints for folded and ordinary displays, use the `ios-theme-fold-expanded` class applied by the helper to select that policy in your application's layout code. The helper only updates state classes, not `when`. This layout does not enable Vertical Bars or move an overlay menu.

## Migration

Move `setVerticalControlAreaPlacement` calls from the plugin to `setVerticalBarsLayout({ edge, inset })` from the theme. Move `applyFoldStateClasses` imports to the theme too. Remove `nativeEdge`: it no longer reports availability. The old plugin helpers are deprecated; update existing imports using the [migration guide](../../capacitor-native-ui/docs/migration.md#web-layout-ownership).
