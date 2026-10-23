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

Web rails require the Ionic rail layout or an application-owned HTML `webHost`. Settings never create a device capability.

For HTML-derived light/dark behavior, see [Light and dark appearance](appearance.md). Appearance is configured in Web CSS, not through a startup option.

## All settings

`controls` chooses selection and grouping defaults. `verticalBars` configures the rail. `ionic` configures Ionic discovery and appearance. Omitted fields default to `true` in `controls`, including partial objects.

```ts
const shell = await enableNativeUI({
  root: document.body,
  controls: {
    buttonGroup: true,
    button: true,
    backButton: true,
    tabs: true,
    segment: true,
    fab: true,
  },
  verticalBars: {
    enabled: true,
    // Optional: placement: { edge: 'trailing', webHost: appOwnedHost },
  },
  extensions: [],
  ionic: {
    auto: true,
    verticalBars: {
      buttonProjection: 'system',
      buttonDefaultFill: 'glass',
      popover: false,
    },
  },
  debug: false,
});
```

### Selection defaults

Every control accepts `ControlProjection`. `controls` itself accepts the same values as a shorthand for all six fields.

| Value              | Ordinary placement | Vertical rail placement |
| ------------------ | ------------------ | ----------------------- |
| `true` (default)   | Selected           | Selected                |
| `false`            | Not selected       | Not selected            |
| `'horizontalOnly'` | Selected           | Not selected            |
| `'verticalOnly'`   | Not selected       | Selected                |

Horizontal and vertical describe **control placement**, not screen orientation or device model. These defaults do not move a control, provide a missing device capability, or make unsupported markup eligible.

| Control       | Responsibility                                                                   |
| ------------- | -------------------------------------------------------------------------------- |
| `buttonGroup` | Group already selected actions when the group qualifies. Never selects children. |
| `button`      | Select ordinary buttons and Ionic menu buttons.                                  |
| `backButton`  | Select back navigation, independently of its parent group.                       |
| `tabs`        | Select tabs and their registered search presentation.                            |
| `segment`     | Select supported segments.                                                       |
| `fab`         | Select supported floating action buttons.                                        |

