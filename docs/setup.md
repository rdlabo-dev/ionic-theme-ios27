---
title: Choose your setup
---

# Choose your setup

Choose one of these three paths for an existing Ionic app (`@ionic/core >=8.8.1 <10`). Native runtime APIs additionally require Capacitor Core 8, including browser builds. The split-package installation commands apply after the corresponding packages are published; for unreleased code, follow [local workspace development](./monorepo.md#local-development).

| What you want | Start here |
| --- | --- |
| iOS 27 styling and Web animations | [Theme only](#theme-only) |
| Native controls with your existing Web appearance | [Native UI only](#native-ui-only) |
| iOS 27 styling and native controls together | [Theme and Native UI](#theme-and-native-ui) |

## Theme only

### Install and configure

```sh
npm install @rdlabo/ionic-theme-ios27
```

Keep Ionic's base styles. Add these imports to your global stylesheet for an iOS 27-only appearance:

```css
@import '@rdlabo/ionic-theme-ios27/dist/css/default-variables.css';
@import '@rdlabo/ionic-theme-ios27/dist/css/ionic-theme-ios27.css';
@import '@rdlabo/ionic-theme-ios27/dist/css/md-remove-ios-class-effect.css';
@import '@rdlabo/ionic-theme-ios27/dist/css/ionic-theme-ios27-dark-class.css';
```

This example uses class-based dark mode; load Ionic's matching dark palette. For system or always-dark mode, choose the matching theme variant and Ionic palette. For adaptive iOS 26/27 styles and framework-specific animation configuration, follow [Get started](../README.md#get-started).

Use `iosTransitionAnimation`, `popoverEnterAnimation`, and `popoverLeaveAnimation` from `@rdlabo/ionic-theme-ios27` in your Ionic configuration as described there. No native startup call or Capacitor sync is required for this path. The theme's internal dependency on Native UI supplies shared coordination code; it does not activate native controls.

### Migrate and verify

Existing theme entry imports and CSS/Sass paths stay unchanged after the package split. For an iOS 26 app, follow [From the iOS 26 theme](./migration.md#from-the-ios-26-theme).

Build the app and check light/dark appearance, page transitions, and supported browsers. If switching away from native controls, remove their startup calls and imports before removing the direct native dependency; sync an existing Capacitor project to update its plugin integration. Check any app-local Swift code that depended on the plugin too.

## Native UI only

This path keeps your existing Web appearance. The plugin renders supported controls after you explicitly enable it; theme CSS variables are not an activation requirement. Your app or theme owns Web layout, spacing, and styling.

### Install and configure

```sh
npm install @rdlabo/capacitor-native-ui
```

Keep your existing Ionic styles and layout. Enable the Shell once at application startup:

```ts
import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui';

await enableNativeUIShell();
```

Supported Ionic markup and control eligibility still apply; enabling the plugin does not make arbitrary Web elements native. See [Native UI Shell](./native-ui-shell.md#supported-markup).

Configure navigation before Ionic initializes. To retain Ionic's default transitions:

```ts
import { iosTransitionAnimation, mdTransitionAnimation, type AnimationBuilder } from '@ionic/core';
import { withNativeUIShellTransition } from '@rdlabo/capacitor-native-ui/vertical-bars';

const defaultTransition: AnimationBuilder = (baseEl, opts) =>
  (opts.mode === 'ios' ? iosTransitionAnimation : mdTransitionAnimation)(baseEl, opts);

const ionicConfig = {
  navAnimation: withNativeUIShellTransition(defaultTransition),
};
```

Pass this option to Angular's `provideIonicAngular`, React's `setupIonicReact`, or Vue's `IonicVue` options. For custom animations, follow the [transition adapter instructions](./migration.md#native-ui-shell-transition-adapter). This path does not require the iOS 27 theme package or its animations.

For optional Vertical Bars, your app or theme arranges the Web layout around the rail. The [existing-theme guide](./iphone-duo-with-original-theme.md) offers a ready-made stylesheet from the theme package; that stylesheet is a layout choice, not a plugin requirement. For a standalone rail, call `enableVerticalControlArea()` instead of the Shell; do not start both runtimes.

Build your Web assets, then run `npx cap sync ios` for a Capacitor iOS app. A browser can preview the Web layout; native presentation requires a supported iOS device or simulator.

### Migrate and verify

Replace old native imports using the [migration table](./migration.md#2-replace-native-imports). Keep or replace any layout CSS your app relies on when removing theme styles. Keep the native package as a direct dependency, and follow the [native project migration](./migration.md#3-sync-the-native-project) for old Swift references.

Check that Web content retains your existing appearance, eligible controls render natively on iOS, and navigation/back gestures work. Check browser and Android Web fallback where supported. If using a rail, also verify the layout supplied by your app or theme.

## Theme and Native UI

### Install and configure

```sh
npm install @rdlabo/ionic-theme-ios27 @rdlabo/capacitor-native-ui
```

Load the theme styles and configure theme animations using [Theme only](#theme-only). Then enable the Shell once at application startup:

```ts
import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui';

await enableNativeUIShell();
```

Keep `navAnimation: iosTransitionAnimation` from the theme package. That animation already integrates native coordination; do not wrap it again. If retaining a custom animation, use the [transition adapter](./migration.md#native-ui-shell-transition-adapter).

Build your Web assets, then run:

```sh
npx cap sync ios
```

Follow [Native UI Shell](./native-ui-shell.md) for supported controls, iOS build requirements, and fallback behavior. For Vertical Bars, also load its [opt-in layout stylesheet](./vertical-bars.md#enable-vertical-bars) and configure placement. The Shell includes that runtime; do not also start `enableVerticalControlArea()`.

### Migrate and verify

Keep theme styles and ordinary theme API imports. Replace native imports using the [migration table](./migration.md#2-replace-native-imports), declare the native package directly, and follow the [native project migration](./migration.md#3-sync-the-native-project). Swift extensions retain `import IonicNativeUIShellPlugin`.

Build and launch on iOS; check eligible native controls, navigation and canceled back gestures, light/dark appearance, and any app-local extensions. Also check browser and Android Web fallback where your app supports them. Unsupported controls remain Web-rendered, so retain the theme styling for that content.
