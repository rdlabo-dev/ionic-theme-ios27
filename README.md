# Ionic Theme and Capacitor Native UI

Bring the iOS look and native controls to your Ionic app—while keeping your Web content, routing, and application state.

**[Try the Ionic 9 demo](https://ionic-theme-ios27.rdlabo.dev/) · [Try the Ionic 8 demo](https://ionic8-theme-ios27.rdlabo.dev/)**

<p>
  <img src="screenshots/ios27-settings.png" width="32%" alt="iOS 27 theme: Settings with Liquid Glass controls" />
  <img src="screenshots/ios27-settings-dark.png" width="32%" alt="iOS 27 theme: Settings in dark mode" />
  <img src="screenshots/ios27-library.png" width="32%" alt="iOS 27 theme: Library with styled buttons and tabs" />
</p>

## Give your Web UI the iOS look

**[@rdlabo/ionic-theme-ios27](packages/theme-ios27/README.md)** brings Liquid Glass styling, light and dark appearances, and coordinated animations to Ionic toolbars, tabs, lists, buttons, search, and overlays. Use it on its own to style your Web UI.

[Get started with the theme](packages/theme-ios27/docs/setup.md) · [Explore theme features](packages/theme-ios27/docs/features.md)

## Bring supported controls into native UI

**[@rdlabo/capacitor-native-ui](packages/capacitor-native-ui/README.md)** projects supported Ionic controls into UIKit and SwiftUI on iOS. Your existing markup supplies their labels, icons, and state; native actions flow back to your Ionic components. Page content and routing stay in the WebView.

Keep your existing Web appearance or pair it with the iOS theme. Native UI is opt-in and currently a preview; unsupported controls, Android, and browsers retain Web presentation. Your app or theme owns Web layout and styling.

[Get started with Native UI](packages/capacitor-native-ui/docs/setup.md) · [Supported controls](packages/capacitor-native-ui/docs/native-ui-shell.md#supported-markup)

The same Library screen with Native UI Shell off and on, captured while dragging the selected tab:

[![Web and native tab bars during the same drag, with enlarged glass details](screenshots/native-ui-shell-drag/comparison.png)](screenshots/native-ui-shell-drag/comparison.png)

## Choose what your app needs

| Your goal | Start here |
| --- | --- |
| Style your Ionic Web UI | [Theme only](packages/theme-ios27/docs/setup.md) |
| Add native controls while keeping your existing Web appearance | [Native UI only](packages/capacitor-native-ui/docs/setup.md) |
| Combine theme styling with native controls | [Theme and Native UI together](integration/docs/setup.md) |

Both packages support Ionic 8.8.1 or later within Ionic 8 or 9. Native UI requires Capacitor 8; see its setup guide for supported iOS environments.

## Explore further

- [Integration guides](integration/README.md): combine packages and connect layouts and device behavior.
- [Theme migration](packages/theme-ios27/docs/migration.md) · [Native UI migration](packages/capacitor-native-ui/docs/migration.md).
- [Workspace development and releases](integration/docs/monorepo.md).
