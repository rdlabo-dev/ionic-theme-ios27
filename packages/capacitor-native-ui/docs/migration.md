---
title: Migration
---

# Migration

> This guide targets the upcoming package split. Until the first native package release, use the [candidate archive installation](../README.md#try-the-unreleased-packages) in place of registry install commands.

## Migrating from Native UI Shell Preview

Native UI Shell was already published as **Preview** in `@rdlabo/ionic-theme-ios27` 1.2.0 and 1.2.1. Preview users need the migration below when adopting the split packages; changing the import alone is not sufficient for every configuration. Candidate/beta users should also compare their configuration with these mappings and use JavaScript and native code from the same candidate.

1. Install the matching packages and replace removed imports using [package separation](#native-ui-package-separation).
2. Translate startup settings using [shared shell configuration](#shared-shell-configuration-and-html-adapters), especially partial `controls` objects.
3. Update [Web layout ownership](#web-layout-ownership) and the [transition adapter](#native-ui-shell-transition-adapter) if used.
4. Rebuild Web assets, sync Capacitor, and rebuild the native app. A Web-only update cannot replace the native plugin.

Native UI Shell remains Preview. App-local SwiftUI / Compose **extensions are experimental**, including their TypeScript definitions, native registration APIs and placement behavior. This designation does not require renaming `defineNativeUI`, `extensions`, or existing registrations. Applications using extensions should keep their Web fallback and verify their reader, native renderer and action forwarding together after updates. See the [extension guide](native-ui-extensions.md).

## Native UI package separation

For a new native integration, follow [Native UI setup](setup.md) or, if you already use the iOS theme, [Add Native UI to your theme](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/add-native-ui.md). The steps below cover existing applications migrating package names and native projects.

The theme and native controls now live in separate packages. Choose dependencies by the behavior your app uses:

| App behavior | Package to use directly |
| --- | --- |
| Theme styles, Ionic Web behavior, and theme animations | `@rdlabo/ionic-theme-ios27` |
| Native UI Shell or standalone Vertical Control Area | `@rdlabo/capacitor-native-ui` |
| Theme styling together with native controls | Both packages |

The theme owns the appearance and behavior of Ionic's Web elements. Native UI owns projecting supported controls into native iOS views and coordinating their lifecycle with Web navigation. Native UI can be used without the iOS 27 theme; installing it does not apply theme styles. Standard controls on Android and browsers retain Web presentation; Android can render [app-local Compose extensions](native-ui-extensions.md#2b-register-compose-content-on-android).

The theme uses the native package's shared transition/search integration internally. This dependency does not enable native controls automatically. Apps using native controls must declare the native package directly so Capacitor can discover the plugin.

### 1. Update application dependencies

These commands apply once the packages containing this migration are published.

For theme-only apps, update the theme package. Keep existing theme imports and CSS/Sass paths; no native startup or plugin setup is needed for theme-only use.

```sh
npm install @rdlabo/ionic-theme-ios27
```

For apps using both the theme and native controls, install both as direct application dependencies:

```sh
npm install @rdlabo/ionic-theme-ios27 @rdlabo/capacitor-native-ui
```

For native controls with your existing Web appearance, follow [Native UI only](setup.md). Install the native package directly and keep your existing Web styles. The plugin no longer requires theme variables to select supported controls; Web layout remains the responsibility of your app or theme. Native startup requires Capacitor 8. The Ionic adapter requires Ionic 8.8.1 or later within Ionic 8 or 9; the `/core` entry does not require Ionic.

If you used the intermediate `@ionic-theme/capacitor-native-ui` package name during development, remove it and install `@rdlabo/capacitor-native-ui`. Keep the theme dependency if your app uses its styles or APIs.

```sh
npm uninstall @ionic-theme/capacitor-native-ui
npm install @rdlabo/capacitor-native-ui
```

### 2. Replace native imports

| Previous import | Replacement |
| --- | --- |
| `@rdlabo/ionic-theme-ios27/native` | `@rdlabo/capacitor-native-ui` |
| `@rdlabo/ionic-theme-ios27/vertical-bars` | `@rdlabo/capacitor-native-ui/vertical-bars` |
| `@ionic-theme/capacitor-native-ui` | `@rdlabo/capacitor-native-ui` |
| `@ionic-theme/capacitor-native-ui/vertical-bars` | `@rdlabo/capacitor-native-ui/vertical-bars` |
| `@ionic-theme/capacitor-native-ui/integration` | `@rdlabo/capacitor-native-ui/integration` |

Update both value and type imports, including lazy imports, test aliases, and bundler configuration. The old theme `/native` and `/vertical-bars` entries have been removed; there are no compatibility aliases.

```diff
- import { enableNativeUIShell } from '@rdlabo/ionic-theme-ios27/native';
+ import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui';
```

Keep existing control markup; review the [startup option changes](#shared-shell-configuration-and-html-adapters), including partial `controls` defaults. The ordinary `@rdlabo/ionic-theme-ios27` entry, theme CSS/Sass paths, and theme animation imports stay unchanged. For custom navigation animations, see the [transition adapter instructions](#native-ui-shell-transition-adapter) below.

### 3. Sync the native project

After updating dependencies and imports, rebuild your app's Web assets with its usual build command, then run:

```sh
npx cap sync ios
```

The Capacitor plugin is now supplied by the native package. If you manually linked the old theme Swift package in Xcode, remove that old reference so only the new package supplies the plugin. Capacitor discovers the `RdlaboCapacitorNativeUi` Swift product; the previous `IonicThemeCapacitorNativeUi` product remains available for manually linked projects; app-local Swift extensions still use `import IonicNativeUIShellPlugin`. The Capacitor bridge name is unchanged.

For local Swift package references, the package now lives at `packages/capacitor-native-ui` within this repository; there is no root Swift package. Prefer Capacitor's generated integration for application dependencies.

### 4. Verify the migration

- Check `package.json` and the lockfile: native-enabled apps have a direct `@rdlabo/capacitor-native-ui` dependency and no intermediate `@ionic-theme/capacitor-native-ui` dependency.
- Build the application and confirm there are no imports of the removed theme entries or the intermediate package name.
- Build and launch the iOS app after sync. Check native controls, navigation/back gestures, and any app-local Swift extensions you use.
- Check browser and Android Web presentation where supported by your app, and confirm the theme still looks correct.
- Check that previously disabled control kinds remain disabled after expanding partial Preview settings. Test toolbar grouping, individually selected actions and back navigation in both horizontal and vertical layouts.
- For experimental extensions, check native registration, props, click forwarding and restoration of the original Web UI when projection is unavailable. Rebuild and sync Android as well if the app uses Compose extensions.

## Native UI Shell transition adapter

The Ionic transition adapter now belongs to `@rdlabo/ionic-theme-ios27`. Replace preview imports from the plugin’s `/integration` or `/vertical-bars` entry with the theme root. Native-only applications can use `shell.suspend()` and the returned `resume()` directly.

Use `withNativeUIShellTransition()` to keep your existing Ionic navigation animation while coordinating Native UI Shell controls.

- If you already import `iosTransitionAnimation` from `@rdlabo/ionic-theme-ios27`, keep the [package animation setup](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo-with-original-theme.md#use-this-packages-ios-animation); no configuration change is needed. It now uses the shared adapter internally; do not add another wrapper.
- If you use Ionic's default animation without a `navAnimation` option, follow [Keep Ionic's default animation](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo-with-original-theme.md#keep-ionics-default-animation). The example selects Ionic's standard iOS or MD builder from the transition mode.
- If you use a custom navigation animation with Native UI Shell or the standalone Vertical Control Area, wrap your existing builder when configuring Ionic:

```diff
+ import { withNativeUIShellTransition } from '@rdlabo/ionic-theme-ios27';

  const ionicConfig = {
-   navAnimation: existingTransition,
+   navAnimation: withNativeUIShellTransition(existingTransition),
  };
```

Merge this option into your existing Ionic configuration before initialization. The adapter preserves the animation's effects, duration, and easing while coordinating native retirement, swipe progress, and cancellation. Keep your existing theme stylesheet imports and Native UI Shell or Vertical Control Area startup.

Use the adapter only for navigation; leave modal and popover animations unchanged. Your builder must create a fresh `Animation` for each navigation because Ionic destroys it afterward. Keep lifecycle events for control registration and transitions without animation. If the custom builder animates a horizontal back button separately, exclude that effect while `.ios-theme-vertical-bars` is active.

See [Connect your navigation animation](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo-with-original-theme.md#3-connect-your-navigation-animation) for the setup and supported scope.

## Shared shell configuration and HTML adapters

Run `npx cap sync ios` after updating: JavaScript now sends framework-independent control kinds to Swift. New Swift code also accepts the previous `ion-*` kinds, but new JavaScript requires the matching native plugin.

- `controls.toolbar` becomes `ionic.auto.buttons`.
- `controls.popover` becomes `verticalBars.popover`.
- Top-level `buttonProjection` and `buttonDefaultFill` move into `verticalBars`.
- The new `verticalBars.buttonDefaultFill` uses `'glass'` instead of `null`.
- `verticalBarsOnly: true` becomes `verticalBars: { only: true }`.
- Omitted automatic kinds now default to `true`, including partial legacy `controls` objects. Published 1.2.x enabled only fields explicitly set to `true` when `controls` was supplied. Expand partial objects when migrating, even if you keep the legacy option name.
- The global `enableVerticalControlArea()` remains a legacy startup wrapper. New code starts with `enableNativeUIShell({ verticalBars: { only: true } })`, then uses the returned handle's `enableVerticalControlArea()` / `disableVerticalControlArea()` methods.
- Legacy option names and global `enabled: false` remain accepted; use `shell.destroy()` to stop new code. If both old and new settings are supplied, the new nested settings take precedence.

For example, preserve a Preview configuration that projected only tabs:

```diff
- import { enableNativeUIShell } from '@rdlabo/ionic-theme-ios27/native';
+ import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui';

  const shell = await enableNativeUIShell({
-   controls: { tabs: true },
-   buttonProjection: 'source',
-   buttonDefaultFill: null,
+   ionic: { auto: { tabs: true, buttons: false, segment: false, fab: false } },
+   verticalBars: { buttonProjection: 'source', buttonDefaultFill: 'glass' },
  });
```

Likewise, replace `controls: {}` with `ionic: { auto: false }` to keep automatic Ionic projection off. Explicit `data-native-ui` sources and extensions remain independent. Calling `enableNativeUIShell()` with no options still enables all supported automatic kinds.

### Toolbar selection and grouping by layout

`horizontal` and `vertical` are new toolbar settings. Omit them to retain automatic selection and grouping, or configure each layout independently:

```ts
const shell = await enableNativeUIShell({
  horizontal: false,
  vertical: { buttons: false, button: false, backButton: true },
});
```

This selects only eligible back buttons among vertical toolbar actions and disables automatic horizontal toolbar selection. Tabs, segments and FABs retain their own settings. To enable all eligible toolbar actions only in vertical layout, use `{ horizontal: false, vertical: true }`; this follows layout, not the Duo model.

Do not translate `controls.toolbar` or `ionic.auto.buttons` into `vertical.buttons`: those options govern the entire automatic toolbar category, while `horizontal.buttons` / `vertical.buttons` govern **grouping only**. Within each layout, `button` selects ordinary actions and `backButton` selects back navigation independently. All three fields default to `true`; a layout value of `false` sets all three to `false`.

If you used the short-lived development settings at the top level, move `{ buttons, button, backButton }` into `vertical: { buttons, button, backButton }`. Those fields were not part of the published 1.2.0/1.2.1 API and are not compatibility aliases. Existing `buttonProjection` / `buttonDefaultFill` are separate appearance settings, mapped above.

Local `data-horizontal-bars="true|false"` / `data-vertical-bars="true|false"` can override these layout defaults. On `ion-buttons` they affect grouping only and never select children. A back button ignores its group's grouping setting. `ionic.auto` and structural exclusions still apply. See [toolbar selection and grouping](native-ui-shell.md#toolbar-selection-and-grouping) for eligibility and when changes take effect.

See [all settings and defaults](configuration.md) and [plain HTML setup](framework-independent.md). Standard HTML buttons use the same Swift controls as Ionic; they do not require an application-specific Swift extension.

## Web layout ownership

Import `setVerticalBarsLayout` and `applyFoldStateClasses` from `@rdlabo/ionic-theme-ios27` for theme CSS. Replace `setVerticalControlAreaPlacement({ edge, nativeEdge, inset })` with `setVerticalBarsLayout({ edge, inset })`. Native UI now reads availability from its own device metrics; `nativeEdge` is ignored by the deprecated compatibility helper. Normal startup, disabled rails and teardown do not remove theme classes or alter reserved Web spacing. An unavailable native rail keeps the application’s Web rail layout; applications wanting a horizontal layout must select it themselves. Native-only applications can continue to use their own layout CSS.

## Automatic Ionic controls

Use `ionic.auto` for new configuration. It accepts `true` (default), `false`, or `{ buttons, tabs, segment, fab }`. Unlike legacy `controls`, it affects only automatic Ionic projection; explicit `data-native-ui` sources and registered extensions remain enabled. `verticalBars` independently controls rail projection. See [selective projection](configuration.md#select-controls-explicitly-in-a-customized-ionic-app) for an existing Ionic app that opts in individual buttons.

The legacy `controls` option is marked `@deprecated` and remains available. When `ionic.auto` is omitted, legacy kind settings are used, but omitted kinds now default to `true`; expand partial Preview configurations as shown above. If both are supplied, `ionic.auto` takes precedence for automatic kinds. Move the legacy `popover` option to `verticalBars.popover`.
