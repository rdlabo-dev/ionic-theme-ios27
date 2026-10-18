# Capacitor Native UI

Native UI Shell, Vertical Bars and app-local SwiftUI extensions for Capacitor, with Ionic and plain HTML adapters. Web markup and application state remain the source of truth.

```sh
npm install @capacitor/core @rdlabo/capacitor-native-ui @rdlabo/ionic-theme-utils@0.1.4
npx cap sync
```

```ts
import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui';

await enableNativeUIShell();
```

Requires Capacitor 8. Ionic is optional; its adapter supports Ionic 8.8.1 or later (8 or 9). Without Ionic, import `enableNativeUIShell` from `@rdlabo/capacitor-native-ui/core`. Native rendering currently supports iOS through Swift Package Manager or CocoaPods. The standard Android plugin is included, while Android and browsers retain Web presentation. The plugin does not depend on the iOS theme. For styled Web fallback, install `@rdlabo/ionic-theme-ios27` and load its CSS.

[Native UI Shell setup](docs/native-ui-shell.md) · [Vertical Bars](docs/vertical-bars.md) · [App-local extensions](docs/native-ui-extensions.md)

The Swift module remains `IonicNativeUIShellPlugin`; app-local extensions do not need to change their Swift imports.

## Documentation

- [Configuration](docs/configuration.md): defaults, Vertical Bars only, and live enable/disable.
- [Without Ionic](docs/framework-independent.md): explicit HTML controls and application-owned layout.
- [Setup](docs/setup.md): use native controls with your existing Web appearance.
- [Migration](docs/migration.md): package names, imports, and native project updates.
- [Add Native UI to your theme](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/add-native-ui.md): setup for existing iOS theme users.

Web layout and styling belong to your app or theme. The plugin does not require the iOS theme package or its CSS variables.

The Ionic entry point includes the popover adapter in its import graph, so bundlers require the optional peers `@ionic/core` and `@rdlabo/ionic-theme-utils@0.1.4`. The theme package already supplies the latter; native-only Ionic apps using the Ionic entry should install it directly. `/core` does not require either peer.

`@capacitor/core` is an optional peer for consumers of the plugin-free `/integration` entry (including the theme). Native startup through the root or `/core` entry requires Capacitor to be installed. Installing the theme does not enable native controls.
