# Native UI without Ionic

Add native buttons to an existing Web app without Ionic or theme CSS. Keep labels, state, and click handlers on ordinary HTML elements. Standard buttons require no custom Swift registration.

Use a Capacitor 8 app with an iOS project, Xcode 26+, and an iOS 26+ device or simulator. Browsers and Android retain Web controls. For custom Android native content, use [Kotlin/Compose extensions](native-ui-extensions.md#2b-register-compose-content-on-android).

Start with [how projection works](../README.md#how-projection-works): the HTML element remains the source while native controls or Web proxies provide its presentation.

**Want only Vertical Bars?** Follow steps 1–2 to install and mark your HTML buttons, then use the [Web rail configuration](#optional-web-rail) in place of step 3. Remove explicit markers from buttons you want to leave on the Web. Style the rail host in your application and build with step 4 for iOS. You do not need Ionic, `@rdlabo/ionic-theme-ios27`, or `vertical-bars.css`.

For Vertical Bars in an app using `ion-tabs`, `ion-toolbar` or other Ionic components with a custom theme, use the [Ionic Vertical Bars setup](../../theme-ios27/docs/iphone-duo-with-original-theme.md#try-it-in-your-existing-ionic-app) instead. The framework (Angular, React or Vue) alone does not determine which adapter to use.

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

Build your Web app, run `npx cap sync ios`, and launch the iOS project from Xcode. With the step 3 configuration, Add renders natively and invokes its original click handler. With the rail configuration below, Add retains native element placement and Back uses the native rail when available. In a browser, the same button remains an ordinary Web button. Unmarked HTML remains unchanged.

If a button stays on the Web on supported iOS, check that it is visible within the configured root, has an accessible name, and that the direct plugin dependency was synced and the iOS app rebuilt.

In an app that also uses Ionic, set `ionic: { auto: false }` to project only explicit sources and registered extensions. See [selective Ionic projection](configuration.md#select-controls-explicitly-in-a-customized-ionic-app).

## Optional Web rail

For a Web fallback rail, use this instead of the startup call in step 3. Call once after both the source root and rail host are mounted; call `await shell.destroy()` when their owner is disposed. Do not start a second shell:

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

Explicit markup chooses placement: Back goes to the rail and Add keeps native element placement. To project only Back, remove `data-native-ui="button"` from Add. `controls` does not disable explicit source declarations. To change rail use later, call `await shell.disableVerticalControlArea()` or `await shell.enableVerticalControlArea()`. Disabling restores original rail controls and removes Web rail proxies without destroying ordinary native projection.

Currently the HTML adapter supports buttons and back buttons. Arbitrary HTML tabs, segments, searchbars and FAB structures are not translated. Ionic adapters continue to support their existing controls. Custom element extensions work with the same scoped root; the existing `tab-accessory` extension placement still requires an Ionic tab-bar owner.

For device-driven spacing and placement, see [Use with Capacitor Foldable](vertical-bars.md#use-with-capacitor-foldable). Read its initial placement and subscribe to changes, applying the edge and inset to your own CSS; the theme package is not required.

## Example

The [plain HTML example](https://github.com/rdlabo-dev/ionic-theme-ios27/tree/main/examples/native-ui-html) demonstrates Add, routerless Home/Details/Back navigation, optional Web rail projection and cleanup. It uses no Ionic or theme CSS.
