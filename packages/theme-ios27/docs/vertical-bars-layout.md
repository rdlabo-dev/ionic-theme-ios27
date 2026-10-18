# Vertical Bars layout

This optional theme stylesheet owns Web spacing and positioning around a vertical rail. It can be used with your existing theme without loading the full iOS 27 appearance. Native rendering and state synchronization are provided separately by [Capacitor Native UI](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/capacitor-native-ui/docs/vertical-bars.md).

```sh
npm install @rdlabo/ionic-theme-ios27
```

```scss
@use '@rdlabo/ionic-theme-ios27/dist/css/vertical-bars.css';
```

The layout behavior below assumes this stylesheet is loaded. For native runtime setup and device placement, follow the [integration guide](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/integration/docs/iphone-duo-with-original-theme.md).

## Reserve the vertical rail

Add `.ios-theme-vertical-bars` to `ion-app` to reserve the rail region on the physical right, or add `.ios-theme-vertical-bars-left` as well to use the physical left:

```html
<ion-app class="ios-theme-vertical-bars">...</ion-app>
```

The classes are physical — `-left` always means the physical left edge — because CSS and the native renderer work in physical coordinates. `setVerticalBarsLayout` applies the logical `verticalBarEdge` reported by the device plugin and resolves it through the document's direction, so an RTL app does not need its own conversion.

For Chrome development, no native plugin is needed — the class alone reserves `80px` to simulate iPhone Duo. When `setVerticalBarsLayout` receives `{ edge, inset }`, the inset replaces the fallback width, even when it is less than `80px`. Override `--ios-theme-vertical-bars-safe-area-left` or `--ios-theme-vertical-bars-safe-area-right` when simulating a different layout.

This keeps routers and component backgrounds full-viewport. `ion-content` moves its scroll foreground, `ion-toolbar` moves its container foreground, and `ion-fab` adjusts only when placed beside the system UI. The corresponding Ionic safe-area variable is reset inside those foreground components so descendants do not add the inset again.

`ion-modal` applies the same foreground correction when its visible dialog spans the viewport width. With the Vertical Control Area runtime enabled, the topmost full-width modal also projects eligible toolbar buttons into its own rail; centered dialogs keep their toolbar buttons and receive no page-rail inset. This includes full-width sheet modals: their rail follows the visible sheet bounds as the breakpoint changes. Eligibility follows the visible dialog width, not the hinge posture or modal type. `ion-menu` and `ion-popover` are handled as separate surfaces: their internal foreground components do not receive the main-page conversion and retain Ionic's standard safe-area handling. A menu presented beside the system UI keeps Ionic's full-viewport animation host and offsets only its visible container by the corresponding inset; a menu from the opposite side is unchanged. Left and right remain physical coordinates in RTL, while Ionic's `side="start"` and `side="end"` values remain logical.

The mode is component-mode independent: an app can keep Ionic `mode: 'md'` on iOS and still enable Vertical Bars. No component needs `mode="ios"`.


## Layout API

```ts
import { setVerticalBarsLayout } from '@rdlabo/ionic-theme-ios27';

setVerticalBarsLayout({ edge: 'trailing', inset: 80 });
// Optionally supply a root element and explicit RTL boolean as the next arguments.
setVerticalBarsLayout({ edge: null }); // restore ordinary Web layout
```

The helper operates on Web CSS only and work without Capacitor or Native UI startup. The application supplies device state and owns subscriptions. Starting, disabling or destroying Native UI does not change these layout classes or the reserved inset. Unsupported native rails retain the chosen Web rail; choose `edge: null` explicitly if the application wants a horizontal layout instead.

## Migration

Move `setVerticalControlAreaPlacement` calls from the plugin to `setVerticalBarsLayout({ edge, inset })` from the theme. Move `applyFoldStateClasses` imports to the theme too. Remove `nativeEdge`: it no longer reports availability. The old plugin helpers are deprecated; update existing imports using the [migration guide](../../capacitor-native-ui/docs/migration.md#web-layout-ownership).
