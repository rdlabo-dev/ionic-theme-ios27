---
title: Migration
---

# Migration

## Upgrading from 1.2.1

This guide is for applications using `@rdlabo/ionic-theme-ios27` **1.2.1**, including its Native UI Shell Preview and standalone Vertical Control Area.

- **Theme only:** update the theme package. Existing theme imports, CSS/Sass paths and animation imports remain valid; no native startup is needed.
- **Native UI or Vertical Control Area:** install the native package directly, replace imports and startup settings below, then sync Capacitor and rebuild the native app.

Native UI remains Preview. Experimental Extensions are documented in the [current extension guide](native-ui-extensions.md); this guide covers the published 1.2.1 controls and setup.

## Native UI package separation

For a new native integration, follow [Native UI setup](setup.md) or, if you already use the iOS theme, [Add Native UI to your theme](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/add-native-ui.md). The steps below cover existing applications migrating package names and native projects.

The theme and native controls now live in separate packages. Choose dependencies by the behavior your app uses:

| App behavior                                           | Package to use directly       |
| ------------------------------------------------------ | ----------------------------- |
| Theme styles, Ionic Web behavior, and theme animations | `@rdlabo/ionic-theme-ios27`   |
| Native UI or standalone Vertical Control Area          | `@rdlabo/capacitor-native-ui` |
| Theme styling together with native controls            | Both packages                 |

The theme owns the appearance and behavior of Ionic's Web elements. Native UI owns projecting supported controls into native iOS views and coordinating their lifecycle with Web navigation. Native UI can be used without the iOS 27 theme; installing it does not apply theme styles. Standard controls on Android and browsers retain Web presentation; Android can render [app-local Compose extensions](native-ui-extensions.md#2b-register-compose-content-on-android).

The theme uses the native package's shared transition/search integration internally. This dependency does not enable native controls automatically. Apps using native controls must declare the native package directly so Capacitor can discover the plugin.

### 1. Update application dependencies

When using both packages, update them together to keep their versions aligned.

For theme-only apps, update the theme package. Keep existing theme imports and CSS/Sass paths; no native startup or plugin setup is needed for theme-only use.

```sh
npm install @rdlabo/ionic-theme-ios27
```

For apps using both the theme and native controls, install both as direct application dependencies:

```sh
npm install @rdlabo/ionic-theme-ios27 @rdlabo/capacitor-native-ui
```

For native controls with your existing Web appearance, follow [Native UI only](setup.md). Install the native package directly and keep your existing Web styles. The plugin no longer requires theme variables to select supported controls; Web layout remains the responsibility of your app or theme. Native startup requires Capacitor 8. The Ionic adapter requires Ionic 8.8.1 or later within Ionic 8 or 9; the `/core` entry does not require Ionic.

### 2. Replace native imports

| Previous import                           | Replacement                                 |
| ----------------------------------------- | ------------------------------------------- |
| `@rdlabo/ionic-theme-ios27/native`        | `@rdlabo/capacitor-native-ui`               |
| `@rdlabo/ionic-theme-ios27/vertical-bars` | `@rdlabo/capacitor-native-ui/vertical-bars` |

Update both value and type imports, including lazy imports, test aliases, and bundler configuration. The old theme `/native` and `/vertical-bars` entries have been removed; there are no compatibility aliases.

```diff
- import { enableNativeUIShell } from '@rdlabo/ionic-theme-ios27/native';
+ import { enableNativeUI } from '@rdlabo/capacitor-native-ui';
```

