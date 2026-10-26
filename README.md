# Ionic Theme and Capacitor Native UI

Install from npm; see [Native UI installation](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/readme#install-from-npm) or [theme setup](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/setup). For 1.x, use the [v1.2.1 guide](https://github.com/rdlabo-dev/ionic-theme-ios27/tree/ios27-v1.2.1).
Bring the iOS look to your Ionic app, or add native controls to your Capacitor app while keeping Web content, routing, and application state.

**[Try the Ionic 9 demo](https://ionic-theme-ios27.rdlabo.dev/)**

<p>
  <img src="screenshots/ios27-settings.png" width="32%" alt="iOS 27 theme: Settings with Liquid Glass controls" />
  <img src="screenshots/ios27-settings-dark.png" width="32%" alt="iOS 27 theme: Settings in dark mode" />
  <img src="screenshots/ios27-library.png" width="32%" alt="iOS 27 theme: Library with styled buttons and tabs" />
</p>

## Give your Web UI the iOS look

**[@rdlabo/ionic-theme-ios27](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/readme)** brings Liquid Glass styling, light and dark appearances, and coordinated animations to Ionic toolbars, tabs, lists, buttons, search, and overlays. Use it on its own to style your Web UI.

[Get started with the theme](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/setup) · [Explore theme features](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/features)

## Bring supported controls into native UI

**[@rdlabo/capacitor-native-ui](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/readme)** projects supported Ionic controls into UIKit and SwiftUI on iOS. Your existing markup supplies their labels, icons, and state; native actions flow back to your Ionic components. Page content and routing stay in the WebView.

Keep your existing Web appearance or pair it with the iOS theme. Native UI is opt-in and officially supported starting with 2.0.0; unsupported controls and browsers retain Web presentation. On Android, standard controls stay on the Web; experimental app-local extensions can render with Jetpack Compose. Your app or theme owns Web layout and styling.

[How projection connects to your DOM](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/readme#how-projection-works) · [Ionic setup](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/setup) · [HTML setup](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/framework-independent) · [Supported controls](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/native-ui#supported-markup)

The same Library screen with Native UI off and on, captured while dragging the selected tab:

[![Web and native tab bars during the same drag, with enlarged glass details](screenshots/native-ui-drag/comparison.png)](screenshots/native-ui-drag/comparison.png)

## Native UI in 2.x

Native UI uses the shared Native UI Engine for prepared images beneath blocking Web overlays, native restoration after dismissal, and scroll tracking. Images are noninteractive; when no usable image is available, controls retain their existing Web fallback.

Keep Native UI and the optional theme on matching 2.x versions. After updating, build your Web application, run `npx cap sync`, and rebuild the native application. Follow the [Native UI setup guide](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/setup) for initialization. Native UI enables Ionic overlay support internally; applications do not need an additional Engine initializer.

## Choose what your app needs

| Your goal                                                        | Start here                                                                                                                          |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Style your Ionic Web UI                                          | [Set up the theme](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/setup)                                                   |
| Render Ionic controls natively with your existing Web appearance | [Set up Native UI](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/setup)                                                 |
| Use native buttons without Ionic                                 | [HTML setup](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/framework-independent)                                       |
| Add a vertical rail to Ionic while keeping your theme            | [Ionic rail setup](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/ionic-vertical-bars#try-it-in-your-existing-ionic-app) |
| Add a vertical rail without Ionic                                | [HTML rail setup](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/framework-independent)                                  |
| Add custom SwiftUI or Compose content                            | [App-local extensions (experimental)](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/native-ui-extensions)               |

Already using the iOS theme? [Add Native UI to your theme](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/add-native-ui) as your next step.

The declared Ionic compatibility range remains `>=8.8.1 <10`; automated E2E validation targets Ionic 9. Native UI requires Capacitor 8; see its setup guide for supported iOS environments.

## Explore further

- [Device layout and posture](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/vertical-bars-layout) · [Vertical Bars with an existing theme](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/ionic-vertical-bars).
- [Theme migration](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/migration) · [Native UI migration](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/migration).

Use standard native buttons without Ionic through the [plain HTML adapter](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/framework-independent), or keep Ionic markup and enable only [Vertical Bars](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/configuration). Both use the same native renderers.

## For plugin maintainers

[`@rdlabo/capacitor-native-ui-engine`](packages/capacitor-native-ui-engine/README.md) provides DOM/native placement, scroll tracking and prepared-image handoff. It is a library dependency for plugin maintainers, not a Capacitor plugin for applications. Native libraries support iOS and Android.

## Licenses

The theme and `@rdlabo/capacitor-native-ui` remain MIT. Only [`@rdlabo/capacitor-native-ui-engine`](packages/capacitor-native-ui-engine/LICENSE) uses Zlib; its [NOTICE](packages/capacitor-native-ui-engine/NOTICE) retains the upstream MIT notice for adapted portions. The repository-root MIT license does not replace the engine's package-specific license.

## Maintenance

The Engine, Native UI and theme use a shared release version. Before running `npm run release`, prepare the workspace versions, inter-package dependencies and lockfiles on `main`, and publish the matching Engine Maven artifact after that commit passes Engine CI. This applies to prereleases too: each npm version needs the matching Maven artifact.

Then release from a clean, up-to-date `main` with `npm run release`, selecting the same target version. Keep the root version at the previous release until this command bumps it and creates the `ios27-v…` tag. The tag workflow verifies Maven availability and publishes npm packages in order: Engine, Native UI, theme. Prereleases use the npm `next` dist-tag. See the [Engine publication instructions](packages/capacitor-native-ui-engine/README.md#maven-publication) and [workflows](.github/workflows).

A partially published versioned release requires a new shared version: npm versions cannot be overwritten, and this release workflow does not resume partial publication.
