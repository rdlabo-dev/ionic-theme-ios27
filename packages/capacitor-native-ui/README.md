# Capacitor Native UI

Native UI Shell, Vertical Bars and app-local SwiftUI extensions for Ionic and Capacitor. Web markup and application state remain the source of truth.

```sh
npm install @ionic-theme/capacitor-native-ui
npx cap sync
```

```ts
import { enableNativeUIShell } from '@ionic-theme/capacitor-native-ui';

await enableNativeUIShell();
```

Requires Capacitor 8 and Ionic 8.8.1 or later (8 or 9). Native rendering currently supports iOS through Swift Package Manager or CocoaPods. The standard Android plugin is included, while Android and browsers retain Web presentation. The plugin does not depend on the iOS theme. For styled Web fallback, install `@rdlabo/ionic-theme-ios27` and load its CSS.

[Native UI Shell setup](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/docs/native-ui-shell.md) · [Vertical Bars](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/docs/vertical-bars.md) · [App-local extensions](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/docs/native-ui-extensions.md)

The Swift module remains `IonicNativeUIShellPlugin`; app-local extensions do not need to change their Swift imports.