Keep existing control markup; review the [startup option changes](#startup-options), including partial `controls` defaults. The ordinary `@rdlabo/ionic-theme-ios27` entry, theme CSS/Sass paths, and theme animation imports stay unchanged. For custom navigation animations, see the [transition adapter instructions](#native-ui-transition-adapter) below.

### 3. Sync the native project

After updating dependencies and imports, rebuild your app's Web assets with its usual build command, then run:

```sh
npx cap sync ios
```

The Capacitor plugin is now supplied by the native package. Remove manually linked copies of the old theme Swift package so only the new package supplies the plugin. The Swift package/product and CocoaPods pod are now `RdlaboCapacitorNativeUi`; the Swift module is `NativeUIPlugin`. The Capacitor bridge name is now `NativeUI` on JavaScript, iOS and Android. Run Capacitor sync for each native platform you use and rebuild the native app. An OTA/Web-only update cannot migrate an installed binary containing only the old plugin. Use matching JavaScript and native package versions.

Use Capacitor's generated integration for the npm dependency; applications do not need a checkout of this repository or a manually linked Swift package.

### 4. Verify the migration

- Check that native-enabled apps declare `@rdlabo/capacitor-native-ui` directly, then build and confirm no imports of the removed theme entries remain.
- Build and launch the iOS app after sync. Check native controls, navigation/back gestures, and restored Web controls after teardown.
- Check browser and Android Web presentation where supported by your app, and confirm the theme still looks correct.
- Check that previously disabled control kinds remain disabled after expanding partial Preview settings. Test toolbar grouping, individually selected actions and back navigation in both horizontal and vertical layouts.

## Native UI naming changes

The split package uses Native UI names throughout. These are breaking renames; the old names are not aliases. The previous names below refer to the published 1.2.1 Preview.

| Previous name                                                                                                                                      | New name                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `enableNativeUIShell()`                                                                                                                            | `enableNativeUI()`                                                                                                   |
| `NativeUIShellOptions`, `NativeUIShellHandle`, `NativeUIShellStatus`, `NativeUIShellSuspension`, `NativeUIShellControls`, `NativeUIShellComponent` | `NativeUIOptions`, `NativeUIHandle`, `NativeUIStatus`, `NativeUISuspension`, `NativeUIControls`, `NativeUIComponent` |
| `IonicNativeUIShell` (plugin export and bridge registration)                                                                                       | `NativeUI`                                                                                                           |
| `withNativeUIShellTransition()`                                                                                                                    | `withNativeUITransition()` (still exported by the theme package)                                                     |
| `IonicNativeUIShellPlugin` (Swift module/native class)                                                                                             | `NativeUIPlugin`                                                                                                     |
| `RdlaboIonicThemeIos27` (SPM package/product)                                                                                                      | `RdlaboCapacitorNativeUi`                                                                                            |
| `data-shell="disabled"`                                                                                                                            | `data-native-ui="disabled"`                                                                                          |
| `.ios-theme-shell-disabled`                                                                                                                        | `.native-ui-disabled`                                                                                                |

Runtime-owned attributes/events are internal, not configuration: `data-native-ui-shell` is now `data-native-ui-projected`, other `data-native-ui-shell-*` attributes use `data-native-ui-*`, `nativeUIShell*` events use `nativeUI*`, and `.ios-theme-native-ui-shell-*` classes use `.native-ui-*`. Update application tests or diagnostics that inspect them. **Keep explicit source declarations such as `data-native-ui="button"` unchanged**; the projected marker is separate and is managed by the runtime.

## Native UI transition adapter

The Ionic transition adapter now belongs to `@rdlabo/ionic-theme-ios27`. Replace the 1.2.1 import of `withNativeUIShellTransition` from `@rdlabo/ionic-theme-ios27/vertical-bars` with `withNativeUITransition` from the theme root. Native-only applications can use `shell.suspend()` and the returned `resume()` directly.

Use `withNativeUITransition()` to keep your existing Ionic navigation animation while coordinating Native UI controls.

- If you already import `iosTransitionAnimation` from `@rdlabo/ionic-theme-ios27`, keep the [package animation setup](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo-with-original-theme.md#use-this-packages-ios-animation); no configuration change is needed. It now uses the shared adapter internally; do not add another wrapper.
- If you use Ionic's default animation without a `navAnimation` option, follow [Keep Ionic's default animation](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo-with-original-theme.md#keep-ionics-default-animation). The example selects Ionic's standard iOS or MD builder from the transition mode.
- If you use a custom navigation animation with Native UI or the standalone Vertical Control Area, wrap your existing builder when configuring Ionic:

```diff
+ import { withNativeUITransition } from '@rdlabo/ionic-theme-ios27';

  const ionicConfig = {
-   navAnimation: existingTransition,
+   navAnimation: withNativeUITransition(existingTransition),
  };
```

Merge this option into your existing Ionic configuration before initialization. The adapter preserves the animation's effects, duration, and easing while coordinating native retirement, swipe progress, and cancellation. Keep your existing theme stylesheet imports and Native UI or Vertical Control Area startup.

Use the adapter only for navigation; leave modal and popover animations unchanged. Your builder must create a fresh `Animation` for each navigation because Ionic destroys it afterward. Keep lifecycle events for control registration and transitions without animation. If the custom builder animates a horizontal back button separately, exclude that effect while `.ios-theme-vertical-bars` is active.

See [Connect your navigation animation](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo-with-original-theme.md#3-connect-your-navigation-animation) for the setup and supported scope.

## Startup options

In 1.2.1, providing `controls` enabled **only fields set to `true`**. In the new API, omitted fields default to `true`, even in a partial object. Expand your old selection when migrating.

| 1.2.1                               | New configuration                                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `controls`                       | No `controls`: all supported kinds remain selected by default.                                                                                            |
| `controls: {}`                      | `controls: false` to disable default selection, or `ionic: { auto: false }` to disable Ionic discovery altogether.                                        |
| `controls.toolbar`                  | Set `controls.buttonGroup`, `controls.button`, and `controls.backButton` to the old toolbar value.                                                        |
| `controls.tabs`, `.segment`, `.fab` | Same names, but explicitly use `false` for previously omitted fields.                                                                                     |
| `buttonProjection`                  | `ionic.verticalBars.buttonProjection`                                                                                                                     |
| `buttonDefaultFill: null`           | `ionic.verticalBars.buttonDefaultFill: 'glass'` (also the default)                                                                                        |
| `buttonDefaultFill: 'solid'`        | `ionic.verticalBars.buttonDefaultFill: 'solid'`                                                                                                           |
| `verticalBarsOnly: true`            | `controls: 'verticalOnly'` for default selection in the rail. For a partial selection, use `'verticalOnly'` on each enabled kind and `false` on the rest. |
| `enabled: false`                    | Do not start the runtime, or call the active handle's `destroy()`.                                                                                        |

The old startup option names are removed, without aliases. The standalone `enableVerticalControlArea()` entry remains available and defaults `controls` to `'verticalOnly'`; its appearance settings also move under `ionic.verticalBars`. Use only one startup entry per app.

### Preserve a tabs-only configuration

```diff
- import { enableNativeUIShell } from '@rdlabo/ionic-theme-ios27/native';
+ import { enableNativeUI } from '@rdlabo/capacitor-native-ui';

- const shell = await enableNativeUIShell({
-   controls: { tabs: true },
-   buttonProjection: 'source',
-   buttonDefaultFill: null,
+ const shell = await enableNativeUI({
+   controls: {
+     buttonGroup: false,
+     button: false,
+     backButton: false,
+     tabs: true,
+     segment: false,
+     fab: false,
+   },
+   ionic: {
+     verticalBars: { buttonProjection: 'source', buttonDefaultFill: 'glass' },
+   },
  });
```

### Select controls by placement

All six control fields accept `boolean | 'horizontalOnly' | 'verticalOnly'`. A scalar `controls` value applies to every field. Horizontal and vertical mean ordinary placement and the rail, not device orientation or model.

```ts
const shell = await enableNativeUI({ controls: 'verticalOnly' });
```

These are selection defaults, not a hard projection scope. Explicit `data-native-ui` sources and local `data-horizontal-bars="true"` / `data-vertical-bars="true"` can opt in even when a matching default is `false`. Remove the explicit marker or use `data-native-ui="disabled"` to leave an individual source on the Web. `ionic.auto: false` disables automatic Ionic discovery, including local layout opt-ins, but leaves explicit source declarations enabled.

`buttonGroup` controls grouping only. It does not select children: `buttonGroup: true, button: false` projects no ordinary action without explicit selection. `backButton` controls back navigation independently, including inside an `ion-buttons` container. See [all settings](configuration.md) for the complete selection matrix and [toolbar grouping](native-ui.md#toolbar-selection-and-grouping) for local overrides.

## Web layout ownership

Import `setVerticalBarsLayout` and `applyFoldStateClasses` from `@rdlabo/ionic-theme-ios27` for theme CSS. Replace `setVerticalControlAreaPlacement({ edge, nativeEdge, inset })` with `setVerticalBarsLayout({ edge, inset })`. Native UI now reads availability from its own device metrics; `nativeEdge` is ignored by the deprecated compatibility helper. Normal startup, disabled rails and teardown do not remove theme classes or alter reserved Web spacing. An unavailable native rail keeps the application’s Web rail layout; applications wanting a horizontal layout must select it themselves. Native-only applications can continue to use their own layout CSS.