Local `data-horizontal-bars="true|false"` and `data-vertical-bars="true|false"` override the matching selection default. On `ion-buttons` they control grouping only. Explicit `data-native-ui` sources are independent of these defaults. Structural exclusions and rail availability still apply. See [toolbar selection and grouping](native-ui.md#toolbar-selection-and-grouping).

### Toolbar button correspondence

Native toolbar buttons receive presentation identities automatically. Ordinary buttons correspond by their toolbar, logical slot and order among projected buttons. Menu and Back buttons at the leading position correspond in both horizontal and vertical bars. Changing the layout axis preserves presentation identities and group order. Each surface has its own child positions, so adding or removing buttons inside one group does not change the identities of later surfaces or their buttons. Labels and click handlers may change without requiring an ID attribute. Header and footer toolbars are separate scopes.

Optionally set `data-transition-id` on an individual button when it should follow a particular action through a reorder within its corresponding surface:

```html
<!-- Source page -->
<ion-button data-transition-id="edit">Edit</ion-button>
<!-- Destination page -->
<ion-button data-transition-id="edit">Done</ion-button>
```

An explicit key overrides the automatic position within the corresponding toolbar. It does not change HTML `id`, routing or click delivery. Keep the original handler on each page's source button. Blank values use automatic correspondence; duplicate explicit keys within a toolbar are treated as separate, unmatched sources. Put the attribute on each button, including children of an `ion-buttons` group. Child keys match within a corresponding surface; they do not move an action between different groups. To preserve a whole group through a reorder, also give its `ion-buttons` element a surface key. The group key identifies the shared background and child keys identify its buttons, even when only one child remains.

These identities drive the native SwiftUI Vertical Bars toolbar. With the theme's navigation animation adapter, corresponding horizontal fixed toolbar surfaces remain native and follow the Ionic page animation's progress, including interactive reversal. Geometry and content change during playback; action ownership changes only after navigation commits. A canceled swipe restores the original toolbar. Retained horizontal toolbar actions are ignored until navigation and the destination update finish.

Outgoing controls without corresponding surface identities remain native and fade out in place with page progress; cancellation reverses the fade. This opacity animation does not reproduce the system navigation bar’s blur effect. New destination controls are prepared natively before playback and grow into place, retaining the same native view when navigation completes. Single buttons and groups use the same numbered positions within each toolbar slot, counting from the logical outer edge: start from inline-start and end from inline-end. Group children follow the same rule. In LTR this means start from the left and end from the right; RTL mirrors those edges. A group at end position 0 can become a single button at end position 0; changing its child count or fill does not break correspondence or renumber the following surface. The background resizes while added or removed buttons grow or shrink. An optional `data-transition-id` on a surface overrides its positional identity. Moving page content, explicit runtime suspension, unsupported controls, native rejection and overlay fallback also use Web presentation. Ionic clear buttons inside `ion-buttons` share one glass surface, including buttons whose omitted `fill` resolves to clear.

Progress updates use an optional capability acknowledged by the native plugin. Older native binaries that do not acknowledge it are not sent the new bridge method: outgoing toolbar surfaces, including unmatched ones, stay visible until the completion-time handoff. Older transition adapters keep their existing behavior. Updating both the theme and native plugin enables progress synchronization.

Vertical Bars mirror the Web page hierarchy in a SwiftUI `NavigationStack` to use its standard push/pop toolbar animations. Web routing and each source button still determine navigation and actions; the native stack does not introduce another navigation history. Canceled navigation restores the previous path, and tab and modal pages retain their own ancestry. During an interactive swipe, Vertical Bars keep the source toolbar while the finger is down, matching the native vertical toolbar behavior. A canceled swipe leaves it unchanged. When the finger lifts and the gesture commits, the standard toolbar transition starts alongside the Web page settling into place. The projected Web toolbar sources remain hidden and native rail input is suspended until the swipe settles. Horizontal toolbars instead follow the page animation progress frame by frame. Automatic positional identities request correspondence by position, so use an explicit key when an action should follow a reorder instead.

### Other settings

| Setting                                | Default         | Meaning                                                                                                                                                     |
| -------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `root`                                 | `document.body` | Connected source subtree. Controls outside it are not projected.                                                                                            |
| `verticalBars.enabled`                 | `true`          | Allow rail projection when available.                                                                                                                       |
| `verticalBars.placement`               | omitted         | Optional `{ edge: 'leading' \| 'trailing', webHost?: HTMLElement }`. Edge is a preference, not a capability declaration.                                    |
| `extensions`                           | `[]`            | **Experimental.** App-specific SwiftUI / Compose extensions. Independent of `controls` and `ionic.auto`; the app decides when its reader returns content.   |
| `ionic.auto`                           | `true`          | Enable automatic Ionic discovery. `false` disables it, including local layout opt-ins. Explicit `data-native-ui` sources and extensions remain independent. |
| `ionic.verticalBars.buttonProjection`  | `'system'`      | `'system'` uses native styling; `'source'` projects supported Ionic styling. Local appearance overrides take precedence.                                    |
| `ionic.verticalBars.buttonDefaultFill` | `'glass'`       | `'glass'` or `'solid'` for source-style standalone Ionic buttons without explicit fill. Explicit fills and the clear default inside groups take precedence. |
| `ionic.verticalBars.popover`           | `false`         | Opt into Ionic popovers anchored to native rail buttons. Requires the Ionic entry and its optional peers.                                                   |
| `debug`                                | `false`         | Log source elements and fallback reasons to the developer console.                                                                                          |

### HTML fallback rail host

`webHost` is an optional, application-styled HTML fallback rail. Its requirements are:

- Connected to the same document as `root`.
- Outside `root`; neither element may contain the other.
- Styled and positioned by the application, including any reserved content spacing.

Use a limited `root`, such as your `<main>`, with a sibling host; the default `document.body` cannot have such a host. Without a host, unavailable HTML rails leave original controls visible. Ionic's existing rail layout uses its own fallback adapter.

HTML currently supports buttons and back buttons. Tab, segment and FAB readers remain Ionic adapters; enabling those settings does not infer equivalent structures from arbitrary HTML.

## Common configurations

```ts
// Ionic or HTML: all supported controls, rail support enabled by default.
const shell = await enableNativeUI();

// Alternative: automatic selection only in the rail.
const railOnly = await enableNativeUI({ controls: 'verticalOnly' });

// Alternative: automatically select only tabs.
const tabsOnly = await enableNativeUI({
  controls: { buttonGroup: false, button: false, backButton: false, tabs: true, segment: false, fab: false },
});
```

These are alternatives: start only one shell. Repeating equivalent startup settings returns its handle; different settings require destroying the previous shell.

`controls: false` disables all default selection and grouping, while local attributes can still opt in. `ionic: { auto: false }` instead disables automatic Ionic discovery altogether. Neither disables explicit HTML sources or extensions.

`verticalBars.enabled: false` leaves rail controls on the Web regardless of selection. It does not affect ordinary controls. `data-native-ui-placement="element"` preserves an explicit control's original position, even with `controls: 'verticalOnly'`. For Ionic groups, put placement on the whole `ion-buttons` group so its shared native surface has one placement.

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

`verticalBars.enabled` still governs rail availability. To leave a specific source on the Web, remove its explicit marker or use `data-native-ui="disabled"`.

## Change rail use after startup

```ts
await shell.disableVerticalControlArea();
await shell.enableVerticalControlArea();
```

These methods change `verticalBars.enabled` on this shell and preserve appearance, controls and placement. They retire existing projection before transferring ownership, without creating another shell. Calls are serialized. Calling either method after `destroy()` rejects.

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
| `reader-opt-out`                                      | Your reader returned null.                                                                                           |
| `unsupported-control`                                 | Supported markup, accessible name, fixed placement and styling.                                                      |
| `native-rejected`                                     | Native props decoding, placement or device support. The bridge reports rejection, not the native exception.          |

`getStatus()` summarizes the shell; it is not a per-element diagnostic report. Normal navigation, suspension and unsupported content can intentionally retain Web presentation. Turn debug off after investigating; it does not change projection eligibility.

## Existing applications

The standalone `enableVerticalControlArea()` defaults selection to `'verticalOnly'`. Its `setPlacement()` helper is a deprecated Web CSS adapter; use the theme's `setVerticalBarsLayout({ edge, inset })` for Web layout. Native availability comes from the plugin's device metrics.

See [upgrading from 1.2.1](migration.md) for package separation, removed options and changed partial-control defaults.
