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

Pair the iOS 26 and iOS 27 themes so supported Safari versions can present the design of each generation: the iOS 26 look for iOS 26 users and the iOS 27 look for iOS 27 users. The [default setup](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/readme#get-started) uses browser feature checks to select the corresponding **styles**; it does not read the iOS version. When both packages are installed, keep the **page transition** on the iOS 27 animation. On even earlier iOS versions, Ionic's default iOS appearance remains when Safari supports neither feature. In a Capacitor iOS app, Native UI Shell's UIKit material follows the installed iOS version.

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

If compilation reports `Can't find stylesheet to import.` for a `meta.load-css()` call, make `node_modules` available to Sass. In Angular, add this under the app's build `options` in `angular.json`:

```json
"stylePreprocessorOptions": {
  "includePaths": ["node_modules"]
}
```

Alternatively, use a relative path from the Sass file containing `meta.load-css()` to the installed package, such as `../node_modules/@rdlabo/ionic-theme-ios27/src/styles/default-variables` from `src/styles.scss`. Adjust the `../` prefix for your file's location, and apply the same change to each theme import.

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

### Support iPhone Duo without the iOS 27 theme (experimental)

Keep your existing Ionic theme and move tabs and supported toolbar actions into a vertical side area. **Start in Chrome** with one stylesheet, an app class, and `enableVerticalControlArea()`; then connect the layout to iPhone Duo device events for the system rail and hinge posture.

Follow [iPhone Duo with your existing theme](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo-with-original-theme) for the browser preview and iOS setup. For shared layout rules and APIs, see [iPhone Duo support](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo). Available in `1.2.0-0` as an experimental feature; APIs and supported behavior may change.

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

Install all three themes to use iOS 27 on supported Safari versions, fall back to iOS 26 on the preceding Safari generation, and use MD3 whenever Ionic runs in Material Design mode. All three themes require `@ionic/core` 8.8.1 or later:

```bash
npm install @rdlabo/ionic-theme-ios26 @rdlabo/ionic-theme-ios27 @rdlabo/ionic-theme-md3
```

Keep the two iOS themes behind the same browser feature checks used by the default setup, then load MD3 unconditionally. Using `meta.load-css()` throughout also keeps the MD3 styles after the conditional iOS styles in the generated CSS:

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

For Ionic 9 Angular, import `isPlatform` and `provideIonicAngular` from `@ionic/angular`. React and Vue can pass the same returned options to `setupIonicReact` or `IonicVue`. If Sass cannot resolve a package in `meta.load-css()`, use the `stylePreprocessorOptions.includePaths` or relative-path setup described in Get started.

## Documentation

**Full documentation:** [Ionic Theme iOS27](https://docs.rdlabo.dev/projects/ionic-theme-ios27)

- [Using ion-item-group](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/using-ion-item-group) — required markup for inset lists.
- [Special markup and classes](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/special-markup) — opt-in markup and utility classes used by the theme.
- [ESLint](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/eslint) — check list structure with ESLint rules.
- [Features](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/features) — CSS variables, Liquid Glass, selective imports, and dark mode.
- [Native UI Shell (Experimental)](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/native-ui-shell) — project supported Ionic controls, text, and icons into UIKit.
- [iPhone Duo support (experimental)](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo) — vertical system rail, hinge posture, and split-pane layout; usable without the theme or the shell.
- [iPhone Duo with your existing theme (experimental)](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/iphone-duo-with-original-theme) — standalone setup that keeps your existing Web theme.
- [Animation](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/animation) — tab, segment, and searchable effects.
- [Migration from iOS 26](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/migration) — upgrade an existing app, including stylesheet, class, and CSS variable changes.
- [iOS 26 migration history](https://docs.rdlabo.dev/projects/ionic-theme-ios26/docs/migration) — earlier major-version changes for the previous package.

<!-- rdlabo-docs-omit -->

**iOS 26 theme:** See the [iOS 26 documentation](https://docs.rdlabo.dev/projects/ionic-theme-ios26).

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
