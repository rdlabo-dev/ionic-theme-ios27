# Capacitor Native UI

Render supported Web controls with UIKit and SwiftUI on iOS while keeping your application state, routing, and handlers in the WebView. Use existing Ionic markup or explicit HTML buttons; custom SwiftUI or Android Compose content can be added through experimental app-local extensions.

Native UI is opt-in and officially supported starting with 2.0.0. Standard controls on Android, browsers, older iOS, and unsupported controls retain Web presentation. Android supports experimental app-local Compose extensions. Keep your application's styles and layout; the iOS theme is optional.

## How projection works

A **projection** is another presentation of a Web control. Your application keeps the original DOM element, state and event handlers. The plugin reads supported labels, icons, selected/disabled state and geometry, then associates the rendered control with that source element. It does not convert the page into a native screen or run a second copy of your application.

| Web source                                      | Projected presentation                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Supported Ionic buttons, tabs and segments      | Native UIKit/SwiftUI controls on supported iOS                                            |
| Explicitly marked HTML buttons and back buttons | Native buttons on supported iOS                                                           |
| Eligible controls placed in Vertical Bars       | SwiftUI controls in the available system rail; Web rail presentation otherwise            |
| An app-local extension's DOM element            | The SwiftUI or Compose content registered by your app, using props read from that element |

The original element **stays in the DOM** while projected. Its bindings and handlers remain attached. Once native presentation is accepted, the runtime hides the source visually, prevents direct pointer interaction and hides it from Web accessibility so there are not two interactive copies. Element projection retains the source's layout box; rail spacing is supplied by your app or theme. A Web rail similarly uses its adapter's Web presentation: Ionic layout/clones or HTML proxy buttons in your `webHost`.

For example, tapping a projected Save button activates the original Web button. Its existing handler performs the save and updates application state; supported DOM changes then update the projection. Tabs and other controls likewise route actions through their source adapters. Continue updating the source, rather than managing separate native state. For reader values that change without a DOM mutation, use `markForCheck()`.

Projection changes presentation; it does not translate arbitrary HTML or CSS into native views. Native controls use supported data and styling; a custom Web appearance is not guaranteed to be reproduced. Removing or disabling a source prevents further valid actions. If projection is unavailable or stopped, the runtime releases its hiding state and the source returns to Web presentation, or to an available Web rail. Your application's own hidden/disabled state still applies.

## Choose what to build

| Goal                                                | Start here                                                                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Render existing Ionic controls natively             | [Ionic setup](docs/setup.md)                                                                                                        |
| Use native buttons without Ionic                    | [HTML setup](docs/framework-independent.md)                                                                                         |
| Add a side rail to Ionic while keeping your theme   | [Vertical Bars step by step](docs/ionic-vertical-bars.md)                                                                           |
| Add a side rail without Ionic                       | [HTML rail setup](docs/framework-independent.md)                                                                                    |
| Add native controls to an existing iOS 27 theme app | [Add Native UI to your theme](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/add-native-ui.md) |
| Render custom SwiftUI or Android Compose content    | [App-local extensions (experimental)](docs/native-ui-extensions.md)                                                                 |

## Install from npm

We use [Capacitor Foldable](https://github.com/erkamyaman/capacitor-foldable), an excellent community plugin by Erkam Yaman, as our standard device-layout integration. It exposes fold state, hinge geometry, bar placement and change events to your application, giving you control over how the layout responds. Foldable handles device reporting; the theme provides Web layout helpers and Native UI projects controls. Install it alongside the package you use, then connect its events in your app.

Install Native UI and Foldable together in your Capacitor application:

```sh
npm install @rdlabo/capacitor-native-ui @erkamyaman/capacitor-foldable
```

If you also use the iOS 27 theme, install or update both packages together:

```sh
npm install @rdlabo/capacitor-native-ui @rdlabo/ionic-theme-ios27 @erkamyaman/capacitor-foldable
```

The theme and Native UI share the same release version; Foldable is versioned independently. Declare Native UI as a direct dependency so Capacitor can discover the plugin. The setup commands install Foldable as a separate application dependency. Installing these packages does not activate native controls; application startup chooses projection and connects device layout.

Continue with [Ionic setup](docs/setup.md), [HTML setup](docs/framework-independent.md), or [extensions](docs/native-ui-extensions.md). After configuring startup, build your application's Web assets, run `npx cap sync` and rebuild the native app. No repository checkout or archive download is needed.

Upgrading from the native APIs bundled in theme 1.2.0 or 1.2.1? Follow the [migration guide](docs/migration.md) for import, configuration and native project changes.

## Requirements

Native startup requires Capacitor 8 and an iOS or Android project. Android extensions require API 24+ and Kotlin/Compose. Ordinary native rendering requires iOS 26+ and Xcode 26+. The Ionic adapter supports Ionic `>=8.8.1 <10`; the `/core` HTML adapter requires no Ionic or theme package. [Vertical Bars](docs/vertical-bars.md) and [extension placement](docs/native-ui-extensions.md#content-and-placement-are-independent) have additional device requirements.

For standard controls, follow the setup guide for your markup; the Ionic and HTML adapters use different imports. For custom native content, start directly with the [extensions guide](docs/native-ui-extensions.md).

## Reference

- [Supported Ionic controls](docs/native-ui.md#supported-markup) and fallback behavior.
- [Configuration](docs/configuration.md): defaults, selected controls, rail-only mode, and live changes.
- [Light and dark appearance](docs/appearance.md): inherit the Web theme, configure custom HTML, and understand shared rail appearance.
- [Vertical Bars](docs/vertical-bars.md): eligibility, appearance, and runtime API.
- [Migration](docs/migration.md): package names, imports, and native project updates.
