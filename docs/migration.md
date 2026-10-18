---
title: Migration
---

# Migration

## Native UI package separation

Start with [Choose your setup](./setup.md) for separate installation, configuration, migration, and verification paths for **theme only**, **Native UI only**, and **both**. The steps below cover the shared package rename and native project changes.

The theme and native controls now live in separate packages. Choose dependencies by the behavior your app uses:

| App behavior | Package to use directly |
| --- | --- |
| Theme styles, Ionic Web behavior, and theme animations | `@rdlabo/ionic-theme-ios27` |
| Native UI Shell or standalone Vertical Control Area | `@rdlabo/capacitor-native-ui` |
| Theme styling together with native controls | Both packages |

The theme owns the appearance and behavior of Ionic's Web elements. Native UI owns projecting supported controls into native iOS views and coordinating their lifecycle with Web navigation. Native UI can be used without the iOS 27 theme; installing it does not apply theme styles. Android and browsers retain Web presentation.

The theme uses the native package's shared transition/search integration internally. This dependency does not enable native controls automatically. Apps using native controls must declare the native package directly so Capacitor can discover the plugin.

### 1. Update application dependencies

These commands apply once the packages containing this migration are published. For unreleased workspace development, use the [local development instructions](./monorepo.md#local-development).

For theme-only apps, update the theme package. Keep existing theme imports and CSS/Sass paths; no native startup or plugin setup is needed for theme-only use.

```sh
npm install @rdlabo/ionic-theme-ios27
```

For apps using both the theme and native controls, install both as direct application dependencies:

```sh
npm install @rdlabo/ionic-theme-ios27 @rdlabo/capacitor-native-ui
```

For native controls with your existing Web appearance, follow [Native UI only](./setup.md#native-ui-only). Install the native package directly and keep your existing Web styles. The plugin no longer requires theme variables to select supported controls; Web layout remains the responsibility of your app or theme. The native package requires Capacitor 8 and Ionic 8.8.1 or later within Ionic 8 or 9.

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

The Capacitor plugin is now supplied by the native package. If you manually linked the old theme Swift package in Xcode, remove that old reference so only the new package supplies the plugin. The Swift package/product is `IonicThemeCapacitorNativeUi`; app-local Swift extensions still use `import IonicNativeUIShellPlugin`. The Capacitor bridge name is unchanged.

For local Swift package references, the package now lives at `packages/capacitor-native-ui` within this repository; there is no root Swift package. Prefer Capacitor's generated integration for application dependencies.

### 4. Verify the migration

- Check `package.json` and the lockfile: native-enabled apps have a direct `@rdlabo/capacitor-native-ui` dependency and no intermediate `@ionic-theme/capacitor-native-ui` dependency.
- Build the application and confirm there are no imports of the removed theme entries or the intermediate package name.
- Build and launch the iOS app after sync. Check native controls, navigation/back gestures, and any app-local Swift extensions you use.
- Check browser and Android Web presentation where supported by your app, and confirm the theme still looks correct.

For repository layout, local file dependencies, and packaging/release procedures, see [Workspace development and migration](./monorepo.md).

## Native UI Shell transition adapter

Use `withNativeUIShellTransition()` to keep your existing Ionic navigation animation while coordinating Native UI Shell controls.

- If you already import `iosTransitionAnimation` from `@rdlabo/ionic-theme-ios27`, keep the [package animation setup](./iphone-duo-with-original-theme.md#use-this-package%27s-ios-animation); no configuration change is needed. It now uses the shared adapter internally; do not add another wrapper.
- If you use Ionic's default animation without a `navAnimation` option, follow [Keep Ionic's default animation](./iphone-duo-with-original-theme.md#keep-ionic%27s-default-animation). The example selects Ionic's standard iOS or MD builder from the transition mode.
- If you use a custom navigation animation with Native UI Shell or the standalone Vertical Control Area, wrap your existing builder when configuring Ionic:

```diff
+ import { withNativeUIShellTransition } from '@rdlabo/capacitor-native-ui/vertical-bars';

  const ionicConfig = {
-   navAnimation: existingTransition,
+   navAnimation: withNativeUIShellTransition(existingTransition),
  };
```

Merge this option into your existing Ionic configuration before initialization. The adapter preserves the animation's effects, duration, and easing while coordinating native retirement, swipe progress, and cancellation. Keep your existing theme stylesheet imports and Native UI Shell or Vertical Control Area startup.

Use the adapter only for navigation; leave modal and popover animations unchanged. Your builder must create a fresh `Animation` for each navigation because Ionic destroys it afterward. Keep lifecycle events for control registration and transitions without animation. If the custom builder animates a horizontal back button separately, exclude that effect while `.ios-theme-vertical-bars` is active.

See [Connect your navigation animation](./iphone-duo-with-original-theme.md#3.-connect-your-navigation-animation) for the setup and supported scope.

## From the iOS 26 theme

For an app using `@rdlabo/ionic-theme-ios26`, the recommended migration keeps that package and adds `@rdlabo/ionic-theme-ios27`. The [README setup](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/readme#get-started) selects iOS 27 or iOS 26 styles by browser capability and leaves Ionic's default iOS appearance on older browsers.

### 1. Add the new package

Keep the iOS 26 package and add iOS 27. The new theme requires `@ionic/core` 8.8.1 or later (Ionic 8 or 9).

```bash
npm install @rdlabo/ionic-theme-ios27
```

### 2. Make the styles adaptive

Replace unconditional iOS 26 imports in your global Sass stylesheet with two mutually exclusive branches. This example uses class-based dark mode:

```diff
+ @use 'sass:meta';
+
- @use '@rdlabo/ionic-theme-ios26/src/styles/default-variables.scss';
- @use '@rdlabo/ionic-theme-ios26/src/styles/ionic-theme-ios26.scss';
- @use '@rdlabo/ionic-theme-ios26/src/styles/ionic-theme-ios26-dark-class.scss';
- @use '@rdlabo/ionic-theme-ios26/src/styles/md-remove-ios-class-effect.scss';
+ @supports (overflow-anchor: auto) {
+  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/default-variables');
+  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/ionic-theme-ios27');
+  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/ionic-theme-ios27-dark-class');
+  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/md-remove-ios-class-effect');
+ }
+
+ @supports (text-wrap: pretty) and (not (overflow-anchor: auto)) {
+  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/default-variables');
+  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/ionic-theme-ios26');
+  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/ionic-theme-ios26-dark-class');
+  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/md-remove-ios-class-effect');
+ }
```

Keep Ionic's matching dark palette. For system or always-dark mode, replace both `-dark-class` imports with the matching variant. If you use `md-ion-list-inset`, load the corresponding package's stylesheet inside each branch. Browsers without either feature retain Ionic's default styling.

### 3. Switch the animations

Replace the iOS 26 animation import and gate the iOS 27 animations on the same browser features. Resolve the options before Ionic initializes:

```diff
- import { iosTransitionAnimation, popoverEnterAnimation, popoverLeaveAnimation } from '@rdlabo/ionic-theme-ios26';
+ import { iosTransitionAnimation, popoverEnterAnimation, popoverLeaveAnimation } from '@rdlabo/ionic-theme-ios27';
+
+ function loadIOSAnimations() {
+  if (typeof CSS === 'undefined') return {};
+  if (!CSS.supports('overflow-anchor: auto') && !CSS.supports('text-wrap: pretty')) return {};
+
+  return {
+    navAnimation: iosTransitionAnimation,
+    popoverEnter: popoverEnterAnimation,
+    popoverLeave: popoverLeaveAnimation,
+  };
+ }

  provideIonicAngular({
-  navAnimation: isPlatform('ios') ? iosTransitionAnimation : undefined,
-  popoverEnter: isPlatform('ios') ? popoverEnterAnimation : undefined,
-  popoverLeave: isPlatform('ios') ? popoverLeaveAnimation : undefined,
+  ...(isPlatform('ios') ? loadIOSAnimations() : {}),
  });
```

The iOS 27 page transition and popover animations serve both styled generations. Older browsers keep Ionic's defaults. The example uses Angular; pass the same options to React's `setupIonicReact` or Vue's `IonicVue`.

### 4. Update customizations

Rename theme variables and opt-out classes used by your app. For example:

```diff
  ion-content {
-  --ios26-content-box-shadow-rgb: 0, 0, 0;
+  --ios-theme-content-box-shadow-rgb: 0, 0, 0;
  }

- <ion-button class="ios26-disabled">Standard Ionic button</ion-button>
+ <ion-button class="ios-theme-disabled">Standard Ionic button</ion-button>
```

The old names remain as deprecated fallbacks. Check the resulting screens in light and dark modes on the browsers you support.

### iOS 27 only

To switch entirely to iOS 27, remove the iOS 26 package and replace its stylesheet and animation imports. The stylesheet changes are:

```diff
- @use '@rdlabo/ionic-theme-ios26/src/styles/default-variables.scss';
- @use '@rdlabo/ionic-theme-ios26/src/styles/ionic-theme-ios26.scss';
- @use '@rdlabo/ionic-theme-ios26/src/styles/ionic-theme-ios26-dark-class.scss';
- @use '@rdlabo/ionic-theme-ios26/src/styles/md-remove-ios-class-effect.scss';
+ @use '@rdlabo/ionic-theme-ios27/src/styles/default-variables.scss';
+ @use '@rdlabo/ionic-theme-ios27/src/styles/ionic-theme-ios27.scss';
+ @use '@rdlabo/ionic-theme-ios27/src/styles/ionic-theme-ios27-dark-class.scss';
+ @use '@rdlabo/ionic-theme-ios27/src/styles/md-remove-ios-class-effect.scss';
```

Change the animation import from `@rdlabo/ionic-theme-ios26` to `@rdlabo/ionic-theme-ios27`; the existing `isPlatform('ios')` configuration can stay. See the README's [iOS 27-only setup](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/readme#use-only-the-ios-27-theme). Unconditional imports apply the new styles on every browser using Ionic iOS mode.

## iOS 27 naming

For the iOS 27 branch or an iOS 27-only app, use `@rdlabo/ionic-theme-ios27`. Its stylesheets are `ionic-theme-ios27.scss` or `ionic-theme-ios27.css`, including the `-dark-always`, `-dark-system`, and `-dark-class` variants. Keep the iOS 26 stylesheet names in the iOS 26 branch of an adaptive setup.

Use the version-independent `--ios-theme-*` CSS variables. The corresponding `--ios26-*` variables remain supported as deprecated fallbacks. When both are set, the new name takes precedence. For example, use `--ios-theme-content-box-shadow-rgb` instead of `--ios26-content-box-shadow-rgb`.

For opting out of the theme, use the version-independent `ios-theme-disabled` class. The `ios26-disabled` class remains supported as a deprecated alias; migrate existing markup when convenient.

See [Special markup and classes](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/special-markup) and [Default variables](../packages/theme-ios27/src/styles/default-variables.scss) for the current names.

Earlier migration notes are preserved in the [iOS 26 migration guide](https://docs.rdlabo.dev/projects/ionic-theme-ios26/docs/migration).

## Submit button appearance

Submit buttons now use each Ionic color's standard contrast value and an iOS 27 directional edge treatment. Remove the theme-specific brightness variables.

```diff
  :root {
-  --ion-color-primary-brightness-rgb: 130, 255, 255;
-  --ion-color-primary-brightness: #96feff;
  }
```
