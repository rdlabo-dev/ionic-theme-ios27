# Ionic Theme iOS27

> This branch documents the upcoming package split. For the current npm release, use the [v1.2.1 guide](https://github.com/rdlabo-dev/ionic-theme-ios27/tree/ios27-v1.2.1). To try this branch, use the [matching candidate archives](../capacitor-native-ui/README.md#try-the-unreleased-packages) instead of the registry install commands below.

A theme for Ionic apps that brings iOS 27 Liquid Glass and motion to the Web. Capacitor iOS apps can also opt into a preview Native UI for supported controls.

**[Ionic 9 demo](https://ionic-theme-ios27.rdlabo.dev/) · [Ionic 8 demo](https://ionic8-theme-ios27.rdlabo.dev/) · [Guides for this branch](docs/setup.md) · [Published v1.2.1 docs](https://docs.rdlabo.dev/projects/ionic-theme-ios27)**

<!-- rdlabo-docs-pick -->

<p>
  <img src="https://raw.githubusercontent.com/rdlabo-dev/ionic-theme-ios27/main/screenshots/ios27-settings.png" width="32%" alt="iOS 27 theme: Settings in light mode with a Liquid Glass search bar" />
  <img src="https://raw.githubusercontent.com/rdlabo-dev/ionic-theme-ios27/main/screenshots/ios27-settings-dark.png" width="32%" alt="iOS 27 theme: Settings in dark mode" />
  <img src="https://raw.githubusercontent.com/rdlabo-dev/ionic-theme-ios27/main/screenshots/ios27-library.png" width="32%" alt="iOS 27 theme: Library with Liquid Glass buttons and tab bar" />
</p>

<!-- /rdlabo-docs-pick -->

## What would you like to do?

| Goal | Guide |
| --- | --- |
| Style an existing Ionic app | [Get started](docs/setup.md) |
| Select iOS 26/27 styles and optionally use MD3 | [Adaptive themes](docs/adaptive-themes.md) |
| Add native iOS controls after setting up the theme | [Add Native UI](docs/add-native-ui.md) |
| Add a side rail while keeping another theme | [Vertical Bars step by step](docs/iphone-duo-with-original-theme.md) |
| Upgrade an existing installation | [Migration](docs/migration.md) |

## Get started

Use the [four-step setup guide](docs/setup.md) to install the theme, load styles, configure animations, and preview your first screen. It supports Ionic 8.8.1 or later within Ionic 8 or 9, including Angular, React, and Vue. Capacitor is not required.

The theme styles toolbars, tabs, lists, buttons, search, and overlays, with light and dark appearances. It does not activate native controls. Once the Web theme is working, you can optionally [add Native UI](docs/add-native-ui.md).

## Customize your app

- [Features](docs/features.md): CSS variables, Liquid Glass, and selective component imports.
- [Special markup and classes](docs/special-markup.md): opt-in component behavior.
- [Using ion-item-group](docs/using-ion-item-group.md): inset list markup.
- [Animation](docs/animation.md): tab, segment, and search effects.
- [ESLint](docs/eslint.md): catch unsupported list structure.
- [Vertical Bars layout](docs/vertical-bars-layout.md): spacing, RTL, and layout helpers.
- [iPhone Duo device layout](docs/iphone-duo.md): connect device placement and hinge posture.
