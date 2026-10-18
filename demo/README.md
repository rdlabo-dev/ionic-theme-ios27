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
