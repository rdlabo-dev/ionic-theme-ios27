---
title: Migration
---

# Migration

## Native UI Shell transition adapter

Use `withNativeUIShellTransition()` to keep your existing Ionic navigation animation while coordinating Native UI Shell controls.

- If you already use this package's `iosTransitionAnimation`, no configuration change is needed. It now uses the shared adapter internally; do not add another wrapper.
- If you use Ionic's default animation without a `navAnimation` option, follow [Keep Ionic's default animation](./iphone-duo-with-original-theme.md#keep-ionic%27s-default-animation). The example selects Ionic's standard iOS or MD builder from the transition mode.
- If you use a custom navigation animation with Native UI Shell or the standalone Vertical Control Area, wrap your existing builder when configuring Ionic:

```diff
+ import { withNativeUIShellTransition } from '@rdlabo/ionic-theme-ios27/vertical-bars';

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

See [Special markup and classes](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/special-markup) and [Default variables](../src/styles/default-variables.scss) for the current names.

Earlier migration notes are preserved in the [iOS 26 migration guide](https://docs.rdlabo.dev/projects/ionic-theme-ios26/docs/migration).

## Submit button appearance

Submit buttons now use each Ionic color's standard contrast value and an iOS 27 directional edge treatment. Remove the theme-specific brightness variables.

```diff
  :root {
-  --ion-color-primary-brightness-rgb: 130, 255, 255;
-  --ion-color-primary-brightness: #96feff;
  }
```
