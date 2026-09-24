---
title: Special markup and classes
---

# Special markup and classes

Most Ionic markup works without changes. The combinations below are explicit opt-ins provided by the theme.

## Primary submit buttons

Solid submit buttons use the Ionic color's contrast value for their foreground. Their directional edge treatment follows the iOS 27 prominent-button appearance and does not require an additional brightness color.

```html preview
<ion-button type="submit" color="primary">Submit</ion-button>
<ion-button class="button-submit" fill="solid" color="primary">Continue</ion-button>
```

Use `.button-submit` when the button needs the same treatment but cannot use `type="submit"`.

## Preferred overlay actions

For iOS alerts and action sheets, set `role: 'preferred'` on a button to give it a filled `--ion-color-primary` background and `--ion-color-primary-contrast` text and icons. While pressed, the background uses `--ion-color-primary-shade`. This is a theme convention using Ionic's custom button roles; it does not automatically select or invoke the action. Dismissal reports the role as `preferred`.

```ts
buttons: [
  { text: 'Cancel', role: 'cancel' },
  { text: 'Continue', role: 'preferred' },
];
```

Buttons with no role or `default` keep the normal text color. `cancel` retains Ionic's cancellation behavior, `selected` remains a selection state, and `destructive` uses `--ios-theme-destructive-color`. An existing `confirm` role is not treated as preferred. Use `preferred` for the recommended action, not simply any action that confirms a choice.

## Floating iPad sheets

Set `expandToScroll: false` on a sheet modal to use floating lower corners and a 20px bottom gap on iPad. Ionic then sizes the visible page at each breakpoint, so the theme can style it with CSS alone. Content scrolls within the current breakpoint; dragging the handle still resizes the sheet. With the default `expandToScroll: true`, the sheet keeps Ionic's bottom-attached layout and scroll-to-expand behavior.

## Tab bar position

Add one of `tab-bar-position-start`, `tab-bar-position-center`, or `tab-bar-position-end` to an iOS `ion-tab-bar` to position the whole bar within its safe area. These classes work with both `slot="top"` and `slot="bottom"` and preserve the bar's width and press animation. Start and end follow the text direction (reversed in RTL). Without a class, the existing placement is unchanged.

```html
<ion-tab-bar slot="bottom" class="tab-bar-position-center">
  <ion-tab-button tab="home">Home</ion-tab-button>
  <ion-tab-button tab="settings">Settings</ion-tab-button>
</ion-tab-bar>
```

These classes do not reposition a separate `ion-fab`; leave room for it when choosing the bar's position.

## Support iPhone Duo

Load the separate stylesheet and start its projection runtime. The iOS 27 theme stylesheets are **not required**:

```scss
@use '@rdlabo/ionic-theme-ios27/dist/css/vertical-bars.css';
```

```ts
import { enableVerticalControlArea } from '@rdlabo/ionic-theme-ios27/vertical-bars';

void enableVerticalControlArea();
```

Add `.ios-theme-vertical-bars` to the active `ion-app`. Use `body` only when the application has no `ion-app` root:

```html
<ion-app class="ios-theme-vertical-bars">...</ion-app>
```

The class reserves `80px` on the physical right by default, matching the system navigation region measured in the iPhone Duo Simulator. The physical left defaults to `0px`. Override `--ios-theme-vertical-bars-safe-area-left` or `--ios-theme-vertical-bars-safe-area-right` when simulating a different layout.

This keeps routers and component backgrounds full-viewport. `ion-content` moves its scroll foreground, `ion-toolbar` moves its container foreground, and `ion-fab` adjusts only when it is placed beside the system UI. The corresponding Ionic safe-area variable is reset inside those foreground components so descendants do not add the inset again.

`ion-menu`, `ion-modal`, and `ion-popover` are handled as separate surfaces: their internal foreground components do not receive the main-page conversion and retain Ionic's standard safe-area handling. A menu presented beside the system UI keeps Ionic's full-viewport animation host and offsets only its visible container by the corresponding inset; a menu from the opposite side is unchanged. Left and right remain physical coordinates in RTL, while Ionic's `side="start"` and `side="end"` values remain logical.

