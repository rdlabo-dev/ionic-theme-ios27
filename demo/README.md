# Demo Application

This is an Angular-based demo application for the Ionic iOS27 Theme Library.

## Getting Started

### Prerequisites

- Node.js 24
- npm or yarn

### Installation

```bash
# From the repository root
npm ci
npm run build
cd demo
npm ci
```

### iPhone Duo device state

The demo depends on [`@erkamyaman/capacitor-foldable`](https://github.com/erkamyaman/capacitor-foldable) for bar placement and fold state. `npm install` installs it; after building, run `npx cap sync ios` to register it in the iOS app. For your own app:

```bash
npm install @erkamyaman/capacitor-foldable
npx cap sync
```

Use Capacitor 8.5+ and Xcode 27.1+ for iPhone Duo on iOS 27.1+. The Vertical Bars toggle still allows a browser preview when no native edge is reported.

### Development Server

```bash
npm start
# or
ionic serve
```

Navigate to `http://localhost:4200/`. The application reloads when demo source changes. Rebuild the workspace packages from the repository root after changing theme or native runtime source.

## Testing

### Unit Tests (Vitest + jsdom)

```bash
npm test
```

### Browser Contract and Screenshot Tests (Playwright)

Playwright verifies the theme against hydrated Ionic components, including visual regression, CSS variables, gestures, animations and native-shell integration. Browser-free state and Sass contract tests run in Vitest instead.

#### Run E2E tests

```bash
npm run test:e2e
```

Pull requests run the full browser contract suite with Ionic 9 and the visual suite with Ionic 8. Pushes to `main` run the full suite against both supported Ionic majors.

#### Run visual regression tests only

```bash
npm run test:e2e:visual
```

#### Run E2E tests in UI mode (interactive)

```bash
npm run test:e2e:ui
```

#### Debug E2E tests

```bash
npm run test:e2e:debug
```

#### Update baseline screenshots

When you intentionally change the UI and want to update the baseline screenshots, this command runs only the visual suite:

```bash
npm run test:e2e:update
```

### Test Coverage

The screenshot tests cover:

- All routes in light mode
- All routes in dark mode (`ion-palette-dark` class)
- Full page screenshots for visual regression testing

Test reports are generated in `playwright-report/` directory.

## Project Structure

```
demo/
├── e2e/                      # Browser contract and screenshot tests
│   └── screenshot.spec.ts    # Visual tests for all routes
├── src/
│   ├── *.spec.ts             # Browser-free Vitest contracts
│   ├── app/
│   │   └── index/            # Main index routes
│   │       ├── pages/        # All page components
│   │       └── index.routes.ts
│   ├── theme/
│   │   └── variables.scss    # Demo variables
│   └── global.scss           # Imports the iOS 27 theme
├── playwright.config.ts       # Playwright configuration
└── package.json
```

## Building

```bash
npm run build
```

The build artifacts will be stored in the `www/` directory.

## Capacitor

### iOS

```bash
npm run cap
npx cap open ios
```

## Further Help

To get more help on the Angular CLI use `ng help` or check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

For Ionic Framework, visit [Ionic Documentation](https://ionicframework.com/docs).

For Playwright, visit [Playwright Documentation](https://playwright.dev/).

## Button projection

Open `/main/index/button-projection` after enabling iPhone Duo Mode on the index page.
The page compares omitted, clear, solid, and outline fills, custom CSS backgrounds,
disabled controls, and grouped versus individual projection. Tabs are hidden on this
page to leave room for the four buttons. Tap a projected button
to check the last-action label.

Native appearance comparisons require an iOS build on a supported simulator or device.
The browser uses Web clones: use it to check layout and actions, not `system` versus
`source` appearance.

Choose the styling to build (run these commands from `demo`):

| Styling | Browser preview | Build before `npx cap sync ios` | Source default fill |
| --- | --- | --- | --- |
| iOS theme | `npm start` | `npm run build -- --configuration=production` | `null` (glass) |
| Stock Ionic, with only `vertical-bars.css` | `npm start -- --configuration=ionic-default` | `npm run build -- --configuration=production,ionic-default` | `solid` (set automatically) |

Build, sync and run the iOS app. Both configurations default to `system` projection.
To compare appearances:

1. Open `/main/index?verticalBarsOnly`, enable iPhone Duo Mode, and select **button-projection**.
2. Restart at `/main/index?verticalBarsOnly&buttonProjection=source` and open the same page.
3. Compare fills, disabled controls and grouped buttons. Enabled actions update the last-action label; disabled actions must not.

The startup query applies for the runtime's lifetime. Leave `buttonDefaultFill` out
of the query to use the chosen configuration's default shown above. For local
exceptions and fill rules, see [Choose button appearance](../packages/capacitor-native-ui/docs/vertical-bars.md#choose-button-appearance).
