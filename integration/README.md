# Integration

- [Ionic Theme iOS27](../packages/theme-ios27/README.md) supplies Web styling, layout, and animations.
- [Capacitor Native UI](../packages/capacitor-native-ui/README.md) supplies native presentation and control synchronization. The application or its theme owns Web layout.

Use either independently. To use both, follow [Theme and Native UI integration](docs/setup.md). Package-specific APIs and migrations live in each package's docs.

## Guides

- [iPhone Duo layout and device integration](docs/iphone-duo.md)
- [Vertical Bars with an existing theme](docs/iphone-duo-with-original-theme.md)
- [Workspace development and releases](docs/monorepo.md)
- [E2E screenshot testing](docs/e2e-testing.md)

## Local integration apps

These are independent, git-ignored checkouts for local validation and recording.

- `ionic-conference-app/`: existing Ionic Conference App checkout.
- `capacitor-angular-starter-guide-demo/`: Capawesome Trip Expenses, adapted for
  offline recording on Desktop Xcode 27.1's iPhone Duo simulator. Uses **Vertical
  Control Area only** and retains the original theme. See its `README-DUO.md`
  for launch commands and browser previews.

- [Plain HTML Native UI](native-ui-html/README.md): use standard native buttons and an optional rail without Ionic or theme CSS.
