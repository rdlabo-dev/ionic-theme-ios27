# Setup

## Native UI only

This path keeps your existing Web appearance. The plugin renders supported controls after you explicitly enable it; theme CSS variables are not an activation requirement. Your app or theme owns Web layout, spacing, and styling.

### Install and configure

```sh
npm install @capacitor/core @rdlabo/capacitor-native-ui @rdlabo/ionic-theme-utils@0.1.4
```

Keep your existing Ionic styles and layout. Enable the Shell once at application startup:

```ts
import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui';

await enableNativeUIShell();
```

Supported Ionic markup and control eligibility still apply; enabling the plugin does not make arbitrary Web elements native. See [Native UI Shell](native-ui-shell.md#supported-markup).

For optional Ionic animation coordination, install `@rdlabo/ionic-theme-ios27` and configure navigation before Ionic initializes. Its adapter can retain Ionic's default transitions without loading theme CSS:

```ts
import { iosTransitionAnimation, mdTransitionAnimation, type AnimationBuilder } from '@ionic/core';
import { withNativeUIShellTransition } from '@rdlabo/ionic-theme-ios27';

const defaultTransition: AnimationBuilder = (baseEl, opts) =>
  (opts.mode === 'ios' ? iosTransitionAnimation : mdTransitionAnimation)(baseEl, opts);

const ionicConfig = {
  navAnimation: withNativeUIShellTransition(defaultTransition),
};
```

Pass this option to Angular's `provideIonicAngular`, React's `setupIonicReact`, or Vue's `IonicVue` options. For custom animations, follow the [transition adapter instructions](migration.md#native-ui-shell-transition-adapter). This optional adapter requires the theme package but does not require its stylesheets or replace your animation. For a plugin-only application, use the suspension API below.

For optional Vertical Bars, your app or theme arranges the Web layout around the rail. The [existing-theme guide](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo-with-original-theme.md) offers a ready-made stylesheet from the theme package; that stylesheet is a layout choice, not a plugin requirement. For rail-only projection, call `enableNativeUIShell({ verticalBars: { only: true } })`. See [all configuration options](configuration.md).

Build your Web assets, then run `npx cap sync ios` for a Capacitor iOS app. A browser can preview the Web layout; native presentation requires a supported iOS device or simulator.

### Migrate and verify

Replace old native imports using the [migration table](migration.md#2-replace-native-imports). Keep or replace any layout CSS your app relies on when removing theme styles. Keep the native package as a direct dependency, and follow the [native project migration](migration.md#3-sync-the-native-project) for old Swift references.

Check that Web content retains your existing appearance, eligible controls render natively on iOS, and navigation/back gestures work. Check browser and Android Web fallback where supported. If using a rail, also verify the layout supplied by your app or theme.


For an application without Ionic, use the [plain HTML adapter](framework-independent.md). Ionic is an optional peer dependency, not a requirement of the standard native renderers.

`@capacitor/core` is an optional peer for consumers of the plugin-free `/integration` entry (including the theme). Native startup through the root or `/core` entry requires Capacitor to be installed. Installing the theme does not enable native controls.

## Navigation without the theme

Native UI does not depend on a theme or an Ionic animation builder. Your router can suspend projection before changing pages and resume it after completion or cancellation:

```ts
const suspension = await shell.suspend();
try {
  await navigate();
} finally {
  await suspension.resume();
}
```

Use your router's completion/cancellation lifecycle to release the suspension. For Ionic interactive animations, the optional theme adapter implements that coordination for you. Migrating from the preview adapter in the plugin: import `withNativeUIShellTransition` from `@rdlabo/ionic-theme-ios27` instead of the plugin's `/integration` or `/vertical-bars` entry.
