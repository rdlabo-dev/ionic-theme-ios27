# Demo Application

This is an Angular-based demo application for the Ionic iOS27 Theme Library.

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

```bash
npm install
```

### Development Server

```bash
npm start
# or
ionic serve
```

Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

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
