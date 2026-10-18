---
title: Migration
---

# Migration

## Native UI package separation

For a new native integration, follow [Native UI setup](setup.md) or, if you already use the iOS theme, [Add Native UI to your theme](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/add-native-ui.md). The steps below cover existing applications migrating package names and native projects.

The theme and native controls now live in separate packages. Choose dependencies by the behavior your app uses:

| App behavior | Package to use directly |
| --- | --- |
| Theme styles, Ionic Web behavior, and theme animations | `@rdlabo/ionic-theme-ios27` |
| Native UI Shell or standalone Vertical Control Area | `@rdlabo/capacitor-native-ui` |
| Theme styling together with native controls | Both packages |

The theme owns the appearance and behavior of Ionic's Web elements. Native UI owns projecting supported controls into native iOS views and coordinating their lifecycle with Web navigation. Native UI can be used without the iOS 27 theme; installing it does not apply theme styles. Android and browsers retain Web presentation.

The theme uses the native package's shared transition/search integration internally. This dependency does not enable native controls automatically. Apps using native controls must declare the native package directly so Capacitor can discover the plugin.

### 1. Update application dependencies

These commands apply once the packages containing this migration are published. For unreleased workspace development, use the [local development instructions](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/docs/development.md#local-development).

For theme-only apps, update the theme package. Keep existing theme imports and CSS/Sass paths; no native startup or plugin setup is needed for theme-only use.

```sh
npm install @rdlabo/ionic-theme-ios27
```

For apps using both the theme and native controls, install both as direct application dependencies:

```sh
npm install @rdlabo/ionic-theme-ios27 @rdlabo/capacitor-native-ui
```

For native controls with your existing Web appearance, follow [Native UI only](setup.md#native-ui-only). Install the native package directly and keep your existing Web styles. The plugin no longer requires theme variables to select supported controls; Web layout remains the responsibility of your app or theme. The native package requires Capacitor 8 and Ionic 8.8.1 or later within Ionic 8 or 9.

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

Keep existing native startup options and control markup. The ordinary `@rdlabo/ionic-theme-ios27` entry, theme CSS/Sass paths, and theme animation imports stay unchanged. For custom navigation animations, see the [transition adapter instructions](#native-ui-shell-transition-adapter) below.

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

For repository layout, local file dependencies, and packaging/release procedures, see [Workspace development and migration](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/docs/development.md).

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

- `controls.toolbar` becomes `controls.buttons`.
- `controls.popover` becomes `verticalBars.popover`.
- Top-level `buttonProjection` and `buttonDefaultFill` move into `verticalBars`.
- The new `verticalBars.buttonDefaultFill` uses `'glass'` instead of `null`.
- `verticalBarsOnly: true` becomes `verticalBars: { only: true }`.
- Partial `controls` now override defaults. To preserve an old tabs-only configuration, explicitly set `buttons`, `segment` and `fab` to `false`.
- The global `enableVerticalControlArea()` remains a legacy startup wrapper. New code starts with `enableNativeUIShell({ verticalBars: { only: true } })`, then uses the returned handle's `enableVerticalControlArea()` / `disableVerticalControlArea()` methods.
- Legacy top-level options and global `enabled: false` remain compatible; use `shell.destroy()` to stop new code. If both old and new settings are supplied, the new nested settings take precedence.

See [all settings and defaults](configuration.md) and [plain HTML setup](framework-independent.md). Standard HTML buttons use the same Swift controls as Ionic; they do not require an application-specific Swift extension.

## Web layout ownership

Import `setVerticalBarsLayout` and `applyFoldStateClasses` from `@rdlabo/ionic-theme-ios27` for theme CSS. Replace `setVerticalControlAreaPlacement({ edge, nativeEdge, inset })` with `setVerticalBarsLayout({ edge, inset })`. Native UI now reads availability from its own device metrics; `nativeEdge` is ignored by the deprecated compatibility helper. Normal startup, disabled rails and teardown do not remove theme classes or alter reserved Web spacing. An unavailable native rail keeps the application’s Web rail layout; applications wanting a horizontal layout must select it themselves. Native-only applications can continue to use their own layout CSS.
