# Configure Native UI

Call `enableNativeUIShell()` once after your application's DOM is mounted. Ionic and explicitly marked HTML controls share the standard Swift renderers. The theme is optional; Web layout, safe areas and spacing belong to your app or theme.

```ts
import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui';

const shell = await enableNativeUIShell();
```

Without Ionic, import the same API from `@rdlabo/capacitor-native-ui/core`. That entry does not load Ionic's optional popover integration. See [plain HTML](framework-independent.md).

## All settings

All nested objects merge with their defaults. For example, `controls: { tabs: false }` disables only tabs.

```ts
const shell = await enableNativeUIShell({
  root: document.body,
  controls: {
    buttons: true,
    tabs: true,
    segment: true,
    fab: true,
  },
  verticalBars: {
    enabled: true,
    only: false,
    buttonProjection: 'system',
    buttonDefaultFill: 'glass',
    popover: false,
    // Optional: placement: { edge: 'trailing', webHost: appOwnedHost },
  },
  extensions: [],
});
```

| Setting | Default | Meaning |
| --- | --- | --- |
| `root` | `document.body` | Connected source subtree. Controls outside it are not projected. |
| `controls.buttons` | `true` | Supported Ionic toolbar/back/menu controls and explicitly marked HTML buttons. |
| `controls.tabs` | `true` | Ionic tabs and their registered native search. |
| `controls.segment` | `true` | Supported Ionic segments. |
| `controls.fab` | `true` | Supported Ionic floating action buttons. |
| `verticalBars.enabled` | `true` | Allow rail projection when available. Device capability is always checked; enabling cannot create a system rail. |
| `verticalBars.only` | `false` | Restrict native projection to rail controls. Other controls stay Web. |
| `verticalBars.buttonProjection` | `'system'` | `'system'` uses native styling; `'source'` uses supported source styling. Local overrides take precedence. |
| `verticalBars.buttonDefaultFill` | `'glass'` | `'glass'` or `'solid'` for source-style standalone Ionic buttons with no explicit fill. Explicit fills and the clear default inside `ion-buttons` take precedence. |
| `verticalBars.popover` | `false` | Opt into Ionic popovers anchored to native rail buttons. Requires the Ionic entry and its optional peers; no effect on plain HTML. |
| `verticalBars.placement` | omitted | Optional `{ edge: 'leading' \| 'trailing', webHost?: HTMLElement }`. Edge is a preference, not a device capability declaration. |
| `extensions` | `[]` | Application-specific SwiftUI extensions, paired with native registrations. |

`webHost` is an optional, application-styled HTML fallback rail. It must be connected in the same document and outside `root`, with neither element containing the other. Use a limited `root`, such as your `<main>`, when supplying a sibling host; the default `document.body` cannot have such a host. Without a host, unavailable HTML rails leave their original controls visible. Ionic's existing rail layout uses its own fallback adapter.

HTML currently supports buttons and back buttons. Tab, segment and FAB readers remain Ionic adapters; enabling those settings does not infer equivalent structures from arbitrary HTML.

## Common configurations

```ts
// Ionic or HTML: all supported controls, rail support enabled by default.
const shell = await enableNativeUIShell();

// Alternative startup: Ionic with only Vertical Bars native presentation.
const railOnly = await enableNativeUIShell({ verticalBars: { only: true } });

// Alternative startup: only native Ionic tabs.
const tabsOnly = await enableNativeUIShell({
  controls: { buttons: false, segment: false, fab: false },
});
```

These are alternatives: start only one shell. Repeating the same startup returns its handle; different startup settings require destroying the previous shell.

| Rail setting | Rail available | Rail unavailable |
| --- | --- | --- |
| `enabled: true, only: false` | Eligible rail and ordinary native controls | Ordinary native controls; unavailable rail controls retain Web fallback |
| `enabled: true, only: true` | Eligible rail controls only | Web fallback |
| `enabled: false, only: false` | Ordinary native controls; rail controls remain Web | Same |
| `enabled: false, only: true` | All controls remain Web | Same |

`data-native-ui-placement="element"` preserves a control's original position. It is never moved into a rail; with `only: true` it stays Web. For Ionic groups, put the placement on the whole `ion-buttons` group so its shared native surface has a single placement.

## Change rail use after startup

```ts
await shell.disableVerticalControlArea();
await shell.enableVerticalControlArea();
```

These methods change `verticalBars.enabled` on this shell and preserve `only`, appearance, controls and placement. They retire existing projection before transferring ownership, without creating another shell. Calls are serialized. Calling either method after `destroy()` rejects.

```ts
const lease = await shell.suspend(); // temporarily restore all Web controls
await lease.resume();
await shell.destroy();              // stop the shell and restore sources
```

Disabling rail projection does not remove application CSS or change application-owned spacing. Update your own layout alongside this setting if needed.

## Compatibility

The existing global `enableVerticalControlArea()` remains a startup wrapper for Ionic rail-only usage, while `setVerticalControlAreaPlacement()` is a deprecated Web CSS compatibility adapter. Its `nativeEdge` input is ignored; native availability is obtained from the plugin’s own device metrics. Use the theme’s `setVerticalBarsLayout({ edge, inset })` for Web layout. New code should use the shared startup and handle methods above. See [migration](migration.md) for legacy settings and the changed partial-control defaults.
