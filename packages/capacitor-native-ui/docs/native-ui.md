---
title: Native UI
---

# Native UI

Native UI is **officially supported starting with 2.0.0**. The earlier Native UI Shell Preview was bundled with theme versions 1.2.0 and 1.2.1; this guide describes the split package and its renamed API. See [migration](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/migration#native-ui-naming-changes). App-local [extensions](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/native-ui-extensions) remain experimental.

Native UI gives an Ionic app native navigation and action controls around its Web content. The optional Capacitor iOS plugin renders supported fixed Ionic controls with UIKit or SwiftUI and the system's Liquid Glass material. Page content, scrolling, application state and routing remain in Ionic's WebView.

Read [how projection works](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/readme#how-projection-works) for the shared DOM and native presentation model. Use this page as the supported-control and API reference. For first-time installation and a working example, start with [Ionic setup](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/setup) or [HTML setup](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/framework-independent).

## Enable Native UI

Already using the iOS theme? Follow [Add Native UI to your theme](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/add-native-ui). For other Web appearances, use [Native UI setup](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/setup).

Install the native package as a direct application dependency so Capacitor can discover it:

```bash
npm install @rdlabo/capacitor-native-ui @erkamyaman/capacitor-foldable
npx cap sync ios
```

Keep your existing Web styles and enable Native UI once at application startup. The iOS 27 theme is optional:

```ts
import { enableNativeUI } from '@rdlabo/capacitor-native-ui';

void enableNativeUI();
```

`enableNativeUI()` also reads the WebView's effective top-left corner radius and applies it to page transitions. To configure only the transition without enabling native controls, call:

```ts
import { configureNativeTransition } from '@rdlabo/capacitor-native-ui';

await configureNativeTransition();
```

### Navigation and native builds

| Setup                               | Action                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Theme's `iosTransitionAnimation`    | Keep it; native transitions are already coordinated.                                                                                  |
| Ionic default or custom animation   | Configure the [transition adapter](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/migration#native-ui-transition-adapter). |
| Plugin installed or updated         | Run `npx cap sync ios`, then rebuild the native app.                                                                                  |
| SPM or CocoaPods                    | Keep the existing dependency manager; both are supported.                                                                             |
| Optional CocoaPods-to-SPM migration | Run `npx cap spm-migration-assistant`, then link the generated `CapApp-SPM` package to the app target in Xcode.                       |
| Ordinary native glass               | Requires Xcode 26+, Capacitor 8 and iOS 26+.                                                                                          |
| Web, Android, SSR or older iOS      | Retain the Web implementation.                                                                                                        |

No per-page registration, component list, native callback or Swift view controller is required.

This is an opt-in feature. The ordinary `@rdlabo/ionic-theme-ios27` theme entry point does not import Capacitor. Native runtime entry points require `@capacitor/core`, including in browser builds. Native sources are still detected and built by Capacitor's sync when `@rdlabo/capacitor-native-ui` is a direct dependency of a Capacitor project, even if the application does not call `enableNativeUI()`.

Native light/dark appearance is resolved from each source element’s computed style. See [Light and dark appearance](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/appearance) for theme inheritance, priority, live updates and the shared Vertical Bars behavior.

## Connection recovery

Supporting iOS binaries share one connection check across ordinary controls, Vertical Bars, extensions and native popovers. While the document is visible, it runs once per second without measuring layout. It checks the native session, acknowledged revision, attached surfaces and event subscriptions, including while an overlay retains page updates.

Lost subscriptions are replaced without duplicate callbacks. Lost native state is rebuilt from the current Web state; clicks, submissions and extension actions are never replayed. Connection checks run serially with a five-second timeout; timing out does not cancel the underlying bridge request. Three consecutive failed checks stop native projection and restore Web rendering, including when update synchronization is already waiting for reconnection. A successful check resets this failure budget. After repeated update failures, a successful connection check permits another state synchronization; a persistent update error retains the existing Web fallback instead of retrying updates indefinitely. Older binaries keep their existing event and update-retry behavior.

## Toolbar selection and grouping

Use `controls` to choose selection and grouping by placement:

```ts
const shell = await enableNativeUI({
  controls: {
    buttonGroup: 'verticalOnly',
    button: true,
    backButton: true,
  },
});
```

Here, ordinary toolbar actions project individually and eligible rail actions can group. All six control fields accept `true`, `false`, `'horizontalOnly'`, or `'verticalOnly'`; omitted fields are `true`. For all automatic controls only in the rail, use `controls: 'verticalOnly'`. See [selection defaults](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/configuration#selection-defaults) for the complete table.

`button` selects ordinary actions inside or outside a group, including menu buttons. `buttonGroup` only groups already selected actions. With `buttonGroup: true, button: false`, no ordinary action projects without explicit selection. `backButton` independently selects back navigation, including back buttons inside `ion-buttons`; back buttons never join ordinary groups.

`ionic.auto` enables or disables automatic Ionic discovery. Explicit `data-native-ui` sources and extensions remain independent of both `controls` and `ionic.auto`.

Restart the runtime to change these startup options.

| Attribute              | Applies in              | `true`                                                 | `false`                                                   |
| ---------------------- | ----------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `data-horizontal-bars` | Ordinary placement      | Select the action, or allow grouping on `ion-buttons`. | Exclude the action, or disable grouping on `ion-buttons`. |
| `data-vertical-bars`   | Vertical rail placement | Select the action, or allow grouping on `ion-buttons`. | Exclude the action, or disable grouping on `ion-buttons`. |

On a button/back button these attributes control selection; on `ion-buttons` they control grouping only. Neither is inherited. Missing, invalid or empty values use the matching `controls` default. Vertical action opt-ins and their eligibility rules are detailed in [Vertical Bars](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/vertical-bars#explicit-action-selection-and-local-grouping).

```html
<ion-buttons data-horizontal-bars="false" data-vertical-bars="true">
  <ion-button fill="clear">First</ion-button>
  <ion-button fill="clear">Second</ion-button>
</ion-buttons>
```

The horizontal actions above project individually when otherwise eligible.
The vertical attribute allows grouping but does not select the text-only children;
add `data-vertical-bars="true"` to each button to select them explicitly.

These settings do not remove CSS or change the source layout. If the app removes
the source group's glass styling, `controls: { buttonGroup: 'verticalOnly' }` also prevents a
shared native group surface. Existing component-mode, fixed-toolbar,
fill/color and shell opt-out requirements still apply. A horizontal clear button
inside `ion-buttons` can project individually when grouping is disabled or the
whole group does not qualify. Back buttons never become ordinary group members.
Horizontal local overrides are re-evaluated live; vertical placement retains its
per-page-visit rules. `data-projection="source|system"` remains a separate native
vertical appearance setting.

The standalone `enableVerticalControlArea()` defaults `controls` to `'verticalOnly'`. Explicit sources and extensions remain independent. Use one startup entry per application.

## Supported markup

The table below describes the ordinary Native UI. Vertical Bars uses the separate [toolbar action rules](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/vertical-bars#toolbar-actions).

| Ionic component                               | Supported appearance and placement                                                                        | Native rendering                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `ion-button`                                  | `fill="default"`, or clear inside an ungrouped `ion-buttons`, in a fixed header/footer toolbar            | Glass `UIButton`                                                      |
| `ion-buttons`                                 | Fixed toolbar, two or more direct clear `ion-button` / `ion-menu-button` children sharing the theme glass | One `UIGlassEffect` surface with independent native buttons           |
| `ion-back-button`                             | Standard icon and color in a fixed header/footer toolbar                                                  | Glass `UIButton`, using the resolved Ionic label/icon                 |
| `ion-menu-button`                             | Fixed toolbar, inside the theme glass `ion-buttons`                                                       | Glass `UIButton`; original Ionic menu toggle                          |
| `ion-tab-bar`                                 | Fixed tabs, icon-only/label-only items, one icon per item, dot/text badges, selection and disabled state  | `UITabBar` and `UITabBarItem`                                         |
| `ion-segment`                                 | Fixed toolbar, non-scrollable, text **or** one icon per item                                              | `UISegmentedControl`                                                  |
| `ion-fab` / `ion-fab-button` / `ion-fab-list` | Glass FAB in an `ion-content` fixed slot; one main button and optional directional lists                  | Persistent glass `UIButton` per button; one FAB synchronization group |

For the ordinary Native UI, only supported iOS-mode components are eligible. Theme variables are not required; calling `enableNativeUI()` opts into native projection. Explicitly enabled Vertical Bars is mode-independent as described below. `ios-theme-disabled` and the legacy `ios26-disabled` on an element or ancestor always exclude it. A disabled theme on one tab/segment item keeps its whole group on the Web.

### Opt out of native projection

Use `data-native-ui="disabled"` (or the equivalent `native-ui-disabled` class) to disable only the iOS Native UI while keeping the Web theme. It excludes the element and all its descendants. Adding or removing the attribute or class at runtime automatically restores Web rendering or re-evaluates native eligibility.

Only the exact value `disabled` opts out; an empty or unknown value does not opt out. Remove the attribute to restore automatic Ionic projection. For explicitly declared HTML controls, restore the original `data-native-ui="button"` or `data-native-ui="back-button"` value instead. Alternatively, set `data-native-ui="disabled"` on a parent to disable a subtree while preserving its children's declarations. If the `native-ui-disabled` class is also present, remove it as well. This does not disable clicks or change the Web theme. The runtime-owned `data-native-ui-projected` marker is separate; applications should not set it. For the previous opt-out attribute, see [migration](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/migration#native-ui-naming-changes).

```html
<ion-toolbar data-native-ui="disabled">
  <ion-button>Web glass button</ion-button>
</ion-toolbar>
```

In ordinary placement, an explicit `data-native-ui="disabled"` or `.native-ui-disabled` opt-out inside a shared surface keeps that surface and its children on the Web, including button groups, tab bars, segments and FAB lists. This is different from disabling grouping with `buttonGroup`. Opting out of the search FAB or any part of the search footer disables native search integration; the tab bar can still render natively if it remains eligible.

### Placement requirements

Glass appearance alone is not enough. Ordinary projection requires fixed controls:

| Control or location                                                                                    | Eligibility                                                                                                                         |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Buttons, back buttons, menu-button groups and segments                                                 | Toolbar directly inside `ion-header` or `ion-footer`, with no `ion-content` ancestor around the control.                            |
| Buttons directly inside a header/footer, standalone toolbars, or toolbars/headers in scrolling content | Stay on the Web.                                                                                                                    |
| FAB                                                                                                    | Must use the `ion-content` fixed slot.                                                                                              |
| Back button with `.ios-theme-vertical-bars` enabled                                                    | Can project outside a fixed toolbar, including routed content or a persistent app shell. Vertical Bars does not require `ios` mode. |
| Condense headers, opted-out controls and departed pages                                                | Excluded.                                                                                                                           |
| Full-width foreground modal                                                                            | Can participate in Vertical Bars; other overlay surfaces keep their own layout.                                                     |

Placement follows the control’s structural role, not the presence of a `collapse` attribute. Fixed headers and footers remain eligible with `collapse="fade"`: fading their background does not make their controls scroll. Headers and footers inside `ion-content`, and condense headers (the scrolling duplicate in Ionic’s large-title layout), do not provide fixed toolbar controls. When fixed and condense headers coexist, only the fixed header’s back button is selected. Vertical Bars can still select a standalone back button in routed content or a persistent shell; this does not make scrolling header/footer controls eligible.

Moving a projected control to an excluded location restores its Web rendering; moving it back re-evaluates eligibility. The application chooses where to enable Vertical Bars and which Ionic component mode to use.

### Tab layout

| Source layout                                                        | Result                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------- |
| Equal-width items with the default `layout="icon-top"`               | Native stacked icon/label layout, including iPad and landscape. |
| `icon-start`, `icon-end`, `icon-bottom`, `icon-hide` or `label-hide` | Entire tab bar stays on the Web.                                |
| Unequal item widths                                                  | Entire tab bar stays on the Web.                                |
| Start, center or end placement                                       | Follows the source bar, including RTL.                          |
| Directional `ion-icon` artwork                                       | Preserves its rendered RTL flip.                                |

The native bar uses local compact horizontal and regular vertical size classes without changing the app's size class. Label size and weight follow the Web snapshot.

### Ordinary button grouping

These rules apply outside Vertical Bars:

| Source or setting                                            | Result                                                                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Clear button inside `ion-buttons`                            | Can project individually.                                                                                         |
| Standalone clear, solid or outline button                    | Stays on the Web.                                                                                                 |
| Grouping enabled with two or more eligible clear buttons     | One native surface with separate actions. Menu buttons can join.                                                  |
| Single menu button                                           | Uses its parent group as the surface.                                                                             |
| Grouping disabled, mixed fills or unsupported group children | Eligible actions can still project individually. Explicit subtree opt-outs follow the shared-surface rules above. |
| Back button                                                  | Never joins an ordinary action group.                                                                             |

### Unsupported content

The following remain on the Web; the plugin does not translate arbitrary application CSS into UIKit styles:

| Area       | Unsupported configuration                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons    | Custom button colors or custom back icons/colors.                                                                                     |
| Containers | Collapsing headers, toolbars inside scrolling content, and ordinary modal content. See the separate Vertical Bars modal policy below. |
| Segments   | Scrollable/expanded segments and segment-view integration.                                                                            |
| Content    | Complex slots and unsupported SVG features.                                                                                           |

### Backgrounds and fallback handoffs

Native glass samples the Web content actually drawn behind it. Existing toolbar backgrounds and header blur still affect that content. For content to scroll beneath a header, use Ionic's normal translucent-header/fullscreen-content layout; the plugin does not move page content or override an application-owned opaque toolbar background.

While a Web input owns the software keyboard, ordinary controls return to Web rendering and are re-evaluated when it closes. This also covers iPad layouts where the keyboard does not move the visual viewport. A native search field keeps its own native keyboard and search surface.

When an existing control becomes unsupported, its Web source is painted before its native cover is removed. This avoids a blank handoff, but Web/UIKit updates are not atomic and can briefly overlap. This boundary behavior differs from ordinary page navigation, where unchanged shared native tabs are retained.

## State and events

### Menu actions

Menu buttons use Ionic's resolved default/configured icon or a supported slot icon/label. Native activation clicks the original `ion-menu-button`, preserving `menu` targeting. Non-default menu button types (`submit` / `reset`) remain on the Web. `disabled`, `autoHide`, menu availability and split-pane visibility follow the actual DOM. Opening a menu restores Web controls and retires their native covers; closing it reprojects eligible controls.

### Tab geometry and state updates

The DOM owns labels, SVG content, placement, selected values and application behavior. `ion-tab-bar` itself is the placement reference; UIKit owns internal margins and platter sizing. After projection, the runtime applies the measured native width to the Web bar and retains it during Web fallback. Layout requests still use the original CSS width, preventing repeated projection from progressively shrinking the bar. Viewport, placement and source changes invalidate the measurement; destroying the runtime restores the original CSS. Older native binaries that do not report widths retain the theme's sizing.

| Source or viewport                                                          | Native behavior                                                                  |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Source bar rectangle                                                        | Sizing proposal and placement anchor, accounting for UIKit's larger outer frame. |
| `tab-bar-position-start`, `tab-bar-position-center`, `tab-bar-position-end` | Horizontal anchor, including RTL; class changes reconcile automatically.         |
| `slot="bottom"` / `slot="top"`                                              | Retains the corresponding bottom/top edge.                                       |
| Supported stacked layout and label typography                               | Follow the Web snapshot. UIKit can cap content width even with fill positioning. |
| Badge or title updates                                                      | Retain native item identities and remeasure at the same anchor.                  |
| Different native width or height                                            | Does not reject projection; icons are not stretched to force CSS item widths.    |
| Unrecognized native layout                                                  | Restores Web rendering.                                                          |

The Web theme's standard appearance targets are:

| Measurement                              | Target                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 2 / 3 tabs                               | Minimum platter widths near 188 / 274pt, expanding for long labels within the available viewport width. |
| Viewport at least 768px wide, 4 / 5 tabs | Platter widths near 336 / 414pt respectively. Smaller viewports retain phone sizing.                    |
| Bar height                               | 62pt                                                                                                    |
| Selection height / inset                 | 54pt / 4pt                                                                                              |
| Adjacent buttons                         | Overlap like UIKit controls.                                                                            |

These targets do not guarantee identical custom fonts, icons or labels; UIKit determines intrinsic width. Icon and label alignment is checked against simulator screenshots. The plugin measures the native tab subtree without private class names or fixed inset corrections.

The runtime rechecks:

- Structural changes, affected shadow roots and sizing.
- Page lifecycle events and overlays.
- Ancestor `display: none`, `hidden`, theme classes, component removal and disabled changes.

Native touch events are checked against the current DOM and revision before clicking the original Ionic element.

### Forms and segment values

For forms, retain `ion-button type="submit"` and the form's existing submit handler. An external form is still passed as `[form]="formRef"`. The plugin does not call `form.submit()`, add a second submit path or change Angular form ownership. Segment values retain their original type because the original `ion-segment-button` is clicked; programmatic value changes do not emit a synthetic `ionChange`.

### Text and artwork

Labels use native text. Local static SVGs and resolved `ion-icon` SVGs (including `name` and changes to `name`) are rasterized at the display scale and cached. Source projection preserves their colors; system projection of vertical toolbar buttons uses template icons tinted by SwiftUI. Tab SVGs that follow text color use native template rendering, so icons and labels change selection color together without waiting for another bridge image. Multicolor tab artwork retains its original colors. External references, `<use>`, animation, embedded HTML/images, SVG text and stylesheets are excluded. Web fonts and arbitrary slot layouts are not reproduced exactly.

### Touch, badges and accessibility

The native host accepts input only within native controls. Tab interaction and accessibility are provided by the standard [UITabBar](https://developer.apple.com/documentation/uikit/uitabbar) control. Empty areas pass touches to the WebView. Ionic iOS hides empty badges by default. An empty visible `ion-badge` becomes a native notification dot; a non-empty badge displays its text. Badge background and text colors come from computed DOM styles, including Ionic `color` palettes. Hidden or removed badges clear the native badge. Tabs use UIKit’s standard tab control for selection, touch behavior, badges and accessibility, retaining item identity across selection updates. UIKit owns the item layout within the measured bar, so arbitrary CSS item placement is not reproduced. Native controls expose names, disabled/selected traits and badges to accessibility; the source is hidden from Web accessibility while projected. This is not a guarantee of identical VoiceOver traversal between Web and UIKit.

## Searchable tabs

Existing `attachTabBarSearchable(tabBar, fabButton, footer)` registrations automatically use native search when their bottom tab bar and glass search controls are supported. No new component option, route, native setup or page listener is required. Ordinary tab bars continue using `UITabBar`; horizontal searchable groups use a persistent `UITabBarController`, `UITab` / `UISearchTab`, and `UISearchController`. The original Capacitor WebView continues to render results and handle navigation.

With vertical bars, the native rail keeps every tab and its selection. SwiftUI’s `searchable` and `searchToolbarBehavior(.minimize)` provide the system search button, field, dismissal control and transitions within the same native navigation surface. Apple determines their placement for the current device layout and focuses the native field when system search opens. Input, focus, clear and submit events use the same bridge as horizontal search. As soon as vertical bars are enabled, the Web projection places the registered search button above visible vertical tabs, or at the bottom of the rail when the tabs are hidden, and forwards activation to the original FAB. Native search replaces that Web projection when available. The Web search presentation also preserves vertical tabs.

Search registration does not bypass placement restrictions. Its searchbar and close button must be in fixed footer toolbars. Its trigger must belong to an `ion-fab[slot="fixed"]` directly inside `ion-content`, or directly on the existing non-scrolling `.ion-page` layout. A wrapper inside scrolling content is not a fixed slot.

For horizontal tabs, once a supported search layout has been measured, Native UI keeps the searchable controller while the registration is alive, including when the page is transitioning or temporarily unavailable (`available: false`). A first registration on a hidden page keeps ordinary tabs until the search controls can be measured. The same controller manages resting tabs and active search. When resting, its view is fitted to the source `ion-tab-bar` to preserve the ordinary tab platter’s source width. UIKit can limit the platter width for small tab groups. UIKit owns the search button's placement beside the tabs. If UIKit cannot fit a horizontal search group to the source layout, search stays on the Web. Eligible tabs remain native unless they would cover the Web search trigger; overlapping tabs also stay on the Web. Register before the destination page finishes entering (for example in `ionViewWillEnter`); projection begins once its search controls can be measured.

Opening search preserves the selected Ionic tab and does not automatically show the keyboard (`automaticallyActivatesSearch` stays off). Tap the field or call `ion-searchbar.setFocus()` for the keyboard. While search is active, Native UI freezes Web layout projection and holds Capacitor Keyboard resize at `none`; UIKit owns tab/search chrome without frame fitting during the session. Closing search restores the ordinary tabs to their source placement. Ordinary native tabs keep an optimistic selection until the Web `selected` state catches up. Input events and application `value` updates continue across the bridge until search closes. The trigger's resolved SVG, accessibility label and the search icon are projected from Ionic, including `ion-icon name`.

Native edits pass through Ionic's input handlers, preserving `ionInput` debounce, `ionChange`, `ionFocus`, `ionBlur`, and `ionClear`. Programmatic `value` changes do not emit `ionInput`; synchronous application corrections and stale native input are distinguished. Native editing owns marked text and the caret. Returning through the footer's close action retains the value and does not emit `ionCancel` or `ionClear`.

### Supported search configuration

| Area                       | Native support                                                      | Remains on the Web                                                                                         |
| -------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Search group               | Registered searchable tabs with an iOS-mode glass searchbar.        | General standalone searchbars and classic searchbars.                                                      |
| Keyboard and text settings | Standard search keyboard and default autocorrection/capitalization. | Custom input modes, return-key hints, min/max length, autocomplete, autocorrection or spellcheck settings. |
| Clear/cancel controls      | Default clear control, no internal cancel button.                   | Custom clear icons or an internal cancel button.                                                           |
| State and focus            | Synchronizes `disabled`, `placeholder`, `value` and `setFocus()`.   | Unsupported group configurations use Web rendering.                                                        |

### Search lifetime and recovery

Page retirement, overlays, theme exclusion and lost native ownership close the native presentation and preserve the latest synchronized/application value. A later search starts from that closed state. The registration survives cached page transitions; reattaching on every return is not required. Bridge waits are finite. When an opening request loses the bridge, its pending Enter can complete through the existing Web animation. A disconnected bridge cannot recover native characters that were never delivered to JavaScript.

Replacing the registered `ion-searchbar` or its input retires the old editing session. The replacement keeps its own application value and starts a new native session when reopened.

While enabled, Native UI suppresses the WebView’s top scroll-edge effect because Ionic already paints the header edge. This prevents a second dark gradient when the OS and Web themes differ. The original setting is restored on destroy.

The native search controller remains visible over its own keyboard. Other projected controls are hidden while a Web input opens the keyboard. UIKit's own accessibility and Reduce Motion behavior apply to the standard controls; full VoiceOver traversal is not a verified parity guarantee.

Native tabs, including searchable tabs and Vertical Bars, use the selected Ionic tab button's computed foreground color as the native selection tint. This follows `--color-selected`, per-tab overrides and light/dark theme changes without requiring a separate RGB palette token. Without a selected tab or a supported computed RGB color, they use the system tint. Tab bars with an Ionic `color` palette also keep the system tint: their Web contrast color assumes a colored background that the native glass does not reproduce. Normal and disabled colors, labels and glass backgrounds follow the native design; colored Web backgrounds are not reproduced.

## FAB behavior

FABs retain Ionic's `activated`, per-child `show`, `close()` and original click handlers. Multiple lists, initial expansion, small buttons and `edge` use each button's measured layout. The native side reflects Ionic's staggered visibility without adding another timer or open/close controller. Main-button icon changes crossfade using the resolved `closeIcon`; Reduce Motion disables this crossfade. Native FAB button instances persist across open/close updates. The source FAB stays projected throughout ordinary opening and closing.

### FAB eligibility

One unsupported child keeps the whole FAB on the Web, even when its list is closed.

| Area       | Supported                                                         | Remains on the Web                                              |
| ---------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Appearance | Standard circular glass.                                          | Colored solid buttons or custom host backgrounds/shapes/motion. |
| Content    | Text and resolved static SVG/`ion-icon`, including RTL mirroring. | Unsupported artwork.                                            |
| Actions    | Original click handlers.                                          | Submit/reset or `href` FABs.                                    |
| Placement  | `slot="fixed"` on a direct child of `ion-content`.                | Non-fixed placement or `slot="fixed"` on a page sibling.        |

For example, the demo's red-background `floating-action-button-fixed` page retains its Web appearance.

Custom host animation or transition declarations on the FAB, list or button keep the group on the Web until removed. Button transforms support the standard identity and hidden-child scale(0), not custom scaling. For children inside a `display:none` list, browsers can report a computed transform of `none` even when a custom transform is declared. Such transforms are checked when layout becomes available; the whole FAB then returns to Web if needed. The plugin does not parse application stylesheets or temporarily open lists to predict hidden layout.

## Transitions and recovery

The built-in `iosTransitionAnimation` prepares native controls before starting the Web animation. Supported fixed toolbar controls remain native; moving page controls return to Web presentation. Interactive progress and completion/cancellation are queued while preparation is in progress. Stationary shared tabs are retained. First render and transitions without an animation builder are covered by the startup runtime and Ionic lifecycle events. Default Ionic and custom navigation builders can use the same integration through `withNativeUITransition()`, exported by `@rdlabo/ionic-theme-ios27`. See [Connect your navigation animation](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/ionic-vertical-bars#2-connect-your-navigation-animation) for the setup.

Ordinary native/Web handoffs share a 180ms opacity crossfade, including Vertical Bars in both directions. Outgoing visuals cannot receive input or accessibility focus. Reduce Motion and modal presentation use immediate handoffs; search controllers keep their UIKit-managed transition.

Tab switches skip the Web/native crossfade so a retiring UIKit snapshot cannot linger over the next tab. Detection uses the router URL versus the still-selected tab on `ionViewWillLeave` (and vanilla `ionTabsWillChange` / `ionTabsDidChange` DOM events). With the navigation adapter, Vertical Bars use native push/pop toolbar animations; during an interactive swipe they retain the source toolbar until the gesture commits. Horizontal toolbar navigation retains corresponding native surfaces, prepares new destinations natively, and fades unmatched outgoing surfaces in place with page progress. Cancellation reverses the fade. The exit uses opacity; it does not reproduce the system navigation bar’s blur effect. See [toolbar button correspondence](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/configuration#toolbar-button-correspondence) for identity rules and older native binary behavior.

Standard Ionic overlays suspend ordinary native projection until dismissal. Vertical Bars use a separate policy:

| Surface or condition                                                                                      | Vertical Bars behavior                                                                                |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Web toast, ordinary popover or legacy picker overlay                                                      | Keep the native rail visible, updated and interactive.                                                |
| Popover opened from a Vertical Bars button, rendered on Web                                               | Return the rail to Web projection until dismissal, including native rejection or preparation failure. |
| Alert, action sheet or loading                                                                            | Restore Web rendering so the overlay and its dimming backdrop cover the controls correctly.           |
| Menu                                                                                                      | Keep the existing native rail behavior.                                                               |
| Full-width foreground modal                                                                               | Project the modal's controls instead of the covered page's controls.                                  |
| Modal that cannot use Vertical Bars                                                                       | Restore Web rendering.                                                                                |
| Explicit suspension, unavailable native layout, hidden document or unsupported keyboard/viewport geometry | Preserve the existing fallback behavior.                                                              |

Native projection resumes only after every overlay requiring Web rendering closes. The opt-in native Vertical Bars popover described below keeps its own SwiftUI presentation and input handling. Unsupported searchable-tab configurations use the existing Web animation and share this ownership with Web glass gestures. CSS motion of supported containing surfaces also causes temporary Web rendering.

During retirement, the source is restored and allowed to paint before its native cover is removed. During acquisition, the source is hidden only after a successful, current native response. Delayed responses are revalidated per control: existing eligible controls retain their native cover while content updates catch up. Only removed or ineligible sources return to Web; newly acquired sources require an exact acknowledgement. Ordinary page mutations never call the global clear operation. UIKit tab instances and items are retained, and equal frames/selections are not reapplied. Duplicate/stale activations are discarded. WebKit and UIKit still render separately: the implementation avoids an intentional blank frame, but does not provide an OS-level atomic compositing guarantee. Validate custom transitions and overlays on the app's supported simulators before rollout; unknown overlay systems are outside the automatic integration contract.

After one bridge update failure, the runtime keeps the connection and retries state synchronization once using the latest DOM. It does not replay clicks or application actions. Normal successful updates retain snapshot deduplication. The retry can delay fallback by one additional update attempt; each bridge update has a five-second timeout, while an enclosing navigation flush retains its existing five-second deadline. On binaries supporting shared connection recovery, a failed retry or revision mismatch waits for a successful handshake before one more synchronization attempt; three consecutive failed handshakes or another failed synchronization restore Web rendering. Older binaries restore Web rendering immediately after the failed retry or revision mismatch. An expired navigation deadline also stops native projection. Once stopped, it does not automatically reconnect. `getStatus().reason` reports the failure; while the Web fallback remains active, the public handle reports `state: 'web'`, not `stopped`. To retry deliberately, call `destroy()` on that handle and then `enableNativeUI()` again.

Failures or timeouts in required startup bridge calls return a Web fallback handle. Optional WebView metrics may fail without disabling native controls. `destroy()` waits for teardown; repeated calls share its completion. A new activation requested while teardown is running waits for it, including when the application calls `destroy()` without awaiting it. Await these promises when the next application operation depends on cleanup, and handle any rejection.

For diagnostics or application teardown:

```ts
const shell = await enableNativeUI(); // repeated calls share the runtime
console.log(shell.getStatus()); // state, projected control count, update count, failure reason
await shell.destroy(); // restore DOM, remove native controls and release listeners/cache
```

Projection is enabled by calling the startup API. Partial settings override defaults:

```ts
const shell = await enableNativeUI({ controls: { tabs: false } }); // automatic Ionic projection except tabs
await shell.disableVerticalControlArea(); // retain ordinary native controls
await shell.enableVerticalControlArea();
await shell.destroy(); // stop all projection
```

See [all configuration options](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/configuration) for defaults, rail-only usage and lifecycle methods. For explicit HTML sources without Ionic, see [framework-independent setup](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/framework-independent).

### Popovers anchored to Vertical Bars

**Native popover presentation is Vertical Bars only.** It requires an accepted native Vertical Bars `ion-button` anchor; enabling `ionic.verticalBars.popover` does not make ordinary toolbar or body popovers native. This feature also works with the standalone Vertical Bars runtime, without enabling the full Native UI.

Enable `ionic.verticalBars.popover` to present popovers from accepted native Vertical Bars `ion-button` controls. Automatic Ionic button projection is enabled by default; when `ionic.auto` is `false`, mark individual anchors with `data-native-ui="button"`:

```ts
await enableNativeUI({
  ionic: { verticalBars: { popover: true } },
});
```

The same option is available through `enableVerticalControlArea()`. Use an `ion-popover` whose `trigger` identifies the projected button, or pass that button's click event to `PopoverController.create({ event, ... })`. The button must be accepted by native Vertical Bars; regular toolbar buttons, body controls, and missing or rejected anchors retain Ionic's Web presentation.

When Vertical Bars return to Web rendering, the runtime measures the current native back button, toolbar actions and tab surfaces before retiring them. Web fallback uses those rectangles and paints before native removal. Measurements are tied to the source elements and viewport; unavailable measurements use the CSS layout. This aligns placement and size, but the Web glass and icon rendering can still differ from system materials.

The page's native controls stay projected throughout preparation, presentation and dismissal. If the same native anchor accepts a tap while Ionic is still dismissing, one activation is retained and revalidated after cleanup; repeated taps coalesce. The relay prepares its child WebView while Ionic initializes the content, completes the Web enter animation without motion behind the hidden source host, and presents through the button's standard SwiftUI popover. It does not resize or reparent the source WebView. Ionic retains its controller, lifecycle, live application handlers and dismissal data; the live content temporarily moves into the child document and is restored during cleanup.

Native popovers participate in the shared connection recovery described above. A missed native dismissal is reconciled with Ionic. If presentation is lost while Ionic still requires it (including `backdropDismiss: false`), the adapter reconnects the same live content without replaying the opening action. An unavailable anchor restores the Web content and releases retained controls.

Only one popover is relayed at a time. A nested popover or modal created in the child document is moved as a live element back to the source document before the child closes, including overlays appended outside the relayed content. It continues as a Web overlay with its handlers and dismissal data; its presentation event is not replayed. Opening another overlay or menu, leaving the page, suspending the shell, or losing the native layout restores Web rendering. Modal, sheet and alert relay are outside this feature.

Native presentation owns the arrow, corners and animation; custom Web enter/leave animations do not replace them. The source enter builder runs once with zero duration and delay (including child animations), using the native anchor rectangle for the default `reference="trigger"` layout and visible state for Web fallback. Explicit `reference="event"` retains Ionic’s event-coordinate semantics. An explicit `enterAnimation` is honored; otherwise this package’s iOS popover builder is used. Set `enterAnimation` on the overlay to use a custom builder rather than relying on global `popoverEnter` configuration. Material Design (`md`) popovers keep Ionic’s Web presentation. Initial content dimensions come from Ionic.

#### Popover fallback conditions

The relay copies document and popover shadow styles and preserves content border spacing. Before presentation, it compares selected computed layout and appearance properties at the source dimensions.

| Condition                                                 | Result                         |
| --------------------------------------------------------- | ------------------------------ |
| Detected style/layout differences                         | Restores the live Web popover. |
| Unsupported ancestor visual effects or size containers    | Restores the live Web popover. |
| Content exceeds 1,000 elements                            | Restores the live Web popover. |
| Mirrored ancestor attributes or source head styles change | Restores Web rendering.        |
| Preparation fails or the native anchor is unavailable     | Restores the Web popover.      |

A rail-button popover falling back to Web also returns the rail to Web projection until dismissal. This compatibility check does not guarantee arbitrary CSS (including pseudo-elements and dynamic CSSOM changes), document-bound queries, or full VoiceOver/hardware-keyboard parity.

### Custom overlay suspension

For a custom modal or overlay that Native UI cannot detect, acquire a suspension before presenting it. The resolved suspension means projected controls have returned to Web rendering. Always release it after dismissal:

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

## Support iPhone Duo

iPhone Duo support, including standalone Vertical Bars, is stable starting with version 2.0.0.

The standalone Vertical Control Area entry point (`@rdlabo/capacitor-native-ui/vertical-bars`) works with application-supplied Web layout. The theme package offers an [optional rail stylesheet](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/vertical-bars-layout), `@rdlabo/ionic-theme-ios27/dist/css/vertical-bars.css`, which can be used without loading the full iOS 27 appearance. Call `enableNativeUI({ controls: 'verticalOnly' })` for this use case; its default selection targets controls placed in the vertical area. Apps already calling `enableNativeUI()` should keep that single runtime rather than starting both. See [Device layout and split panes](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/vertical-bars-layout) for the complete setup, including hinge posture and the split-pane layout for apps that do not use this shell at all.

Vertical Bars uses a SwiftUI `TabView` and toolbar in the system rail. Ionic remains the source of labels, icons, selected/disabled state and actions. See [Vertical Bars](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/vertical-bars) for rail layout, native fallback and supported overlays.

In Vertical Bars, automatic selection of fixed-toolbar `ion-button` actions requires an `ion-icon` or SVG with `slot="icon-only"`; `data-vertical-bars="true"` can explicitly select other supported buttons. All fills and Ionic colors are eligible; submit buttons follow the same placement rule. Add `.ios-theme-horizontal-only` to a button or its `ion-buttons` group to keep it horizontal. See [Toolbar actions](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/vertical-bars#toolbar-actions) for placement and exclusion rules.

**Native button appearance:** Native vertical buttons default to `buttonProjection: 'system'`. Use `source` to project Ionic fill and colors, with `data-projection="source|system"` or the equivalent `ios-theme-projection-source` / `ios-theme-projection-system` classes for local exceptions. These settings affect native vertical `ion-button` and `ion-menu-button` actions only. Horizontal controls and Web clones keep their existing behavior. See [Choose button appearance](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/vertical-bars#choose-button-appearance) for priority and fill rules.

For standalone setup while keeping your existing theme, see [iPhone Duo with your existing theme](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/ionic-vertical-bars).

## Native UI API

The generated reference below documents the handle returned by `enableNativeUI()`. The underlying Capacitor bridge and its control-snapshot protocol are implementation details.

<docgen-index>

- [`enableVerticalControlArea()`](#enableverticalcontrolarea)
- [`disableVerticalControlArea()`](#disableverticalcontrolarea)
- [`markForCheck()`](#markforcheck)
- [`getStatus()`](#getstatus)
- [`suspend()`](#suspend)
- [`destroy()`](#destroy)
- [Interfaces](#interfaces)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

A running shell. Placement changes preserve all other startup settings.

### enableVerticalControlArea()

```typescript
enableVerticalControlArea() => Promise<void>
```

Enable rail projection when available, preserving other settings. Rejects after destroy.

---

### disableVerticalControlArea()

```typescript
disableVerticalControlArea() => Promise<void>
```

Restore rail sources to the Web without stopping ordinary native controls. Rejects after destroy.

---

### markForCheck()

```typescript
markForCheck() => void
```

Schedule a source recheck. Calls coalesce; unchanged snapshots are not sent. No-op after destroy or without a runtime.

---

### getStatus()

```typescript
getStatus() => NativeUIStatus
```

Returns the current Web/native projection state.

**Returns:** <code><a href="#nativeuistatus">NativeUIStatus</a></code>

---

### suspend()

```typescript
suspend() => Promise<NativeUISuspension>
```

Restores projected controls to the Web until the returned lease is resumed.

**Returns:** <code>Promise&lt;<a href="#nativeuisuspension">NativeUISuspension</a>&gt;</code>

---

### destroy()

```typescript
destroy() => Promise<void>
```

Stops synchronization, restores Web controls and releases native resources.

---

### Interfaces

#### NativeUIStatus

| Prop            | Type                                        |
| --------------- | ------------------------------------------- |
| **`state`**     | <code>'native' \| 'stopped' \| 'web'</code> |
| **`projected`** | <code>number</code>                         |
| **`updates`**   | <code>number</code>                         |
| **`reason`**    | <code>string</code>                         |

#### NativeUISuspension

| Method     | Signature                    | Description                                                                                    |
| ---------- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| **resume** | () =&gt; Promise&lt;void&gt; | Releases this suspension. Native projection resumes after all active suspensions are released. |

</docgen-api>
