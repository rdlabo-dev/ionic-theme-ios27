# Add Native UI to your theme

Already using `@rdlabo/ionic-theme-ios27`? Add native controls on iOS while keeping your theme styles, Web content, and routing. Unsupported controls, browsers, and Android retain their Web appearance.

Start with [theme setup](setup.md) if you have not configured the theme yet. If you use a different Web appearance, follow [Native UI setup](../../capacitor-native-ui/docs/setup.md) instead.

Read [how projection works](../../capacitor-native-ui/README.md#how-projection-works) for how native controls remain connected to your Web DOM and handlers.

## 1. Install the native plugin

This guide assumes a Capacitor 8 application with an iOS project. Web-only theme users can continue without Capacitor; adding native iOS controls requires setting up that native project first. See [Native UI requirements](../../capacitor-native-ui/README.md#requirements) for supported Ionic, iOS, and Xcode versions.

Update the theme and Native UI together to keep their versions aligned, and install Foldable as a separate application dependency:

```sh
npm install @rdlabo/ionic-theme-ios27 @rdlabo/capacitor-native-ui @erkamyaman/capacitor-foldable
```

Keep your existing theme stylesheets. Capacitor's default plugin discovery requires a direct dependency; the copy installed through the theme alone does not register the native plugin.

## 2. Enable native controls

Enable the Shell once at application startup after `ion-app` is mounted:

```ts
import { enableNativeUI } from '@rdlabo/capacitor-native-ui';

const shell = await enableNativeUI();
```

Call `await shell.destroy()` when the application owner is disposed; do not create a shell for each page. Use the [Angular, React, or Vue app-root examples](../../capacitor-native-ui/docs/setup.md#place-startup-in-your-frameworks-app-root) to connect startup and cleanup.

Keep `navAnimation: iosTransitionAnimation` from the theme package. It already coordinates native controls during page transitions and back gestures; do not wrap it again. If you use a custom animation, follow the [transition adapter instructions](../../capacitor-native-ui/docs/migration.md#native-ui-transition-adapter).

Installing the plugin or configuring theme animations does not activate native controls. The application enables them with the startup call above.

## 3. Sync and run on iOS

Build your Web assets, then run:

```sh
npx cap sync ios
```

Run the app on a supported iOS device or simulator. Eligible fixed controls should use native presentation and still invoke their existing handlers. Navigate forward and back, then check the same app in a browser to confirm Web fallback. If everything stays on the Web on supported iOS, confirm the direct dependency, startup call, sync, and native rebuild. See [supported controls](../../capacitor-native-ui/docs/native-ui.md#supported-markup) for eligible markup and Web fallback behavior. Retain your theme styles for Web content and controls that are not projected.

## Optional: Vertical Bars

For a side rail, follow the [standard Vertical Bars setup](../../capacitor-native-ui/docs/ionic-vertical-bars.md): load the layout stylesheet and connect the installed Foldable plugin’s initial placement and events. The Shell includes the rail runtime; no additional startup call is needed. To automatically select rail controls, use `enableNativeUI({ controls: 'verticalOnly' })` instead of the default startup call. See [configuration options](../../capacitor-native-ui/docs/configuration.md).

## Upgrading an existing native integration

If you previously imported native APIs from the theme package, follow the [native import migration](../../capacitor-native-ui/docs/migration.md#2-replace-native-imports) and [native project migration](../../capacitor-native-ui/docs/migration.md#3-sync-the-native-project). Keep ordinary theme imports and stylesheets.