These values are web-layout simulation inputs. They are independent from Ionic's normal iPhone safe-area variables and do not change ordinary iPhone layouts unless the opt-in class is present.

When the app contains `ion-tabs`, this mode moves its iOS tab bar into the physical right-side reserved region and aligns it above the bottom safe area. The Ionic `slot` value does not select a different position. Without Native UI Shell, the stable Web rail is icon-only, matching a four-tab SwiftUI `TabView` on iPhone Duo. While the user presses and drags across that rail, every icon-and-label tab reveals its label so the pending destination stays identifiable. The Web tab bar receives pointer input in the simulated system region. Use `ion-menu` when navigation should become a sidebar; this mode does not convert tabs into a menu.

On supported iOS versions, `enableVerticalControlArea()` hands eligible tabs, back navigation, menu buttons, and fixed-toolbar actions to a native SwiftUI `TabView` and toolbar. Back navigation can come from outside a fixed toolbar and does not require an `ios` mode class; the application chooses where to enable Vertical Bars and which Ionic component mode to use. The other toolbar actions still require a fixed toolbar. It does not project ordinary Native UI Shell controls outside the vertical area. If the app already uses the full `enableNativeUIShell()`, keep that single runtime instead of starting both. The Ionic controls remain the sources of labels, icons, selected/disabled state, form submission, routing, and click handlers while SwiftUI owns adaptive placement and interaction. Fixed-toolbar actions need an icon or SVG, no direct text node, and standard `fill="default"` or `fill="clear"` to be eligible for the side rail. Text-only actions stay in the original Web toolbar. Add `.ios-theme-horizontal-only` to an `ion-buttons` group or individual `ion-button` to keep it in the Web toolbar. Placement is chosen when a routed page enters; changing an existing button's content does not move it between the toolbar and rail until the page leaves and re-enters. Menus, modals, and popovers retain their own toolbar layout.

On Web, Android, older iOS, or when native projection is unavailable during setup, the Web tab bar and fixed-toolbar clones remain the fallback. Those projections also work when no `ion-tabs` exists; text-only actions stay in the original Web toolbar. Disabling the mode or leaving the page removes the native ownership or Web clones and restores their sources. Override `--ios-theme-vertical-bars-toolbar-top` when the simulated system controls use a different vertical layout.

## Two-line inset list items

Place an unslotted `ion-label` immediately alongside an unslotted `ion-note` to render a two-line item. When using the iOS-style inset-list background, wrap the items in `ion-item-group`; keep `ion-list-header` outside the group.

```html preview
<ion-list inset="true">
  <ion-list-header>
    <ion-label>Connections</ion-label>
  </ion-list-header>
  <ion-item-group>
    <ion-item>
      <ion-label>Network &amp; internet</ion-label>
      <ion-note>Mobile, Wi-Fi, hotspot</ion-note>
    </ion-item>
  </ion-item-group>
</ion-list>
```

Use `slot="end"` on `ion-note` when you want the standard trailing-note layout instead.

## Inset-list section headers

Add `.item-group-header` to an `ion-item-group` to create the centered icon, title, and description used at the top of the component demo pages.

This is an introductory group. Place regular list items in a separate `ion-item-group` that follows it.

```html preview
<ion-list inset="true">
  <ion-item-group class="item-group-header">
    <ion-item>
      <ion-label>
        <ion-icon name="list" style="background: var(--ion-color-primary)"></ion-icon>
        <h2>Lists</h2>
        <ion-text>Inset-list examples</ion-text>
      </ion-label>
    </ion-item>
  </ion-item-group>
  <ion-item-group>
    <ion-item><ion-label>First item</ion-label></ion-item>
  </ion-item-group>
</ion-list>
```

## Full-width segments

Add `.segment-style-glass` to give a segment the same glass surface and selected indicator treatment as the tab bar. The class preserves the segment's existing dimensions and text colors, supports scrollable segments, and respects Ionic's public `--background` property.

```html
<ion-segment class="segment-style-glass" value="available">
  <ion-segment-button value="available">Available</ion-segment-button>
  <ion-segment-button value="away">Away</ion-segment-button>
</ion-segment>
```

