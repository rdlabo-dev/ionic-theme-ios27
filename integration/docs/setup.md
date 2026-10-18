# Theme and Native UI integration

Use either package independently or combine them:

- [Theme setup](../../packages/theme-ios27/docs/setup.md): Web styling, layout, and animations.
- [Native UI setup](../../packages/capacitor-native-ui/docs/setup.md): native control projection with your existing Web appearance.

The theme/application owns Web layout; the plugin owns native presentation and state synchronization. Installing a package does not enable native controls.

## Theme and Native UI

### Install and configure

```sh
npm install @rdlabo/ionic-theme-ios27 @rdlabo/capacitor-native-ui
```

Load the theme styles and configure theme animations using [theme setup](../../packages/theme-ios27/docs/setup.md). Then enable the Shell once at application startup:

```ts
import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui';

await enableNativeUIShell();
```

Keep `navAnimation: iosTransitionAnimation` from the theme package. That animation already integrates native coordination; do not wrap it again. If retaining a custom animation, use the [transition adapter](../../packages/capacitor-native-ui/docs/migration.md#native-ui-shell-transition-adapter).

Build your Web assets, then run:

```sh
npx cap sync ios
```

Follow [Native UI Shell](../../packages/capacitor-native-ui/docs/native-ui-shell.md) for supported controls, iOS build requirements, and fallback behavior. For Vertical Bars, also load its [opt-in layout stylesheet](../../packages/capacitor-native-ui/docs/vertical-bars.md#enable-vertical-bars) and configure placement. The Shell includes that runtime; do not also start `enableVerticalControlArea()`.

### Migrate and verify

Keep theme styles and ordinary theme API imports. Replace native imports using the [migration table](../../packages/capacitor-native-ui/docs/migration.md#2-replace-native-imports), declare the native package directly, and follow the [native project migration](../../packages/capacitor-native-ui/docs/migration.md#3-sync-the-native-project). Swift extensions retain `import IonicNativeUIShellPlugin`.

Build and launch on iOS; check eligible native controls, navigation and canceled back gestures, light/dark appearance, and any app-local extensions. Also check browser and Android Web fallback where your app supports them. Unsupported controls remain Web-rendered, so retain the theme styling for that content.
