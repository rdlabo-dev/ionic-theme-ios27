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

### Migrate and verify

Existing theme entry imports and CSS/Sass paths stay unchanged after the package split. For an iOS 26 app, follow [From the iOS 26 theme](migration.md#from-the-ios-26-theme).

Build the app and check light/dark appearance, page transitions, and supported browsers. If switching away from native controls, remove their startup calls and imports before removing the direct native dependency; sync an existing Capacitor project to update its plugin integration. Check any app-local Swift code that depended on the plugin too.

