# Use iOS 26, iOS 27, and MD3 themes

Use this optional setup when you want browser capabilities to select iOS styles, or want MD3 in Material Design mode. For a single iOS 27 appearance, follow [theme setup](setup.md). These steps replace the stylesheet and animation configuration in that guide.

## 1. Install the themes

Install both themes in an existing Ionic 8 or 9 app (`@ionic/core` 8.8.1 or later):

```bash
npm install @rdlabo/ionic-theme-ios26 @rdlabo/ionic-theme-ios27
```

## 2. Load styles

In your global Sass stylesheet (for example, `src/styles.scss`), load the styles by browser capability:

```scss
@use 'sass:meta';

@supports (overflow-anchor: auto) {
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/default-variables');
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/ionic-theme-ios27');
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/ionic-theme-ios27-dark-class');
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/md-remove-ios-class-effect');
}

@supports (text-wrap: pretty) and (not (overflow-anchor: auto)) {
  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/default-variables');
  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/ionic-theme-ios26');
  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/ionic-theme-ios26-dark-class');
  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/md-remove-ios-class-effect');
}
```

If compilation reports `Can't find stylesheet to import.` for a `meta.load-css()` call, make `node_modules` available to Sass. In Angular, add this under the app's build `options` in `angular.json`:

```json
"stylePreprocessorOptions": {
  "includePaths": ["node_modules"]
}
```

Alternatively, use a relative path from the Sass file containing `meta.load-css()` to the installed package, such as `../node_modules/@rdlabo/ionic-theme-ios27/src/styles/default-variables` from `src/styles.scss`. Adjust the `../` prefix for your file's location, and apply the same change to each theme import.

### Which styles are selected?

The checks select browser capabilities, not iOS versions:

| Browser capability in Ionic `ios` mode               | Result                          |
| ---------------------------------------------------- | ------------------------------- |
| `overflow-anchor: auto`                              | iOS 27 theme.                   |
| `text-wrap: pretty`, without `overflow-anchor: auto` | iOS 26 theme.                   |
| Neither feature                                      | Ionic's default iOS appearance. |

The example uses class-based dark mode: also load [Ionic's matching dark palette](https://ionicframework.com/docs/theming/dark-mode). For system or always-dark mode, replace both `-dark-class` imports with the matching variant; see the [dark-mode pairs](setup.md#choose-one-dark-mode-pair). The `md-remove-ios-class-effect` styles prevent iOS-specific classes from affecting Material Design mode.

## 3. Configure animations

Keep the iOS 27 page transition and popover animations for both styled generations. Resolve these options before Ionic initializes. For Angular:

```ts
import { isPlatform, provideIonicAngular } from '@ionic/angular/standalone'; // Ionic 8
import { iosTransitionAnimation, popoverEnterAnimation, popoverLeaveAnimation } from '@rdlabo/ionic-theme-ios27';

function loadIOSAnimations() {
  if (typeof CSS === 'undefined') return {};
  if (!CSS.supports('overflow-anchor: auto') && !CSS.supports('text-wrap: pretty')) return {};

  return {
    navAnimation: iosTransitionAnimation,
    popoverEnter: popoverEnterAnimation,
    popoverLeave: popoverLeaveAnimation,
  };
}

provideIonicAngular(isPlatform('ios') ? loadIOSAnimations() : {});
```

For Ionic 9 Angular, import `isPlatform` and `provideIonicAngular` from `@ionic/angular`. React and Vue can pass the same options to `setupIonicReact` or `IonicVue` during initialization. In server-rendered apps, run the selection during browser initialization.

The page-transition radius defaults to `0`. Native apps can update it after measuring the WebView:

```ts
import { setConfig } from '@rdlabo/ionic-theme-ios27';

setConfig({ radius });
```

## 4. Check the theme

Test on iOS. When previewing on desktop, set Ionic mode to `ios` in your existing framework initialization config (for example `mode: 'ios'`).

Use this markup to preview the inset grouped list look. For the list structure the theme expects, see [Using ion-item-group](using-ion-item-group.md).

```html
<ion-list mode="ios" inset="true">
  <ion-item-group>
    <ion-item><ion-label>Notifications</ion-label></ion-item>
    <ion-item><ion-label>Appearance</ion-label></ion-item>
  </ion-item-group>
</ion-list>
```

## Use with the MD3 theme

Install all three themes to use iOS 27 on supported Safari versions, fall back to iOS 26 on the preceding Safari generation, and use MD3 whenever Ionic runs in Material Design mode. All three themes require `@ionic/core` 8.8.1 or later:

```bash
npm install @rdlabo/ionic-theme-ios26 @rdlabo/ionic-theme-ios27 @rdlabo/ionic-theme-md3
```

Keep the two iOS themes behind the same browser feature checks used in step 2 above, then load MD3 unconditionally. Using `meta.load-css()` throughout also keeps the MD3 styles after the conditional iOS styles in the generated CSS:

```scss
@use 'sass:meta';

@supports (overflow-anchor: auto) {
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/default-variables');
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/ionic-theme-ios27');
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/ionic-theme-ios27-dark-class');
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/md-remove-ios-class-effect');
}

@supports (text-wrap: pretty) and (not (overflow-anchor: auto)) {
  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/default-variables');
  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/ionic-theme-ios26');
  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/ionic-theme-ios26-dark-class');
  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/md-remove-ios-class-effect');
}

@include meta.load-css('@rdlabo/ionic-theme-md3/dist/css/default-variables.css');
@include meta.load-css('@rdlabo/ionic-theme-md3/dist/css/ionic-theme-md3.css');
```

The iOS styles apply only to Ionic's `ios` mode, while MD3 applies to `md` mode. The `md-remove-ios-class-effect` stylesheet in each iOS branch prevents iOS-only utility classes from leaking into MD mode. MD3 already includes its inset-list styles, so do not load either iOS package's optional `md-ion-list-inset` stylesheet in this configuration.

Load Ionic's matching dark palette too. The example uses class-based dark mode; for system or always-dark mode, select the matching variant for Ionic and both iOS themes.

Keep the iOS 27 transition for both iOS theme generations and select the MD3 transition in Material Design mode. Extend the animation setup above as follows:

```ts
import { isPlatform, provideIonicAngular } from '@ionic/angular/standalone'; // Ionic 8
import { iosTransitionAnimation, popoverEnterAnimation, popoverLeaveAnimation } from '@rdlabo/ionic-theme-ios27';
import { mdTransitionAnimation } from '@rdlabo/ionic-theme-md3';

function loadAnimations() {
  if (!isPlatform('ios')) return { navAnimation: mdTransitionAnimation };
  if (typeof CSS === 'undefined') return {};
  if (!CSS.supports('overflow-anchor: auto') && !CSS.supports('text-wrap: pretty')) return {};

  return {
    navAnimation: iosTransitionAnimation,
    popoverEnter: popoverEnterAnimation,
    popoverLeave: popoverLeaveAnimation,
  };
}

provideIonicAngular(loadAnimations());
```

For Ionic 9 Angular, import `isPlatform` and `provideIonicAngular` from `@ionic/angular`. React and Vue can pass the same returned options to `setupIonicReact` or `IonicVue`. If Sass cannot resolve a package in `meta.load-css()`, use the `stylePreprocessorOptions.includePaths` or relative-path setup described above.
