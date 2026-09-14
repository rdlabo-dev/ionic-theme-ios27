---
title: Features
---

# Features

Customize the theme with CSS variables and Sass mixins, or adopt it one component at a time. Markup-specific opt-ins are documented in [Special markup and classes](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/special-markup).

## CSS variables

To customize the library's default styles to match your design, several CSS variables are provided. See this file for details:
[Default variables](../src/styles/default-variables.scss)

For menus, `--ios-theme-menu-background-rgb` sets the surface RGB channels (light: `225, 230, 240`; dark: `26, 31, 34`). `--ios-theme-menu-background-opacity` controls opacity and defaults to `0.96`. Both are public customization variables and can be set on `ion-menu`.

## Liquid Glass mixin

Import the SCSS files from the main package to use the liquid glass mixin.

```scss
@use '@rdlabo/ionic-theme-ios27/src/styles/utils/api.scss';

ion-textarea label.textarea-wrapper {
  @include api.glass-background;
}
```

## Native UI Shell (Experimental)

Capacitor iOS apps can use the optional, experimental [Native UI Shell](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/native-ui-shell) to render supported fixed Ionic controls with UIKit and system Liquid Glass. Content and application logic stay in the WebView, with Ionic owning routing and page transitions. The guide explains the hybrid approach's origins in Basecamp and Capacitor, setup, supported controls and Web fallback behavior.

## Selective component imports

For gradual adoption, you can import individual components instead of the full theme file.

```css
@import '@rdlabo/ionic-theme-ios27/dist/css/utils/translucent';
@import '@rdlabo/ionic-theme-ios27/dist/css/components/ion-action-sheet';
@import '@rdlabo/ionic-theme-ios27/dist/css/components/ion-alert';
@import '@rdlabo/ionic-theme-ios27/dist/css/components/ion-button';
/* Import the remaining components your application uses. */
```

### Dark mode with individual components

Use SCSS when selectively importing components with dark mode support because the selectors differ between Always, System, and Class modes.

Always:

```scss
@use '@rdlabo/ionic-theme-ios27/src/styles/utils/theme-dark';

:root {
  @include theme-dark.default-variables;
}
@include theme-dark.ion-list;
@include theme-dark.ion-button;
@include theme-dark.ion-fab;
@include theme-dark.ion-tabs;
@include theme-dark.ion-segment;
```

System:

```scss
@use '@rdlabo/ionic-theme-ios27/src/styles/utils/theme-dark';

@media (prefers-color-scheme: dark) {
  :root {
    @include theme-dark.default-variables;
  }
  @include theme-dark.ion-list;
  @include theme-dark.ion-button;
  @include theme-dark.ion-fab;
  @include theme-dark.ion-tabs;
  @include theme-dark.ion-segment;
}
```

Class:

```scss
@use '@rdlabo/ionic-theme-ios27/src/styles/utils/theme-dark';

.ion-palette-dark {
  @include theme-dark.default-variables;
  @include theme-dark.ion-list;
  @include theme-dark.ion-button;
  @include theme-dark.ion-fab;
  @include theme-dark.ion-tabs;
  @include theme-dark.ion-segment;
}
```

## Interactive examples

[Browse rendered examples in the demo](https://ionic-theme-ios27.rdlabo.dev/main/docs).
