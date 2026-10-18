# Capacitor Native UI

Render supported Web controls with UIKit and SwiftUI on iOS while keeping your application state, routing, and handlers in the WebView. Use existing Ionic markup or explicit HTML buttons; custom SwiftUI content can be added through app-local extensions.

Native UI is opt-in and currently a preview. Browsers, Android, older iOS, and unsupported controls retain Web presentation. Keep your application's styles and layout; the iOS theme is optional.

## Choose what to build

| Goal | Start here |
| --- | --- |
| Render existing Ionic controls natively | [Ionic setup](docs/setup.md) |
| Use native buttons without Ionic | [HTML setup](docs/framework-independent.md) |
| Project only tabs and toolbar actions into a side rail | [Vertical Bars step by step](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo-with-original-theme.md) |
| Add native controls to an existing iOS 27 theme app | [Add Native UI to your theme](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/add-native-ui.md) |
| Render custom SwiftUI content | [App-local extensions](docs/native-ui-extensions.md) |

## Requirements

Native startup requires Capacitor 8 and an iOS project. Ordinary native rendering requires iOS 26+ and Xcode 26+. The Ionic adapter supports Ionic `>=8.8.1 <10`; the `/core` HTML adapter requires no Ionic or theme package. [Vertical Bars](docs/vertical-bars.md) and [extension placement](docs/native-ui-extensions.md#content-and-placement-are-independent) have additional device requirements.

Follow the setup guide for your markup before installing dependencies; the Ionic and HTML adapters use different imports.

## Reference and examples

- [Supported Ionic controls](docs/native-ui-shell.md#supported-markup) and fallback behavior.
- [Configuration](docs/configuration.md): defaults, selected controls, rail-only mode, and live changes.
- [Vertical Bars](docs/vertical-bars.md): eligibility, appearance, and runtime API.
- [Now Playing extension](docs/native-mini-player.md): a Web and SwiftUI example to adapt.
- [Migration](docs/migration.md): package names, imports, and native project updates.
