# Native UI without Ionic

Add native buttons to an existing Web app without Ionic or theme CSS. Keep labels, state, and click handlers on ordinary HTML elements. Standard buttons require no custom Swift registration.

Use a Capacitor 8 app with an iOS project, Xcode 26+, and an iOS 26+ device or simulator. Browsers and Android retain Web controls. For custom Android native content, use [Kotlin/Compose extensions](native-ui-extensions.md#2b-register-compose-content-on-android).

Start with [how projection works](../README.md#how-projection-works): the HTML element remains the source while native controls or Web proxies provide its presentation.

**Want only Vertical Bars?** Follow the [device placement setup](#device-placement-for-vertical-bars), alongside steps 1–4 below. Reuse the step 3 runtime without a fixed placement preference. Remove explicit markers from buttons you want to leave on the Web. You do not need Ionic, `@rdlabo/ionic-theme-ios27`, or `vertical-bars.css`.

For Vertical Bars in an app using `ion-tabs`, `ion-toolbar` or other Ionic components with a custom theme, use the [Ionic Vertical Bars setup](ionic-vertical-bars.md#try-it-in-your-existing-ionic-app) instead. The framework (Angular, React or Vue) alone does not determine which adapter to use.

## 1. Install the plugin

[Capacitor Foldable](https://github.com/erkamyaman/capacitor-foldable) is our standard integration for device state. Its placement and posture APIs let your app control how the layout adapts; installing it is followed by connecting its initial values and change events.

Keep your existing Capacitor installation and add Native UI and Foldable together:

```sh
npm install @rdlabo/capacitor-native-ui @erkamyaman/capacitor-foldable
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

| Attribute                  | Value               | Effect                                                                                                             |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `data-native-ui`           | `button`            | Project a standard action button.                                                                                  |
| `data-native-ui`           | `back-button`       | Project a standard back button. The source click handler owns navigation; the plugin never calls `history.back()`. |
| `data-native-ui`           | `disabled`          | Exclude the element and its subtree from projection.                                                               |
| `data-native-ui-placement` | `element` (default) | Use the source element's rectangle.                                                                                |
| `data-native-ui-placement` | `rail`              | Request Vertical Bars; use the optional Web rail host when native rail presentation is unavailable.                |

Apply `button` and `back-button` to `<button>`, explicitly marked `ion-button`, or elements exposing `role="button"` and click behavior. Unmarked HTML is never inferred to be a control. `data-native-ui-placement` chooses placement for a declared source; it does not opt an unmarked HTML element into projection.

Keep the control's data and behavior on its source:

| Source property      | Projection behavior                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Accessible name      | Resolves from `aria-labelledby`, then `aria-label`, then text.                             |
| Artwork              | Uses supported static SVG.                                                                 |
| Disabled state       | Respects native `disabled`, a disabled fieldset, and `aria-disabled="true"`.               |
| Visibility and scope | Hidden, removed, excluded or out-of-scope sources are retired; stale actions are rejected. |
| Application handlers | Remain on the original element.                                                            |

Native and Web-proxy actions click the original element. An ordinary `<button type="submit">` therefore keeps its original form behavior. Use `type="button"` for actions that must not submit. The native bridge does not preserve browser user-activation privileges for APIs such as popup opening.

## 3. Start after mounting the controls

```ts
import { enableNativeUI } from '@rdlabo/capacitor-native-ui/core';

const shell = await enableNativeUI({
  root: document.querySelector<HTMLElement>('#app')!,
});
```

Call once after the source root exists. Keep the handle and call `await shell.destroy()` when that root is disposed. The plugin does not add page padding or safe-area rules; retain your application's CSS. For Angular, React, or Vue, use the [app-root lifecycle examples](setup.md#place-startup-in-your-frameworks-app-root) with the `/core` import. For animated navigation, use [suspension through completion and cancellation](setup.md#navigation-without-the-theme).

### Match the HTML theme

For a custom HTML theme, declare `color-scheme: light` or `color-scheme: dark` in the same CSS that selects your Web palette. Background colors alone do not select native appearance. See [Light and dark appearance](appearance.md) for a manual-toggle example, precedence when Ionic/theme variables are present, and shared rail behavior.

## 4. Build and run on iOS

Build your Web app, run `npx cap sync ios`, and launch the iOS project from Xcode. With the step 3 configuration, Add renders at its source position and invokes its original click handler. Back requests the device-reported native rail when available; connect the device placement below to keep Web spacing in sync. In a browser, the same button remains an ordinary Web button. Unmarked HTML remains unchanged.

If a button stays on the Web on supported iOS, check that it is visible within the configured root, has an accessible name, and that the direct plugin dependency was synced and the iOS app rebuilt.

In an app that also uses Ionic, set `ionic: { auto: false }` to project only explicit sources and registered extensions. See [selective Ionic projection](configuration.md#select-controls-explicitly-in-a-customized-ionic-app).

## Device placement for Vertical Bars

Foldable is already included in the standard installation in step 1. Connect it to your application layout as follows.

Reuse the runtime from step 3 **without `verticalBars.placement`**. Native UI then follows the device-reported edge; a fixed `edge: 'trailing'` would constrain it and can reject a device's leading rail.

Follow [Foldable integration](vertical-bars.md#with-application-owned-css-or-without-ionic):

1. Subscribe to `barPlacementChange`, then read `getBarPlacement()` for the initial edge and inset.
2. Apply the edge and inset to your application's CSS. On a null edge, restore ordinary spacing and call `shell.disableVerticalControlArea()`; when an edge returns, call `shell.enableVerticalControlArea()`. Serialize these changes with layout updates.
3. At teardown, remove the listener and destroy the runtime owned by this application.

Keep the explicit source markers from step 2; they declare the controls and their requested placement. To project only Back, remove `data-native-ui="button"` from Add. `controls` does not disable explicit declarations. Without a Web rail host, unavailable native rail controls stay at their original Web positions. The theme package is not required.

## Optional browser rail preview

For a browser-only layout preview, temporarily use this fixed Web rail instead of the startup call in step 3 and the device subscription. Do not copy the fixed placement into the standard device setup. Call once after the source root and host are mounted, and call `await shell.destroy()` when their owner is disposed:

```ts
import { enableNativeUI } from '@rdlabo/capacitor-native-ui/core';

const shell = await enableNativeUI({
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

Explicit markup chooses placement: Back goes to the preview rail and Add stays at its original position. Disabling rail projection restores original rail controls and removes Web proxies without destroying ordinary native projection. Before building for a device, restore the step 3 runtime and the Foldable subscription above.

Currently the HTML adapter supports buttons and back buttons. Arbitrary HTML tabs, segments, searchbars and FAB structures are not translated. Ionic adapters continue to support their existing controls. Custom element extensions work with the same scoped root; the existing `tab-accessory` extension placement still requires an Ionic tab-bar owner.

## Example

The [plain HTML example](https://github.com/rdlabo-dev/ionic-theme-ios27/tree/main/examples/native-ui-html) demonstrates Add, routerless Home/Details/Back navigation, optional Web rail projection and cleanup. It uses no Ionic or theme CSS.
