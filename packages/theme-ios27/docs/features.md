---
title: Features
---

# Features

Customize the theme with CSS variables and Sass mixins, or adopt it one component at a time. Markup-specific opt-ins are documented in [Special markup and classes](special-markup.md).

## CSS variables

To customize the library's default styles to match your design, several CSS variables are provided. See this file for details:
[Default variables](../src/styles/default-variables.scss)

| Variable                              | Default                                    | Purpose                                                           |
| ------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `--ios-theme-menu-background-rgb`     | Light: `225, 230, 240`; dark: `26, 31, 34` | Menu surface RGB channels; set on `ion-menu`.                     |
| `--ios-theme-menu-background-opacity` | `0.96`                                     | Menu surface opacity; set on `ion-menu`.                          |
| `--ios-theme-button-press-duration`   | `380ms`                                    | Duration of the button's `:active` scaling with slight overshoot. |

Use `--ios-theme-button-press-duration` instead of the shared activated-transition duration variables to customize button press scaling.

## Liquid Glass mixin

Import the SCSS files from the main package to use the liquid glass mixin.

```scss
@use '@rdlabo/ionic-theme-ios27/src/styles/utils/api.scss';

ion-textarea label.textarea-wrapper {
  @include api.glass-background;
}
```

## Native UI

Once your theme is working, [add Native UI](add-native-ui.md) to render supported fixed controls with UIKit and SwiftUI on iOS. Keep theme styles for Web content and fallback controls. Native UI is officially supported starting with 2.0.0 and remains opt-in; adding styles alone does not enable it.

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