For colored segments, use Ionic's `color` property (for example, `color="primary"` or `color="secondary"`). Ionic uses the palette's base color for the softly tinted track while keeping the selected surface and labels neutral. A surrounding colored toolbar only supplies colors when the segment has no color of its own. The optional moving glass inherits the selected surface color, and custom Ionic palettes work without additional registration.

Add `.segment-expand` when segment buttons should divide the available width evenly. The class also changes the Liquid Glass effect sizing when `registerSegmentEffect` is used.

Segments use a 32px minimum height in content and a 48px minimum height inside `ion-toolbar`. `.segment-expand` keeps the compact 32px layout in a toolbar. Compact segments retain Ionic's flat background and indicator colors; only the regular toolbar variant has a glass container and scales its outer container while pressed. Content and expanded segments keep their outer bounds. The optional moving glass lens is independent of the container's background.

```html preview
<ion-segment class="segment-expand" value="new">
  <ion-segment-button value="new"><ion-label>New</ion-label></ion-segment-button>
  <ion-segment-button value="replied"><ion-label>Replied</ion-label></ion-segment-button>
</ion-segment>
```

## Classic search bar in a condense header

The theme gives iOS search bars the iOS 27 appearance by default. Add `.searchbar-classic` to the search field shown beneath a large title in an `ion-header` with `collapse="condense"`. It uses the conventional filled iOS appearance and collapses with the large title instead of remaining in the fixed header.

Place it in a toolbar with a color, such as `color="light"`; the classic background is derived from that color's contrast value.

The example uses Ionic's standard collapsible large-title structure. Scroll the preview to collapse the large title and reveal the fixed header.

```html preview
<div class="ion-page">
  <ion-header translucent="true">
    <ion-toolbar color="light">
      <ion-title>Search</ion-title>
    </ion-toolbar>
  </ion-header>
  <ion-content color="light" fullscreen="true">
    <ion-header collapse="condense">
      <ion-toolbar color="light">
        <ion-title size="large">Search</ion-title>
      </ion-toolbar>
      <ion-toolbar color="light">
        <ion-searchbar class="searchbar-classic" placeholder="Filter results"></ion-searchbar>
      </ion-toolbar>
    </ion-header>
    <ion-list inset="true">
      <ion-item-group>
        <ion-item><ion-label>Recent item 1</ion-label></ion-item>
        <ion-item><ion-label>Recent item 2</ion-label></ion-item>
        <ion-item><ion-label>Recent item 3</ion-label></ion-item>
        <ion-item><ion-label>Recent item 4</ion-label></ion-item>
        <ion-item><ion-label>Recent item 5</ion-label></ion-item>
        <ion-item><ion-label>Recent item 6</ion-label></ion-item>
        <ion-item><ion-label>Recent item 7</ion-label></ion-item>
        <ion-item><ion-label>Recent item 8</ion-label></ion-item>
        <ion-item><ion-label>Recent item 9</ion-label></ion-item>
        <ion-item><ion-label>Recent item 10</ion-label></ion-item>
      </ion-item-group>
    </ion-list>
  </ion-content>
</div>
```

The `.ion-page` wrapper makes this embedded preview behave like a complete routed page. An application using `ion-router-outlet` normally receives that page container automatically. The inset list and its items only provide enough content to demonstrate scrolling; they are not required by `.searchbar-classic`.

## Search-bar toolbars

Add `.toolbar-searchbar` when an `ion-toolbar` combines a search bar with start or end buttons. The class centers the slotted controls and adjusts the spacing around the search field.

```html preview
<ion-toolbar class="toolbar-searchbar">
  <ion-buttons slot="start">
    <ion-button>Cancel</ion-button>
  </ion-buttons>
  <ion-searchbar></ion-searchbar>
</ion-toolbar>
```

## Opting out

Add `.ios-theme-disabled` to an individual Ionic component when it must retain Ionic's standard iOS styling.

`.ios26-disabled` is deprecated but remains supported as an alias with the same behavior. Use `.ios-theme-disabled` for new code.

```html preview
<ion-button>iOS 27 theme</ion-button> <ion-button class="ios-theme-disabled">Standard Ionic button</ion-button>
```

For the background model behind inset lists, see [Using `ion-item-group`](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/using-ion-item-group).
