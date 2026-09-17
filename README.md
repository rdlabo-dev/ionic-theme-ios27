# Ionic Theme iOS27

A theme for Ionic apps that brings iOS 27 Liquid Glass and motion to the Web. Capacitor iOS apps can also opt into an experimental Native UI Shell for supported controls.

**[Ionic 9 demo](https://ionic-theme-ios27.rdlabo.dev/) · [Ionic 8 demo](https://ionic8-theme-ios27.rdlabo.dev/) · [Documentation](https://docs.rdlabo.dev/projects/ionic-theme-ios27)**

<!-- rdlabo-docs-pick -->

<p>
  <img src="./screenshots/ios27-settings.png" width="32%" alt="iOS 27 theme: Settings in light mode with a Liquid Glass search bar" />
  <img src="./screenshots/ios27-settings-dark.png" width="32%" alt="iOS 27 theme: Settings in dark mode" />
  <img src="./screenshots/ios27-library.png" width="32%" alt="iOS 27 theme: Library with Liquid Glass buttons and tab bar" />
</p>

<!-- /rdlabo-docs-pick -->

## Features

### Bring the iOS 27 look to Ionic

Give familiar Ionic screens the iOS 27 visual language: Liquid Glass, styled toolbars and tabs, lists, buttons, search, overlays, page transitions, and coordinated light and dark appearances. See the result in the [Ionic 9 demo](https://ionic-theme-ios27.rdlabo.dev/) and [Ionic 8 demo](https://ionic8-theme-ios27.rdlabo.dev/).

### Project your Ionic UI into Native UI

On Capacitor iOS, the optional, experimental [Native UI Shell](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/native-ui-shell) reads supported fixed controls from your existing Ionic markup. It projects their text, resolved `ion-icon` artwork or supported static SVGs, and selection state into UIKit controls with system Liquid Glass. Changes and native actions flow through the original Ionic components, so the Web and native presentations share one UI definition. Page content and routing stay in the WebView; unsupported layouts keep their Web presentation.

**Tab drag on iOS 27:** The same Library screen with Native UI Shell off (Web) and on (UIKit). Both frames were captured while dragging the selected tab; the lower panels enlarge the glass around the tab bar.

[![Native UI Shell off and on during the same Library tab drag, with enlarged tab bars](./screenshots/native-ui-shell-drag/comparison.png)](./screenshots/native-ui-shell-drag/comparison.png)

### Follow the user's device

Pair the iOS 26 and iOS 27 themes so supported Safari versions can present the design of each generation: the iOS 26 look for iOS 26 users and the iOS 27 look for iOS 27 users. The [default setup](#get-started) uses browser feature checks to select the corresponding **styles**; it does not read the iOS version. When both packages are installed, keep the **page transition** on the iOS 27 animation. On even earlier iOS versions, Ionic's default iOS appearance remains when Safari supports neither feature. In a Capacitor iOS app, Native UI Shell's UIKit material follows the installed iOS version.

## Get started

Install both themes in an existing Ionic 8 or 9 app (`@ionic/core` 8.8.1 or later):

```bash
npm install @rdlabo/ionic-theme-ios26 @rdlabo/ionic-theme-ios27
```

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

These checks select styles by browser features, not by iOS version. Browsers without either feature retain Ionic's default iOS appearance. The example uses class-based dark mode: also load [Ionic's matching dark palette](https://ionicframework.com/docs/theming/dark-mode). For system or always-dark mode, replace both `-dark-class` imports with the matching variant. The `md-remove-ios-class-effect` styles prevent iOS-specific classes from affecting Material Design mode.

### Configure animations

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

### Check the theme

Test on iOS. When previewing on desktop, set Ionic mode to `ios` in your existing framework initialization config (for example `mode: 'ios'`).

Use this markup to preview the inset grouped list look. For the list structure the theme expects, see [Using ion-item-group](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/using-ion-item-group).

```html
<ion-list mode="ios" inset="true">
  <ion-item-group>
    <ion-item><ion-label>Notifications</ion-label></ion-item>
    <ion-item><ion-label>Appearance</ion-label></ion-item>
  </ion-item-group>
</ion-list>
```

## Optional setups

### Use only the iOS 27 theme

Install only `@rdlabo/ionic-theme-ios27` and import its styles unconditionally in your global stylesheet:

```css
@import '@rdlabo/ionic-theme-ios27/dist/css/default-variables.css';
@import '@rdlabo/ionic-theme-ios27/dist/css/ionic-theme-ios27.css';
@import '@rdlabo/ionic-theme-ios27/dist/css/md-remove-ios-class-effect.css';
@import '@rdlabo/ionic-theme-ios27/dist/css/ionic-theme-ios27-dark-class.css';
```

The last import uses class-based dark mode; choose the `-dark-system` or `-dark-always` variant and matching Ionic palette for another mode. Configure the iOS 27 animations with `isPlatform('ios')` as above, without the browser feature checks.

### Other options

- **Native controls:** Follow the [Native UI Shell setup guide](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/native-ui-shell). Stylesheet imports alone do not enable it.
- **Inset lists on Android:** Load the matching package's `md-ion-list-inset` stylesheet inside each `@supports` branch if needed. It is already included in `@rdlabo/ionic-theme-md3`.

### Use with the MD3 theme

For the iOS 27-only setup above, install `@rdlabo/ionic-theme-md3` to style both Ionic modes. Both themes require `@ionic/core` 8.8.1 or later. In a global Sass stylesheet, load the iOS 27 styles before MD3:

```scss
@use '@rdlabo/ionic-theme-ios27/src/styles/default-variables.scss' as ios27-vars;
@use '@rdlabo/ionic-theme-ios27/src/styles/ionic-theme-ios27.scss';
@use '@rdlabo/ionic-theme-ios27/src/styles/ionic-theme-ios27-dark-class.scss';
@use '@rdlabo/ionic-theme-ios27/src/styles/md-remove-ios-class-effect.scss';
@use '@rdlabo/ionic-theme-md3/dist/css/default-variables.css' as md3-vars;
@use '@rdlabo/ionic-theme-md3/dist/css/ionic-theme-md3.css';
```

Load Ionic's matching dark palette too. To use MD3's page transition in Material Design mode, set `navAnimation` to `isPlatform('ios') ? iosTransitionAnimation : mdTransitionAnimation`, importing the latter from `@rdlabo/ionic-theme-md3`.

## Documentation

**Full documentation:** [Ionic Theme iOS27](https://docs.rdlabo.dev/projects/ionic-theme-ios27)

- [Using ion-item-group](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/using-ion-item-group) — required markup for inset lists.
- [Special markup and classes](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/special-markup) — opt-in markup and utility classes used by the theme.
- [ESLint](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/eslint) — check list structure with ESLint rules.
- [Features](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/features) — CSS variables, Liquid Glass, selective imports, and dark mode.
- [Native UI Shell (Experimental)](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/native-ui-shell) — project supported Ionic controls, text, and icons into UIKit.
- [Animation](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/experimental-animation) — tab, segment, and searchable effects.
- [Migration from iOS 26](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/migration) — upgrade an existing app, including stylesheet, class, and CSS variable changes.
- [iOS 26 migration history](https://docs.rdlabo.dev/projects/ionic-theme-ios26/docs/migration) — earlier major-version changes for the previous package.

<!-- rdlabo-docs-omit -->

**iOS 26 theme:** See the [`ios26` branch](https://github.com/rdlabo-dev/ionic-theme-ios27/tree/ios26) and [iOS 26 documentation](https://docs.rdlabo.dev/projects/ionic-theme-ios26).

## Development & Testing

### Demo Application

The same demo is deployed against both supported Ionic versions:

- [Ionic 9 demo](https://ionic-theme-ios27.rdlabo.dev) — canonical
- [Ionic 8 demo](https://ionic8-theme-ios27.rdlabo.dev) — compatibility

The `demo/` directory contains the Angular application used by both deployments. To run it locally:

```bash
cd demo
npm install
npm start
```

### Visual Regression Testing

Playwright compares screenshots of demo routes in light and dark modes against stored baselines to catch unintended visual changes. These regression tests do not measure similarity to iOS 27 reference screens.

#### Running Tests

```bash
cd demo

# Run all E2E tests
npm run test:e2e

# Run tests in UI mode (interactive)
npm run test:e2e:ui

# Debug tests
npm run test:e2e:debug

# Update baseline screenshots (when intentionally changing UI)
npm run test:e2e:update
```

### Releases

Stable `ios27-vX.Y.Z` tags publish to npm `latest` through the [release workflow](./.github/workflows/release.yml). Maintainers create release tags with `npm run release`. Pull request and merge candidates use the npm `beta` tag; prerelease tags use `next`.

<!-- /rdlabo-docs-omit -->

<!-- rdlabo-docs-omit -->

## Maintainers

- [rdlabo](https://rdlabo.dev/)
<!-- /rdlabo-docs-omit -->
