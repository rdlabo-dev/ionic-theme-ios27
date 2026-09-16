---
title: Native UI Shell (Experimental)
---

# Native UI Shell (Experimental)

Native UI Shell is experimental. Its API and supported controls may change.

Native UI Shell gives an Ionic app native navigation and action controls around its Web content. The optional Capacitor iOS plugin renders supported fixed Ionic controls with UIKit and the system's Liquid Glass material. Page content, scrolling, application state and routing remain in Ionic's WebView.

## Background

Basecamp described this hybrid approach in [Hybrid sweet spot: Native navigation, web content](https://signalvnoise.com/posts/3743-hybrid-sweet-spot-native-navigation-web-content) (May 8, 2014): keep Web content at the core and use native UI where it improves the experience. The [Capacitor 1.0.0 Alpha announcement](https://ionic.io/blog/announcing-capacitor-1-0-0-alpha) (February 27, 2018) explicitly included **Native UI Shell** in its roadmap and linked to that article. Combining native UI with Web content was part of Capacitor's direction from the beginning.

This package revisits that idea for Ionic and Liquid Glass. Existing Ionic markup defines the shell: eligible toolbar controls, tabs, fixed FABs and searchable tabs acquire native presentation. UIKit handles their appearance and interaction; the bridge synchronizes DOM state and returns actions to the original Ionic components. Ionic continues to own the navigation stack, page transitions and application logic. The shell's scope is the supported fixed controls described below.

## Enable the shell

After installing the theme CSS described in the README, enable the shell once at application startup:

```ts
import { enableNativeUIShell } from '@rdlabo/ionic-theme-ios27/native';

void enableNativeUIShell();
```

`enableNativeUIShell()` also reads the WebView's effective top-left corner radius and applies it to page transitions. To configure only the transition without enabling native controls, call:

```ts
import { configureNativeTransition } from '@rdlabo/ionic-theme-ios27/native';

await configureNativeTransition();
```

Keep the existing `navAnimation: iosTransitionAnimation` setting. No per-page registration, component list, native callback, or Swift view controller is required. Run `npx cap sync ios` after installing or updating the package. The native plugin uses Swift Package Manager (SPM). For an existing CocoaPods app, run `npx cap spm-migration-assistant` and link the generated `CapApp-SPM` package to the app target in Xcode. Build with Xcode 26 or later and Capacitor 8; native glass requires iOS 26 or later. Web, Android, SSR and older iOS keep the Web implementation.

This is an opt-in feature. The ordinary package entry point does not import Capacitor, and `@capacitor/core` is an optional peer dependency. Native sources are still detected and built by Capacitor's sync when this package is installed in a Capacitor project, even if the application does not call `enableNativeUIShell()`.

Native appearance follows the applied class, system or always-dark theme CSS. System theme changes are synchronized while the runtime is active.

## Supported markup

| Ionic component                               | Supported appearance and placement                                                                        | Native rendering                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `ion-button`                                  | `fill="default"`, standard glass, in a fixed header/footer toolbar                                        | Glass `UIButton`                                                      |
| `ion-buttons`                                 | Fixed toolbar, two or more direct clear `ion-button` / `ion-menu-button` children sharing the theme glass | One `UIGlassEffect` surface with independent native buttons           |
| `ion-back-button`                             | Standard icon and color in a fixed header/footer toolbar                                                  | Glass `UIButton`, using the resolved Ionic label/icon                 |
| `ion-menu-button`                             | Fixed toolbar, inside the theme glass `ion-buttons`                                                       | Glass `UIButton`; original Ionic menu toggle                          |
| `ion-tab-bar`                                 | Fixed tabs, icon-only/label-only items, one icon per item, dot/text badges, selection and disabled state                          | `UITabBar` and `UITabBarItem`                                         |
| `ion-segment`                                 | Fixed toolbar, non-scrollable, text **or** one icon per item                                              | `UISegmentedControl`                                                  |
| `ion-fab` / `ion-fab-button` / `ion-fab-list` | Glass FAB in an `ion-content` fixed slot; one main button and optional directional lists                  | Persistent glass `UIButton` per button; one FAB synchronization group |

Only iOS-mode components with the theme variables installed are eligible. `ionic-theme-disabled`, `ios-theme-disabled`, and the legacy `ios26-disabled` on an element or ancestor always exclude it. A disabled theme on one tab/segment item keeps its whole group on the Web.

Use `ios-theme-shell-disabled` to disable only the iOS Native UI Shell while keeping the Web theme. It excludes the element and all its descendants. Adding or removing the class at runtime automatically restores Web rendering or re-evaluates native eligibility.

```html
<ion-toolbar class="ios-theme-shell-disabled">
  <ion-button>Web glass button</ion-button>
</ion-toolbar>
```

If a child inside a shared native surface opts out, the entire surface stays on the Web: this includes button groups, tab bars, segments and FAB lists. Opting out of the search FAB or any part of the search footer disables native search integration; the tab bar can still render natively if it remains eligible.

Placement is required even when the appearance is glass. Buttons, back buttons, menu-button groups and segments need a toolbar directly inside `ion-header` or `ion-footer`, with no `ion-content` ancestor around the control. Buttons directly inside a header/footer, standalone toolbars, and toolbars or headers nested in scrolling content stay on the Web. FABs without `slot="fixed"` also stay on the Web. Moving a projected control to an excluded location restores its Web rendering; moving it back re-evaluates eligibility.

Native tabs accept equal-width items with Ionic's default `layout="icon-top"`. The native bar uses a local compact horizontal and regular vertical size class to preserve the Web's stacked icon/label arrangement on iPad and in landscape. This does not change the app's size class. Label size and weight follow the Web snapshot. Other explicit Ionic layouts (`icon-start`, `icon-end`, `icon-bottom`, `icon-hide`, `label-hide`) and unequal item widths keep the entire tab bar on the Web. Start, center and end placement follow the original `ion-tab-bar`, including RTL. Directional `ion-icon` artwork preserves its rendered RTL flip.

Standalone clear, solid and outline buttons are excluded. A glass `ion-buttons` group of two or more clear buttons is projected as one surface; its children retain separate actions. Menu buttons can also share that group. A single menu button uses its parent `ion-buttons` as the glass surface, so no Web glass is left underneath the native button. A menu button outside this theme glass remains on the Web. Mixed fills, unsupported children, or a theme-disabled child keep the group on the Web. Single clear buttons remain on the Web. Custom button colors, custom back icons/colors, collapsing headers, toolbars inside scrolling content, modal content, scrollable/expanded segments and segment-view integration remain on the Web. Complex slots and unsupported SVG features also fall back to Web. The plugin does not translate arbitrary application CSS into UIKit styles.

Native glass samples the Web content actually drawn behind it. Existing toolbar backgrounds and header blur still affect that content. For content to scroll beneath a header, use Ionic's normal translucent-header/fullscreen-content layout; the plugin does not move page content or override an application-owned opaque toolbar background.

While a Web input owns the software keyboard, ordinary controls return to Web rendering and are re-evaluated when it closes. This also covers iPad layouts where the keyboard does not move the visual viewport. A native search field keeps its own native keyboard and search surface.

When an existing control becomes unsupported, its Web source is painted before its native cover is removed. This avoids a blank handoff, but Web/UIKit updates are not atomic and can briefly overlap. This boundary behavior differs from ordinary page navigation, where unchanged shared native tabs are retained.

## State and events

Menu buttons use Ionic's resolved default/configured icon or a supported slot icon/label. Native activation clicks the original `ion-menu-button`, preserving `menu` targeting. Non-default menu button types (`submit` / `reset`) remain on the Web. `disabled`, `autoHide`, menu availability and split-pane visibility follow the actual DOM. Opening a menu restores Web controls and retires their native covers; closing it reprojects eligible controls.

The DOM owns labels, SVG content, placement, selected values and application behavior. The placement reference is `ion-tab-bar` itself. The native tab content uses that rectangle as its sizing proposal and placement anchor, accounting for UITabBar's larger outer frame: `tab-bar-position-start`, `tab-bar-position-center`, and `tab-bar-position-end` control the horizontal anchor (including RTL), while `slot="bottom"` retains the bottom edge and `slot="top"` retains the top edge. Class changes are reconciled automatically. UIKit owns internal margins and platter sizing, while the supported stacked layout and label typography follow the Web. UIKit can cap the content width even with fill positioning. On viewports at least 768px wide, the Web theme caps standard two-, three-, four- and five-item bars near the iPad stacked platter measurements (188, 274, 336 and 414pt). Smaller viewports retain the phone sizing. The standard bar is 62pt high, with a 54pt selection and a 4pt inset. Adjacent buttons overlap like UIKit’s controls; icon and label alignment is checked against simulator screenshots. These are default appearance targets, not a guarantee for custom fonts, icons or labels; UIKit still determines its intrinsic width. A different native width or height does not reject projection. Badge and title updates retain native item identities and remeasure the platter at the same placement anchor. The plugin does not stretch icons or modify UIKit's internal controls to force CSS item widths. The plugin measures the view subtree containing the native tab controls without private class names or fixed inset corrections; an unrecognized layout restores Web rendering. The runtime watches structural changes, affected shadow roots, sizing, page lifecycle events and overlays. Ancestor `display: none`, `hidden`, theme classes, component removal and disabled changes are reconciled automatically. Native touch events are checked against the current DOM and revision before clicking the original Ionic element.

For forms, retain `ion-button type="submit"` and the form's existing submit handler. An external form is still passed as `[form]="formRef"`. The plugin does not call `form.submit()`, add a second submit path or change Angular form ownership. Segment values retain their original type because the original `ion-segment-button` is clicked; programmatic value changes do not emit a synthetic `ionChange`.

Labels use native text. Local static SVGs and resolved `ion-icon` SVGs (including `name` and changes to `name`) are rasterized at the display scale and cached, preserving their colors. Tab SVGs that follow text color use native template rendering, so icons and labels change selection color together without waiting for another bridge image. Explicit multicolor artwork retains its original colors. External references, `<use>`, animation, embedded HTML/images, SVG text and stylesheets are excluded. Web fonts and arbitrary slot layouts are not reproduced exactly.

The native host accepts input only within native controls. Tab interaction and accessibility are provided by the standard [UITabBar](https://developer.apple.com/documentation/uikit/uitabbar) control. Empty areas pass touches to the WebView. Ionic iOS hides empty badges by default. An empty visible `ion-badge` becomes a native notification dot; a non-empty badge displays its text. Badge background and text colors come from computed DOM styles, including Ionic `color` palettes. Hidden or removed badges clear the native badge. Tabs use UIKit’s standard tab control for selection, touch behavior, badges and accessibility, retaining item identity across selection updates. UIKit owns the item layout within the measured bar, so arbitrary CSS item placement is not reproduced. Native controls expose names, disabled/selected traits and badges to accessibility; the source is hidden from Web accessibility while projected. This is not a guarantee of identical VoiceOver traversal between Web and UIKit.

## Searchable tabs

Existing `attachTabBarSearchable(tabBar, fabButton, footer)` registrations automatically use native search when their bottom tab bar and glass search controls are supported. No new component option, route, native setup or page listener is required. Ordinary tab bars continue using `UITabBar`; searchable groups use a persistent `UITabBarController`, `UITab` / `UISearchTab`, and `UISearchController`. The original Capacitor WebView continues to render results and handle navigation.

Search registration does not bypass placement restrictions. Its searchbar and close button must be in fixed footer toolbars. Its trigger must belong to an `ion-fab[slot="fixed"]` directly inside `ion-content`, or directly on the existing non-scrolling `.ion-page` layout. A wrapper inside scrolling content is not a fixed slot.

Opening search preserves the selected Ionic tab and does not automatically show the keyboard. Tap the search field or call the existing `ion-searchbar.setFocus()`. UIKit owns the search expansion, keyboard placement and return to the ordinary tabs. The trigger's resolved SVG and the search icon are projected from Ionic, including `ion-icon name`. The resting layout is measured against `ion-tab-bar` and both coordinates of the original FAB's center. A layout that cannot preserve those origins uses Web search.

Native edits pass through Ionic's input handlers, preserving `ionInput` debounce, `ionChange`, `ionFocus`, `ionBlur`, and `ionClear`. Programmatic `value` changes do not emit `ionInput`; synchronous application corrections and stale native input are distinguished. Native editing owns marked text and the caret. Returning through the footer's close action retains the value and does not emit `ionCancel` or `ionClear`.

The first supported search configuration uses iOS-mode glass searchbars with the standard search keyboard, default clear control, no internal cancel button, and default autocorrection/capitalization settings. Custom input modes, return-key hints, min/max length, autocomplete, autocorrection, spellcheck, clear icons and classic searchbars remain on the Web. `disabled`, `placeholder`, `value` and `setFocus()` are synchronized for supported groups. General standalone searchbars are outside this feature.

Page retirement, overlays, theme exclusion and lost native ownership close the native presentation and preserve the latest synchronized/application value. A later search starts from that closed state. The registration survives cached page transitions; reattaching on every return is not required. Bridge waits are finite. When an opening request loses the bridge, its pending Enter can complete through the existing Web animation. A disconnected bridge cannot recover native characters that were never delivered to JavaScript.

Replacing the registered `ion-searchbar` or its input retires the old editing session. The replacement keeps its own application value and starts a new native session when reopened.

While enabled, Native UI Shell suppresses the WebView’s top scroll-edge effect because Ionic already paints the header edge. This prevents a second dark gradient when the OS and Web themes differ. The original setting is restored on destroy.

The native search controller remains visible over its own keyboard. Other projected controls are hidden while a Web input opens the keyboard. UIKit's own accessibility and Reduce Motion behavior apply to the standard controls; full VoiceOver traversal is not a verified parity guarantee.

## Transitions and recovery

FABs retain Ionic's `activated`, per-child `show`, `close()` and original click handlers. Multiple lists, initial expansion, small buttons and `edge` use each button's measured layout. The native side reflects Ionic's staggered visibility without adding another timer or open/close controller. Main-button icon changes crossfade using the resolved `closeIcon`; Reduce Motion disables this crossfade. Native FAB button instances persist across open/close updates. The source FAB stays projected throughout ordinary opening and closing.

FAB support covers the standard circular glass appearance, text and resolved static SVG/`ion-icon` content, including RTL icon mirroring. One unsupported child keeps the whole FAB in Web rendering, including when its list is closed. Colored solid buttons, submit/reset or href FABs, custom host backgrounds/shapes/motion, non-fixed-slot placement and unsupported artwork remain Web. For example, the demo's red-background `floating-action-button-fixed` page retains its existing Web appearance. A fixed-slot FAB must be a direct child of `ion-content`; a `slot="fixed"` attribute on a page sibling is not a content slot.

Custom host animation or transition declarations on the FAB, list or button keep the group on the Web until removed. Button transforms support the standard identity and hidden-child scale(0), not custom scaling. For children inside a `display:none` list, browsers can report a computed transform of `none` even when a custom transform is declared. Such transforms are checked when layout becomes available; the whole FAB then returns to Web if needed. The plugin does not parse application stylesheets or temporarily open lists to predict hidden layout.

The connection in `src/transition/ios.transition.ts` waits for native retirement before starting the Web animation. Interactive progress and completion/cancellation are queued while that retirement is in progress. Stationary shared tabs are retained. First render and transitions without an animation builder are covered by the startup runtime and Ionic lifecycle events.

Standard Ionic overlays suspend native projection until dismissal. Unsupported searchable-tab configurations use the existing Web animation and share this ownership with Web glass gestures. CSS motion of supported containing surfaces also causes temporary Web rendering.

During retirement, the source is restored and allowed to paint before its native cover is removed. During acquisition, the source is hidden only after a successful, current native response. Delayed responses are revalidated per control: existing eligible controls retain their native cover while content updates catch up. Only removed or ineligible sources return to Web; newly acquired sources require an exact acknowledgement. Ordinary page mutations never call the global clear operation. UIKit tab instances and items are retained, and equal frames/selections are not reapplied. Duplicate/stale activations are discarded. WebKit and UIKit still render separately: the implementation avoids an intentional blank frame, but does not provide an OS-level atomic compositing guarantee. Validate custom transitions and overlays on the app's supported simulators before rollout; unknown overlay systems are outside the automatic integration contract.

If a bridge update fails or times out, the runtime stops and restores Web rendering. It does not automatically reconnect. `getStatus()` reports `stopped` and the reason; to retry deliberately, call `destroy()` on that handle and then `enableNativeUIShell()` again.

For diagnostics or application teardown:

```ts
const shell = await enableNativeUIShell(); // repeated calls share the runtime
console.log(shell.getStatus()); // state, projected control count, update count, failure reason
await shell.destroy(); // restore DOM, remove native controls and release listeners/cache
```

Projection is globally enabled by default. Limit it to selected Ionic components when an application only wants part of the native shell, or disable it globally while retaining the same configuration path:

```ts
const shell = await enableNativeUIShell({
  enabled: true,
  controls: {
    all: false,
    tabs: true,
  },
});

// Equivalent to leaving Native UI Shell off; all controls remain on the Web.
const disabledShell = await enableNativeUIShell({ enabled: false });
```

Every control defaults to `controls.all`, and `controls.all` defaults to `true` for backward compatibility. Individual `tabs`, `toolbar`, `segment`, and `fab` values override it. For example, `{ controls: { fab: false } }` keeps every control except FABs native-eligible.

For a custom modal or overlay that Native UI Shell cannot detect, acquire a suspension before presenting it. The resolved suspension means projected controls have returned to Web rendering. Always release it after dismissal:

```ts
const suspension = await shell.suspend();

try {
  await modal.present();
  await modal.onDidDismiss();
} finally {
  await suspension.resume();
}
```

Suspensions are nestable and `resume()` is idempotent. Native projection resumes only after every active suspension has been released, using the current DOM rather than a stale snapshot.

The native material and control appearance follow the running iOS version; an iOS 26 device does not acquire iOS 27's appearance merely by installing this theme.

## Native UI Shell API

The generated reference below documents the handle returned by `enableNativeUIShell()`. The underlying Capacitor bridge and its control-snapshot protocol are implementation details.

<docgen-index>

* [`getStatus()`](#getstatus)
* [`suspend()`](#suspend)
* [`destroy()`](#destroy)
* [Interfaces](#interfaces)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### getStatus()

```typescript
getStatus() => NativeUIShellStatus
```

Returns the current Web/native projection state.

**Returns:** <code><a href="#nativeuishellstatus">NativeUIShellStatus</a></code>

--------------------


### suspend()

```typescript
suspend() => Promise<NativeUIShellSuspension>
```

Restores projected controls to the Web until the returned lease is resumed.

**Returns:** <code>Promise&lt;<a href="#nativeuishellsuspension">NativeUIShellSuspension</a>&gt;</code>

--------------------


### destroy()

```typescript
destroy() => Promise<void>
```

Stops synchronization, restores Web controls and releases native resources.

--------------------


### Interfaces


#### NativeUIShellStatus

| Prop            | Type                                        |
| --------------- | ------------------------------------------- |
| **`state`**     | <code>'native' \| 'stopped' \| 'web'</code> |
| **`projected`** | <code>number</code>                         |
| **`updates`**   | <code>number</code>                         |
| **`reason`**    | <code>string</code>                         |


#### NativeUIShellSuspension

| Method     | Signature                    | Description                                                                                    |
| ---------- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| **resume** | () =&gt; Promise&lt;void&gt; | Releases this suspension. Native projection resumes after all active suspensions are released. |

</docgen-api>

## Source layout

Each TypeScript module in [`src/native/components`](../src/native/components) declares its Ionic tag and DOM reader. `components/index.ts` combines those exports into discovery selectors and the component type. Shared DOM measurements, item data and SVG rendering live in `src/native/shared`; `runtime.ts` owns synchronization, visibility handoffs and lifecycle events.

On iOS, [`Components`](../ios/Sources/IonicNativeUIShellPlugin/Components) owns UIKit control creation, updates and component names. `ShellButton` shares the native button implementation used by ordinary, back and menu buttons. `Shared` owns the host view, typed snapshots, geometry, colors and image cache. Capacitor decodes each complete snapshot once using `Decodable`; renderers consume typed models and compare content with `Equatable`. Invalid batches are rejected before visible controls are changed. `IonicNativeUIShellPlugin.swift` coordinates Capacitor calls, revisions and native view lifetimes.

## Demo and verification

See the [demo and verification guide](../demo/native-ui-shell.md) for browser tests, Simulator tests and an independent SPM consumer built from the npm package.


Search controllers retain their UIKit-managed transition and are excluded from the ordinary control acquisition crossfade.
