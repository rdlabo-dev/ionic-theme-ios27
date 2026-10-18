# Set up Native UI in an Ionic app

Keep your existing Web appearance and render supported Ionic controls natively on iOS. This guide does not require iOS theme stylesheets.

Already using the iOS 27 theme? Follow [Add Native UI to your theme](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/add-native-ui.md). Without Ionic, follow the [HTML setup](framework-independent.md) instead.

## Before you start

Use an existing Ionic `>=8.8.1 <10` application with Capacitor 8 and an iOS project. Build with Xcode 26 or later; ordinary native controls require iOS 26 or later. Vertical Bars have separate [device requirements](vertical-bars.md). Keep your current SPM or CocoaPods integration.

If the app does not yet use Capacitor, create and configure its Capacitor iOS project before following the native steps below. Browser previews retain Web controls and do not demonstrate UIKit or SwiftUI rendering.

## 1. Install the plugin

Keep your Capacitor packages on version 8. Add these direct application dependencies:

```sh
npm install @rdlabo/capacitor-native-ui
```

The Ionic adapter uses `@ionic/core`, which your Ionic app already supplies. Do not remove your existing Web styles: they style page content and fallback controls.

## 2. Enable the shell

Call once from application startup after `ion-app` is mounted:

```ts
import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui';

const shell = await enableNativeUIShell();
```

Keep the returned handle if you need to disable features or stop projection. Call `await shell.destroy()` when its application owner is disposed. Do not start a new shell for each page.

Existing Ionic markup supplies labels, icons, disabled state, and actions. For example, an existing fixed page header can contain:

```html
<ion-header>
  <ion-toolbar>
    <ion-title>My app</ion-title>
    <ion-buttons slot="end">
      <ion-button aria-label="Add">
        <ion-icon slot="icon-only" name="add"></ion-icon>
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</ion-header>
```

Keep your framework's handler on the original button and register the icon as usual. See [supported markup](native-ui-shell.md#supported-markup) for eligibility; unsupported controls stay on the Web.

## 3. Coordinate navigation

For optional Ionic animation coordination, install `@rdlabo/ionic-theme-ios27` and configure navigation before Ionic initializes. Its adapter can retain Ionic's default transitions without loading theme CSS:

```sh
npm install @rdlabo/ionic-theme-ios27
```

```ts
import { iosTransitionAnimation, mdTransitionAnimation, type AnimationBuilder } from '@ionic/core';
import { withNativeUIShellTransition } from '@rdlabo/ionic-theme-ios27';

const defaultTransition: AnimationBuilder = (baseEl, opts) =>
  (opts.mode === 'ios' ? iosTransitionAnimation : mdTransitionAnimation)(baseEl, opts);

const ionicConfig = {
  navAnimation: withNativeUIShellTransition(defaultTransition),
};
```

Pass this option to Angular's `provideIonicAngular`, React's `setupIonicReact`, or Vue's `IonicVue` options. For custom animations, follow the [transition adapter instructions](migration.md#native-ui-shell-transition-adapter). This optional adapter requires the theme package but does not require its stylesheets or replace your animation.

For a plugin-only app, use [navigation without the theme](#navigation-without-the-theme) below. Configure one approach before testing page navigation.

## 4. Build, sync, and run

Run your application's Web build, then sync:

```sh
npx cap sync ios
```

Run the iOS app from Xcode on an iOS 26+ device or simulator. Supported fixed controls should render natively and still invoke their original handlers. Navigate forward and back, including a canceled swipe-back gesture. A browser or Android build should retain working Web controls.

| If you see… | Check… |
| --- | --- |
| All controls remain on the Web on iOS | The native package is a direct dependency, the app was synced and rebuilt, and startup ran on a supported OS. |
| Only one control remains on the Web | Compare its markup and styles with [supported controls](native-ui-shell.md#supported-markup). |
| Controls overlap during navigation | Configure the transition adapter or suspend/resume lifecycle before navigating. |
| Missing styles or spacing | Retain the app's Web CSS; the plugin does not supply page layout. |

## Next steps

- [Vertical Bars only](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo-with-original-theme.md): a step-by-step rail setup with your existing theme.
- [Configuration](configuration.md): choose controls and change rail settings at runtime.
- [Custom SwiftUI or Compose content](native-ui-extensions.md): create an app-local extension.
- [Migration](migration.md): update older package names, imports, and native projects.

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

Use your router's completion/cancellation lifecycle to release the suspension. For Ionic interactive animations, the optional theme adapter implements that coordination for you.
