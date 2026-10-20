# Ionic Theme iOS27

Install with `npm install @rdlabo/ionic-theme-ios27 @erkamyaman/capacitor-foldable`. For 1.x, use the [v1.2.1 guide](https://github.com/rdlabo-dev/ionic-theme-ios27/tree/ios27-v1.2.1).
A theme for Ionic apps that brings iOS 27 Liquid Glass and motion to the Web. Capacitor iOS apps can also opt into a preview Native UI for supported controls.

**[Ionic 9 demo](https://ionic-theme-ios27.rdlabo.dev/) · [Ionic 8 demo](https://ionic8-theme-ios27.rdlabo.dev/) · [Setup guide](docs/setup.md)**

<!-- rdlabo-docs-pick -->

<p>
  <img src="https://raw.githubusercontent.com/rdlabo-dev/ionic-theme-ios27/main/screenshots/ios27-settings.png" width="32%" alt="iOS 27 theme: Settings in light mode with a Liquid Glass search bar" />
  <img src="https://raw.githubusercontent.com/rdlabo-dev/ionic-theme-ios27/main/screenshots/ios27-settings-dark.png" width="32%" alt="iOS 27 theme: Settings in dark mode" />
  <img src="https://raw.githubusercontent.com/rdlabo-dev/ionic-theme-ios27/main/screenshots/ios27-library.png" width="32%" alt="iOS 27 theme: Library with Liquid Glass buttons and tab bar" />
</p>

<!-- /rdlabo-docs-pick -->

## What would you like to do?

| Goal                                                  | Guide                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Style an existing Ionic app                           | [Get started](docs/setup.md)                                                     |
| Select iOS 26/27 styles and optionally use MD3        | [Adaptive themes](docs/adaptive-themes.md)                                       |
| Add native iOS controls after setting up the theme    | [Add Native UI](docs/add-native-ui.md)                                           |
| Add a side rail to Ionic while keeping your own theme | [Vertical Bars step by step](../capacitor-native-ui/docs/ionic-vertical-bars.md) |
| Upgrade an existing installation                      | [Migration](docs/migration.md)                                                   |

## Get started

We use [Capacitor Foldable](https://github.com/erkamyaman/capacitor-foldable), an excellent community plugin by Erkam Yaman, as our standard device-layout integration. It exposes fold state, hinge geometry, bar placement and change events to your application, giving you control over how the layout responds. Foldable handles device reporting; the theme provides Web layout helpers and Native UI projects controls. Install it alongside the package you use, then connect its events in your app.

Use the [four-step setup guide](docs/setup.md) to install the theme, load styles, configure animations, and preview your first screen. It supports Ionic 8.8.1 or later within Ionic 8 or 9, including Angular, React, and Vue. A native Capacitor project is not required for browser use.

The theme styles toolbars, tabs, lists, buttons, search, and overlays, with light and dark appearances. It does not activate native controls. Once the Web theme is working, you can optionally [add Native UI](docs/add-native-ui.md).

## Customize your app

- [Features](docs/features.md): CSS variables, Liquid Glass, and selective component imports.
- [Special markup and classes](docs/special-markup.md): opt-in component behavior.
- [Using ion-item-group](docs/using-ion-item-group.md): inset list markup.
- [Animation](docs/animation.md): tab, segment, and search effects.
- [ESLint](docs/eslint.md): catch unsupported list structure.
- [Vertical Bars layout](docs/vertical-bars-layout.md): spacing, RTL, device placement, posture, and split panes.
