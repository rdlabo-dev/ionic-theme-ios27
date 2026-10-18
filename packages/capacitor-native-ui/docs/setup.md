# Setup

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

Supported Ionic markup and control eligibility still apply; enabling the plugin does not make arbitrary Web elements native. See [Native UI Shell](native-ui-shell.md#supported-markup).

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

Pass this option to Angular's `provideIonicAngular`, React's `setupIonicReact`, or Vue's `IonicVue` options. For custom animations, follow the [transition adapter instructions](migration.md#native-ui-shell-transition-adapter). This path does not require the iOS 27 theme package or its animations.

For optional Vertical Bars, your app or theme arranges the Web layout around the rail. The [existing-theme guide](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/integration/docs/iphone-duo-with-original-theme.md) offers a ready-made stylesheet from the theme package; that stylesheet is a layout choice, not a plugin requirement. For a standalone rail, call `enableVerticalControlArea()` instead of the Shell; do not start both runtimes.

Build your Web assets, then run `npx cap sync ios` for a Capacitor iOS app. A browser can preview the Web layout; native presentation requires a supported iOS device or simulator.

### Migrate and verify

Replace old native imports using the [migration table](migration.md#2-replace-native-imports). Keep or replace any layout CSS your app relies on when removing theme styles. Keep the native package as a direct dependency, and follow the [native project migration](migration.md#3-sync-the-native-project) for old Swift references.

Check that Web content retains your existing appearance, eligible controls render natively on iOS, and navigation/back gestures work. Check browser and Android Web fallback where supported. If using a rail, also verify the layout supplied by your app or theme.

