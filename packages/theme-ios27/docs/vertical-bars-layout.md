# Vertical Bars layout

This optional theme stylesheet owns Web spacing and positioning around a vertical rail. It can be used with your existing theme without loading the full iOS 27 appearance. Native rendering and state synchronization are provided separately by [Capacitor Native UI](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/capacitor-native-ui/docs/vertical-bars.md).

```sh
npm install @rdlabo/ionic-theme-ios27
```

```scss
@use '@rdlabo/ionic-theme-ios27/dist/css/vertical-bars.css';
```

The layout behavior below assumes this stylesheet is loaded. For native runtime setup and device placement, follow the [integration guide](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/capacitor-native-ui/docs/ionic-vertical-bars.md).

## Reserve the vertical rail

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

## Migration

Move `setVerticalControlAreaPlacement` calls from the plugin to `setVerticalBarsLayout({ edge, inset })` from the theme. Move `applyFoldStateClasses` imports to the theme too. Remove `nativeEdge`: it no longer reports availability. The old plugin helpers are deprecated; update existing imports using the [migration guide](../../capacitor-native-ui/docs/migration.md#web-layout-ownership).
