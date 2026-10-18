# Native UI without Ionic

> This guide targets the upcoming package split. Until the first native package release, use the [candidate archive installation](../README.md#try-the-unreleased-packages) in place of registry install commands.

Add native buttons to an existing Web app without Ionic or theme CSS. Keep labels, state, and click handlers on ordinary HTML elements. Standard buttons require no custom Swift registration.

Use a Capacitor 8 app with an iOS project, Xcode 26+, and an iOS 26+ device or simulator. Browsers and Android retain Web controls. For custom Android native content, use [Kotlin/Compose extensions](native-ui-extensions.md#2b-register-compose-content-on-android).

## 1. Install the plugin

Keep your existing Capacitor 8 installation and add the plugin directly:

```sh
npm install @rdlabo/capacitor-native-ui
```

The `/core` entry requires `@capacitor/core` but no Ionic dependencies. If this is currently a browser-only application, configure its Capacitor 8 iOS project before running native controls.

## 2. Mark source controls

```html
<main id="app">
  <button type="button" data-native-ui="button" data-native-ui-placement="element">Add</button>
  <button type="button" data-native-ui="back-button" data-native-ui-placement="rail">Back</button>
</main>
<aside id="rail" aria-label="Navigation"></aside>
```

- `data-native-ui="button"` opts into a standard action button.
- `data-native-ui="back-button"` opts into a standard back button. Its original click handler owns navigation; the plugin never calls `history.back()`.
- `data-native-ui-placement="rail"` requests Vertical Bars. Without it, the source rectangle is used. `element` explicitly preserves that rectangle.
- Sources must be `<button>`, explicitly marked `ion-button`, or custom elements exposing `role="button"` and click behavior. Unmarked HTML is never inferred to be a control.

Keep the accessible name, supported static SVG, disabled state and application handlers on the source. Names resolve from `aria-labelledby`, `aria-label`, then text. Native `disabled`, a disabled fieldset and `aria-disabled="true"` are respected. Hidden, removed, excluded or out-of-scope sources are retired and stale actions are rejected. Use `data-shell="disabled"` to exclude a subtree.

Native and Web-proxy actions click the original element. An ordinary `<button type="submit">` therefore keeps its original form behavior. Use `type="button"` for actions that must not submit. The native bridge does not preserve browser user-activation privileges for APIs such as popup opening.

## 3. Start after mounting the controls

```ts
import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui/core';

const shell = await enableNativeUIShell({
  root: document.querySelector<HTMLElement>('#app')!,
});
```

Call once after the source root exists. Keep the handle and call `await shell.destroy()` when that root is disposed. The plugin does not add page padding or safe-area rules; retain your application's CSS. For Angular, React, or Vue, use the [app-root lifecycle examples](setup.md#place-startup-in-your-frameworks-app-root) with the `/core` import. For animated navigation, use [suspension through completion and cancellation](setup.md#navigation-without-the-theme).

## 4. Build and run on iOS

Build your Web app, run `npx cap sync ios`, and launch the iOS project from Xcode. The marked Add button should render natively and invoke its original click handler. In a browser, the same button remains an ordinary Web button. Unmarked HTML remains unchanged.

If a button stays on the Web on supported iOS, check that it is visible within the configured root, has an accessible name, and that the direct plugin dependency was synced and the iOS app rebuilt.

In an app that also uses Ionic, set `ionic: { auto: false }` to project only explicit sources and registered extensions. See [selective Ionic projection](configuration.md#select-controls-explicitly-in-a-customized-ionic-app).

## Optional Web rail

Replace the startup call in step 3 with the following configuration; do not start a second shell:

```ts
const shell = await enableNativeUIShell({
  root: document.querySelector<HTMLElement>('#app')!,
  verticalBars: {
    placement: {
      edge: 'trailing',
      webHost: document.querySelector<HTMLElement>('#rail')!,
    },
  },
});
```

The plugin uses device-reported rail availability and resolves leading/trailing through the document direction. A placement preference never forces an unsupported system rail. Native rejection restores Web presentation. With `webHost`, explicitly rail-marked HTML controls have Web proxies when native projection is unavailable. Without it, their originals remain visible. The application styles and positions the host and reserves any content spacing. The host must be outside the source root.

To use only rail projection, add `verticalBars.only: true`. To change rail use later, call `await shell.disableVerticalControlArea()` or `await shell.enableVerticalControlArea()`. Disabling restores original controls and removes Web rail proxies without destroying ordinary native projection. `only: true` keeps ordinary controls on the Web throughout.

Currently the HTML adapter supports buttons and back buttons. Arbitrary HTML tabs, segments, searchbars and FAB structures are not translated. Ionic adapters continue to support their existing controls. Custom element extensions work with the same scoped root; the existing `tab-accessory` extension placement still requires an Ionic tab-bar owner.

## Example

The [plain HTML example](https://github.com/rdlabo-dev/ionic-theme-ios27/tree/main/examples/native-ui-html) demonstrates Add, routerless Home/Details/Back navigation, optional Web rail projection and cleanup. It uses no Ionic or theme CSS.
