# Workspace development and migration

## Packages

| Directory                      | npm package                        | Responsibility                                                                            |
| ------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/theme-ios27`         | `@rdlabo/ionic-theme-ios27`        | Sass/CSS, Ionic Web behavior and page transitions                                         |
| `packages/capacitor-native-ui` | `@rdlabo/capacitor-native-ui` | Native UI Shell, Vertical Bars runtime, app-local extensions and the Capacitor iOS plugin |

The repository root is private. Native UI does not depend on the theme. The theme depends on Native UI for shared transition/search coordination; importing the ordinary theme entry does not load Capacitor. There is one native runtime and one Capacitor registration.

Native UI implements iOS presentation. Android and browsers retain Web presentation.

## Existing applications

See the [application migration guide](../packages/capacitor-native-ui/docs/migration.md#native-ui-package-separation) for choosing packages, replacing imports (including the intermediate `@ionic-theme` scope), syncing Capacitor, and verifying existing apps. Theme-only consumers keep the ordinary theme entry and stylesheet paths. Apps using native controls must declare `@rdlabo/capacitor-native-ui` directly.

## Local development

```sh
npm ci
npm run build
npm run test:esm
npm run test:packages
cd demo
npm ci
npm test -- --watch=false
npm run build -- --configuration=production
npx cap sync ios
```

Build Native UI before the theme; the root build command enforces this order. The demo uses both packages through local file dependencies. Its separate lockfile preserves the existing Ionic 8/9 CI matrix. Rebuild packages after editing runtime source before starting or rebuilding the demo.

`npm run docgen` updates API documentation in `packages/capacitor-native-ui/docs`. `npm run pack:packages` produces both installable archives. Native integration checks under `scripts/verify-native-*.sh` install both archives into a fresh consumer and exercise the SPM integration. The Swift package lives in `packages/capacitor-native-ui`; its scheme is `IonicThemeCapacitorNativeUi`.

## Releases

Both packages initially share the root version. Update root and workspace versions together, and keep the theme's native dependency as `file:../capacitor-native-ui`. Existing `ios27-v` tags release Native UI first, then the theme. `npm run pack:packages` stages the publishable files and replaces local dependencies with matching versions only in the archives; the working tree and lockfiles stay unchanged. Use this command instead of raw `npm pack` or workspace publication. Candidate artifacts contain both packages with matching candidate versions; publication validates both identities and the dependency before publishing either archive.

Publishing requires npm publishing access or trusted publishing configured for both packages.

## Contributor references

- [E2E screenshot testing](e2e-testing.md).
- [Native UI source and tests](native-development.md).
- [Ionic upstream design notes](ionic-upstream-notes.md).
