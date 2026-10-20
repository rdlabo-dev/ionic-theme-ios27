# Capacitor Native UI

> **Unreleased package:** the first npm release of `@rdlabo/capacitor-native-ui` is pending. The registry install commands in these guides apply after that release. To try the current code now, install a candidate archive as described below.

Render supported Web controls with UIKit and SwiftUI on iOS while keeping your application state, routing, and handlers in the WebView. Use existing Ionic markup or explicit HTML buttons; custom SwiftUI or Android Compose content can be added through experimental app-local extensions.

Native UI is opt-in and currently a preview. Standard controls on Android, browsers, older iOS, and unsupported controls retain Web presentation. Android supports experimental app-local Compose extensions. Keep your application's styles and layout; the iOS theme is optional.

## Choose what to build

| Goal | Start here |
| --- | --- |
| Render existing Ionic controls natively | [Ionic setup](docs/setup.md) |
| Use native buttons without Ionic | [HTML setup](docs/framework-independent.md) |
| Project only tabs and toolbar actions into a side rail | [Vertical Bars step by step](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo-with-original-theme.md) |
| Add native controls to an existing iOS 27 theme app | [Add Native UI to your theme](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/add-native-ui.md) |
| Render custom SwiftUI or Android Compose content | [App-local extensions (experimental)](docs/native-ui-extensions.md) |

## Try the unreleased packages

1. Open a successful [Package Candidate run](https://github.com/rdlabo-dev/ionic-theme-ios27/actions/workflows/package-candidate.yml) for the commit you want to try. Use the documentation from that same commit. Download and extract its `npm-candidate-…` artifact; GitHub requires sign-in to download artifacts.
2. Choose the packages for your goal. Replace `VERSION` and the paths with the downloaded filenames:

   **Native UI only** — in your Capacitor 8 app:

   ```sh
   npm install /path/to/rdlabo-capacitor-native-ui-VERSION.tgz
   ```

   **Theme only, or theme with Native UI** — install both archives from the same artifact so their versions match:

   ```sh
   npm install /path/to/rdlabo-capacitor-native-ui-VERSION.tgz /path/to/rdlabo-ionic-theme-ios27-VERSION.tgz
   ```

   The theme depends on the Native UI package, so its unpublished dependency must also be supplied as an archive. **Theme-only browser apps do not need Capacitor, shell activation, or native sync.** Continue with [theme setup](../theme-ios27/docs/setup.md).

3. For Native UI, continue with the guide for your goal above. Build your Web assets, sync Capacitor and rebuild the native app as described there. The archive install replaces each guide's `npm install` step.

Already using published theme v1.2.1? Its bundled native APIs belong to the old setup. Follow [migration](docs/migration.md) when adopting these candidate packages. The [published documentation](https://docs.rdlabo.dev/projects/ionic-theme-ios27) describes that released version; this directory describes the upcoming split.

## Requirements

Native startup requires Capacitor 8 and an iOS or Android project. Android extensions require API 24+ and Kotlin/Compose. Ordinary native rendering requires iOS 26+ and Xcode 26+. The Ionic adapter supports Ionic `>=8.8.1 <10`; the `/core` HTML adapter requires no Ionic or theme package. [Vertical Bars](docs/vertical-bars.md) and [extension placement](docs/native-ui-extensions.md#content-and-placement-are-independent) have additional device requirements.

For standard controls, follow the setup guide for your markup; the Ionic and HTML adapters use different imports. For custom native content, start directly with the [extensions guide](docs/native-ui-extensions.md).

## Reference and examples

- [Supported Ionic controls](docs/native-ui-shell.md#supported-markup) and fallback behavior.
- [Configuration](docs/configuration.md): defaults, selected controls, rail-only mode, and live changes.
- [Vertical Bars](docs/vertical-bars.md): eligibility, appearance, and runtime API.
- [Now Playing extension](docs/native-mini-player.md): a Web and SwiftUI example to adapt.
- [Migration](docs/migration.md): package names, imports, and native project updates.
