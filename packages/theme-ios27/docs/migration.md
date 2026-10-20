---
title: Theme migration
---

# Theme migration

## Native UI package separation

Theme styles and ordinary theme API imports remain supported. If you previously used native controls through this package, the `/native` and `/vertical-bars` entries have been removed:

| Previous import                           | Replacement                                 |
| ----------------------------------------- | ------------------------------------------- |
| `@rdlabo/ionic-theme-ios27/native`        | `@rdlabo/capacitor-native-ui`               |
| `@rdlabo/ionic-theme-ios27/vertical-bars` | `@rdlabo/capacitor-native-ui/vertical-bars` |

Add the native package as a direct application dependency, update imports, rebuild Web assets, and run `npx cap sync ios`. Follow the [Native UI migration guide](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/capacitor-native-ui/docs/migration.md) for 1.2.1 startup settings and native project changes. Theme-only apps do not need native startup or plugin setup.

## From the iOS 26 theme

For an app using `@rdlabo/ionic-theme-ios26`, the recommended migration keeps that package and adds `@rdlabo/ionic-theme-ios27`. The [adaptive theme setup](adaptive-themes.md) selects iOS 27 or iOS 26 styles by browser capability and leaves Ionic's default iOS appearance on older browsers.

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

Change the animation import from `@rdlabo/ionic-theme-ios26` to `@rdlabo/ionic-theme-ios27`; the existing `isPlatform('ios')` configuration can stay. See the [iOS 27 setup](setup.md). Unconditional imports apply the new styles on every browser using Ionic iOS mode.

## iOS 27 naming

For the iOS 27 branch or an iOS 27-only app, use `@rdlabo/ionic-theme-ios27`. Its stylesheets are `ionic-theme-ios27.scss` or `ionic-theme-ios27.css`, including the `-dark-always`, `-dark-system`, and `-dark-class` variants. Keep the iOS 26 stylesheet names in the iOS 26 branch of an adaptive setup.

| Customization       | Current name                                                      | Legacy behavior                                                                                   |
| ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| CSS variables       | `--ios-theme-*`, for example `--ios-theme-content-box-shadow-rgb` | Corresponding `--ios26-*` names remain deprecated fallbacks. Current names win when both are set. |
| Theme opt-out class | `ios-theme-disabled`                                              | `ios26-disabled` remains a deprecated alias; migrate existing markup when convenient.             |

Use the version-independent names for new customizations.

See [Special markup and classes](special-markup.md) and [Default variables](../src/styles/default-variables.scss) for the current names.

Earlier migration notes are preserved in the [iOS 26 migration guide](https://docs.rdlabo.dev/projects/ionic-theme-ios26/docs/migration).

## Submit button appearance

Submit buttons now use each Ionic color's standard contrast value and an iOS 27 directional edge treatment. Remove the theme-specific brightness variables.

```diff
  :root {
-  --ion-color-primary-brightness-rgb: 130, 255, 255;
-  --ion-color-primary-brightness: #96feff;
  }
```
