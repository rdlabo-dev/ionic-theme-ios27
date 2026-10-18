# Setup

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

### Existing applications

Existing theme entry imports and CSS/Sass paths stay unchanged after the package split. For an iOS 26 app, follow [From the iOS 26 theme](migration.md#from-the-ios-26-theme).

Build the app and check light/dark appearance, page transitions, and supported browsers. If switching away from native controls, remove their startup calls and imports before removing the direct native dependency; sync an existing Capacitor project to update its plugin integration. Check any app-local Swift code that depended on the plugin too.

### Without Capacitor

Web-only applications install just the theme and their normal Ionic dependencies. `@capacitor/core` is an optional peer, including in the transitive Native UI package; the theme imports only its plugin-free `/integration` entry. No Capacitor installation, native sync, or `enableNativeUIShell()` call is needed.

When you are ready to add native iOS controls, follow [Add Native UI to your theme](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/add-native-ui.md).

### Page transitions

Use `iosTransitionAnimation` in your Ionic configuration to coordinate page transitions with optional native controls, including interactive back gestures and cancellation. No extra transition configuration is needed when using this builder. To keep a custom Ionic animation, wrap it with `withNativeUIShellTransition(builder)` from this package. Enable native controls separately with `enableNativeUIShell()`; configuring an animation does not enable them.

## Next step: Add Native UI

With your theme configured, you can optionally project supported controls into native iOS UI. Follow [Add Native UI to your theme](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/add-native-ui.md) to install and enable the plugin while keeping your existing styles and transitions.
