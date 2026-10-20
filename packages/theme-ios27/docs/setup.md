# Set up the iOS 27 theme

Give an existing Ionic app the iOS 27 appearance in four steps. This guide uses the iOS 27 theme on its own and system dark mode. For browser-dependent iOS 26/27 styling or MD3, use [adaptive themes](adaptive-themes.md) instead.

## Before you start

Use an existing Ionic Angular, React, or Vue application with Ionic `>=8.8.1 <10`. Keep Ionic's base CSS imports. Capacitor is not required, including for browser-only apps.

## 1. Install the theme

```sh
npm install @rdlabo/ionic-theme-ios27
```

## 2. Load the styles

Add these imports to your global stylesheet after Ionic's base styles. Replace an existing Ionic dark palette import rather than loading multiple palettes:

```css
@import '@ionic/core/css/palettes/dark.system.css';
@import '@rdlabo/ionic-theme-ios27/dist/css/default-variables.css';
@import '@rdlabo/ionic-theme-ios27/dist/css/ionic-theme-ios27.css';
@import '@rdlabo/ionic-theme-ios27/dist/css/md-remove-ios-class-effect.css';
@import '@rdlabo/ionic-theme-ios27/dist/css/ionic-theme-ios27-dark-system.css';
```

For a manual dark-mode toggle, use Ionic's `dark.class.css` and the theme's `ionic-theme-ios27-dark-class.css`, then toggle `ion-palette-dark` on the document root. For always-dark styling, use `dark.always.css` and `ionic-theme-ios27-dark-always.css`. Choose one matching pair.

## 3. Configure Ionic animations

Set these options in your existing Ionic initialization, before rendering the app:

```ts
import { iosTransitionAnimation, popoverEnterAnimation, popoverLeaveAnimation } from '@rdlabo/ionic-theme-ios27';

const ionicConfig = {
  mode: 'ios' as const,
  navAnimation: iosTransitionAnimation,
  popoverEnter: popoverEnterAnimation,
  popoverLeave: popoverLeaveAnimation,
};
```

This example deliberately uses `ios` mode so desktop browsers show the theme too. Pass `ionicConfig` to the initializer your app already uses:

| Framework | Apply the options |
| --- | --- |
| Angular / Ionic 8 | `provideIonicAngular(ionicConfig)` imported from `@ionic/angular/standalone` |
| Angular / Ionic 9 | `provideIonicAngular(ionicConfig)` imported from `@ionic/angular` |
| React | `setupIonicReact(ionicConfig)` imported from `@ionic/react` |
| Vue | `app.use(IonicVue, ionicConfig)` with `IonicVue` from `@ionic/vue` |

Merge with existing options; do not initialize Ionic twice. To retain Material Design mode on Android, keep your platform-based mode selection and apply these animation options only to the iOS configuration. See [adaptive themes](adaptive-themes.md) for a complete platform-aware example.

## 4. Preview your first screen

Start your application's usual development server and open an existing page. Add this markup inside its `ion-content` (use your framework's component syntax):

```html
<ion-list inset="true">
  <ion-item-group>
    <ion-item><ion-label>Notifications</ion-label></ion-item>
    <ion-item><ion-label>Appearance</ion-label></ion-item>
  </ion-item-group>
</ion-list>
```

You should see an inset group with rounded edges. Switch the system between light and dark appearance, then navigate between pages to see the theme transition. Read [Using ion-item-group](using-ion-item-group.md) for list structure.

| If you see… | Check… |
| --- | --- |
| Material Design controls on desktop | Set `mode: 'ios'` in the existing Ionic initializer. |
| Unstyled controls | Load the theme stylesheet globally after Ionic's base styles. |
| Mixed light and dark surfaces | Use one matching Ionic palette and theme dark-mode variant. |
| Default page transitions | Pass the animation options before Ionic initializes. |

## Next steps

- [Customize styles and components](features.md).
- [Add Native UI](add-native-ui.md) for supported controls in a Capacitor iOS app. Theme installation alone does not enable native controls.
- [Add Vertical Bars with an existing theme](iphone-duo-with-original-theme.md).
- [Migrate an existing app](migration.md).
