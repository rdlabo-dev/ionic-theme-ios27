# Configure Native UI

This is the settings reference. Start with [how projection works](../README.md#how-projection-works), then [Ionic setup](setup.md) or [HTML setup](framework-independent.md) for installation.

Call `enableNativeUI()` once after your application's DOM is mounted. Ionic and explicitly marked HTML controls share the standard Swift renderers. The theme is optional; Web layout, safe areas and spacing belong to your app or theme.

```ts
import { enableNativeUI } from '@rdlabo/capacitor-native-ui';

const shell = await enableNativeUI();
```

Without Ionic, import the same API from `@rdlabo/capacitor-native-ui/core`. That entry does not load Ionic's optional popover integration. See [plain HTML](framework-independent.md).

## Platform behavior

| Feature                                 | Supported iOS                             | Android               | Browser / older iOS   |
| --------------------------------------- | ----------------------------------------- | --------------------- | --------------------- |
| Automatic Ionic controls (`ionic.auto`) | Native                                    | Original Web controls | Original Web controls |
| Explicit element buttons                | Native                                    | Original Web controls | Original Web controls |
| Element extensions                      | SwiftUI                                   | Kotlin / Compose      | Original Web content  |
| Vertical Bars                           | Native when available; otherwise Web rail | Web rail              | Web rail              |
| `tab-accessory` extensions              | Supported iOS tab host only               | Original Web content  | Original Web content  |

Web rails require the Ionic rail layout or an application-owned HTML `webHost`. Settings never create a device capability. `verticalBars.only: true` excludes element extensions on every platform; leave it false when combining a Web rail with Android extensions.

## All settings

All nested objects merge with their defaults. For example, `ionic: { auto: { tabs: false } }` disables only tabs.

```ts
const shell = await enableNativeUI({
  root: document.body,
  debug: false,
  ionic: {
    auto: {
      buttons: true,
      tabs: true,
      segment: true,
      fab: true,
    },
  },
  verticalBars: {
    enabled: true,
    only: false,
    buttonProjection: 'system',
    buttonDefaultFill: 'glass',
    popover: false,
    // Optional: placement: { edge: 'trailing', webHost: appOwnedHost },
  },
  horizontal: true,
  vertical: true,
  extensions: [],
});
```

| Setting                          | Default         | Meaning                                                                                                                                                                                                                                 |
| -------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ionic.auto`                     | `true`          | `true` or omitted enables automatic Ionic projection; `false` disables it; an object selects kinds. Explicit `data-native-ui` sources and extensions are unaffected.                                                                    |
| `horizontal` / `vertical`        | `true`          | Automatic Ionic toolbar selection and grouping per layout: boolean or `{ buttons, button, backButton }`. Omitted fields are `true`; local attributes may override. See [toolbar settings](native-ui.md#toolbar-selection-and-grouping). |
| `debug`                          | `false`         | Log source elements and Web fallback reasons to the developer console; no props or application exception messages.                                                                                                                      |
| `root`                           | `document.body` | Connected source subtree. Controls outside it are not projected.                                                                                                                                                                        |
| `ionic.auto.buttons`             | `true`          | Automatic Ionic toolbar/back/menu controls. Explicitly marked buttons are independent.                                                                                                                                                  |
| `ionic.auto.tabs`                | `true`          | Ionic tabs and their registered native search.                                                                                                                                                                                          |
| `ionic.auto.segment`             | `true`          | Supported Ionic segments.                                                                                                                                                                                                               |
| `ionic.auto.fab`                 | `true`          | Supported Ionic floating action buttons.                                                                                                                                                                                                |
| `verticalBars.enabled`           | `true`          | Allow rail projection when available. Device capability is always checked; enabling cannot create a system rail.                                                                                                                        |
| `verticalBars.only`              | `false`         | Restrict native projection to rail controls. Other controls stay Web.                                                                                                                                                                   |
| `verticalBars.buttonProjection`  | `'system'`      | `'system'` uses native styling; `'source'` uses supported source styling. Local overrides take precedence.                                                                                                                              |
| `verticalBars.buttonDefaultFill` | `'glass'`       | `'glass'` or `'solid'` for source-style standalone Ionic buttons with no explicit fill. Explicit fills and the clear default inside `ion-buttons` take precedence.                                                                      |
| `verticalBars.popover`           | `false`         | Opt into Ionic popovers anchored to native rail buttons. Requires the Ionic entry and its optional peers; no effect on plain HTML.                                                                                                      |
| `verticalBars.placement`         | omitted         | Optional `{ edge: 'leading' \| 'trailing', webHost?: HTMLElement }`. Edge is a preference, not a device capability declaration.                                                                                                         |
| `extensions`                     | `[]`            | **Experimental.** Application-specific SwiftUI / Compose extensions, paired with native registrations. API and behavior may change.                                                                                                     |

`webHost` is an optional, application-styled HTML fallback rail. It must be connected in the same document and outside `root`, with neither element containing the other. Use a limited `root`, such as your `<main>`, when supplying a sibling host; the default `document.body` cannot have such a host. Without a host, unavailable HTML rails leave their original controls visible. Ionic's existing rail layout uses its own fallback adapter.

HTML currently supports buttons and back buttons. Tab, segment and FAB readers remain Ionic adapters; enabling those settings does not infer equivalent structures from arbitrary HTML.

## Common configurations

```ts
// Ionic or HTML: all supported controls, rail support enabled by default.
const shell = await enableNativeUI();

// Alternative startup: Ionic with only Vertical Bars native presentation.
const railOnly = await enableNativeUI({ verticalBars: { only: true } });

// Alternative startup: automatically project only Ionic tabs; explicit sources remain independent.
const tabsOnly = await enableNativeUI({
  ionic: { auto: { buttons: false, segment: false, fab: false } },
});
```

These are alternatives: start only one shell. Repeating the same startup returns its handle; different startup settings require destroying the previous shell.

| Rail setting                  | Rail available                                     | Rail unavailable                                                        |
| ----------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `enabled: true, only: false`  | Eligible rail and ordinary native controls         | Ordinary native controls; unavailable rail controls retain Web fallback |
| `enabled: true, only: true`   | Eligible rail controls only                        | Web fallback                                                            |
| `enabled: false, only: false` | Ordinary native controls; rail controls remain Web | Same                                                                    |
| `enabled: false, only: true`  | All controls remain Web                            | Same                                                                    |

`data-native-ui-placement="element"` preserves a control's original position. It is never moved into a rail; with `only: true` it stays Web. For Ionic groups, put the placement on the whole `ion-buttons` group so its shared native surface has a single placement.

## Select controls explicitly in a customized Ionic app

Disable automatic Ionic projection while retaining the native rail and your custom extensions:

```ts
const shell = await enableNativeUI({
  root: document.querySelector<HTMLElement>('#content')!,
  ionic: { auto: false },
  verticalBars: {
    enabled: true,
    placement: {
      edge: 'trailing',
      webHost: document.querySelector<HTMLElement>('#rail')!,
    },
  },
  extensions: [myExtension],
});
```

```html
<main id="content">
  <ion-button>Keep this on the Web</ion-button>
  <ion-button data-native-ui="button" data-native-ui-placement="rail">Project this action</ion-button>
  <button data-native-ui="button">Project at its original position</button>
</main>
<aside id="rail" aria-label="Actions"></aside>
```

Keep your original handlers on each source. Explicit `ion-button` uses the standard button reader, so supported content and styling rules still apply; the attribute does not make arbitrary custom markup supported. `data-native-ui-placement="rail"` requests the system rail when available. Style the optional `webHost` and reserve space in your app; without it, unavailable explicit rails keep their source controls visible. Unmarked Ionic controls remain Web-rendered. An automatically projected group containing an explicitly marked source stays on the Web to avoid covering that source twice.

Explicit built-in sources support individual `button`, `ion-button`, and `[role="button"]` elements with `data-native-ui="button"` or `"back-button"`. This does not opt existing `ion-back-button`, `ion-menu-button`, button groups, tabs, segments, or FABs into their Ionic-specific readers. Keep automatic projection enabled for the corresponding kind, use a standard explicit button with your own click handler, or register an extension for custom UI.

`verticalBars.enabled` and `only` still govern rail availability and projection scope. For example, `only: true` leaves explicitly marked element-position buttons and ordinary element extensions on the Web too.

## Change rail use after startup

```ts
await shell.disableVerticalControlArea();
await shell.enableVerticalControlArea();
```

These methods change `verticalBars.enabled` on this shell and preserve `only`, appearance, controls and placement. They retire existing projection before transferring ownership, without creating another shell. Calls are serialized. Calling either method after `destroy()` rejects.

```ts
const lease = await shell.suspend(); // temporarily restore all Web controls
await lease.resume();
await shell.destroy(); // stop the shell and restore sources
```

Disabling rail projection does not remove application CSS or change application-owned spacing. Update your own layout alongside this setting if needed.

## Request a check after an unobserved change

```ts
shell.markForCheck();
```

Use this after changing a property or reader state that does not cause a DOM mutation. It schedules a check, batches repeated requests, and sends only changed native snapshots. It returns `void`; it does not wait for native completion or render your framework's DOM. Calls after destruction are ignored. See [source checks and observation](native-ui-extensions.md#schedule-a-source-check).

## Understand why a source stays on the Web

Temporarily add `debug: true` to your existing startup options, then rebuild the Web app. Do not start a second shell to enable diagnostics:

```ts
const shell = await enableNativeUI({ debug: true, extensions: [myExtension] });
console.info(shell.getStatus());
```

Open the WebView developer console and filter for `[Native UI]`. Diagnostics include the DOM source when available. Each reason is logged once per source during that activation, so scrolling or repeated `markForCheck()` calls do not flood the console. Props, action payloads and application exception messages are not logged.

| Diagnostic                                            | What to check                                                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `web-fallback`                                        | Platform support, native plugin registration, sync and native rebuild.                                               |
| `unregistered-extension`                              | Native registration name matches the DOM definition and runs before startup. Newly inserted sources are checked too. |
| `reader-error` / `invalid-props`                      | Reader implementation, JSON-only values and the 64K size limit.                                                      |
| `unsupported-placement` / `missing-tab-owner`         | Platform and owning native tab host for a tab accessory.                                                             |
| `source-hidden` / `source-clipped` / `source-focused` | Visibility, clipping/transformed ancestors, or a focused Web descendant.                                             |
| `reader-opt-out` / `rail-only`                        | Your reader returned null, or `verticalBars.only` excludes an element extension.                                     |
| `unsupported-control`                                 | Supported markup, accessible name, fixed placement and styling.                                                      |
| `native-rejected`                                     | Native props decoding, placement or device support. The bridge reports rejection, not the native exception.          |

`getStatus()` summarizes the shell; it is not a per-element diagnostic report. Normal navigation, suspension and unsupported content can intentionally retain Web presentation. Turn debug off after investigating; it does not change projection eligibility.

## Compatibility

`controls` is deprecated. If `ionic.auto` is omitted, existing `controls` settings retain their previous behavior, including `buttons: false` disabling explicitly marked buttons. When `ionic.auto` is supplied, it takes precedence for automatic controls and explicit sources are independent. Move `controls.popover` to `verticalBars.popover`. Partial objects retain enabled defaults for omitted kinds; use `false` to disable all automatic kinds.

The existing global `enableVerticalControlArea()` remains a startup wrapper for Ionic rail-only usage, while `setVerticalControlAreaPlacement()` is a deprecated Web CSS compatibility adapter. Its `nativeEdge` input is ignored; native availability is obtained from the plugin’s own device metrics. Use the theme’s `setVerticalBarsLayout({ edge, inset })` for Web layout. New code should use the shared startup and handle methods above. See [migration](migration.md) for legacy settings and the changed partial-control defaults.
