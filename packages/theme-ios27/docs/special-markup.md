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

Choose the role by action semantics:

| Role                 | Appearance and behavior                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `preferred`          | Filled primary action; dismissal reports `preferred`. Does not automatically select or invoke it. |
| No role or `default` | Normal text color.                                                                                |
| `cancel`             | Retains Ionic's cancellation behavior.                                                            |
| `selected`           | Retains selection state.                                                                          |
| `destructive`        | Uses `--ios-theme-destructive-color`.                                                             |
| `confirm`            | Not treated as preferred. Use `preferred` for a recommended action, not simply any confirmation.  |

## Floating iPad sheets

Choose the sheet's scrolling behavior with `expandToScroll`:

| Setting          | iPad appearance                               | Scrolling and resizing                                                                                                                                     |
| ---------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `false`          | Floating lower corners and a 20px bottom gap. | Content scrolls within the current breakpoint; dragging the handle resizes the sheet. Ionic sizes the visible page at each breakpoint so CSS can style it. |
| `true` (default) | Ionic's bottom-attached layout.               | Scroll-to-expand behavior.                                                                                                                                 |

## Tab bar position

Choose a class on an iOS `ion-tab-bar` to position the whole bar within its safe area:

| Class                     | Placement                       |
| ------------------------- | ------------------------------- |
| `tab-bar-position-start`  | Start of the reading direction. |
| `tab-bar-position-center` | Center.                         |
| `tab-bar-position-end`    | End of the reading direction.   |
| None                      | Existing placement unchanged.   |

All three classes support `slot="top"` and `slot="bottom"`, preserve width and press animation, and resolve start/end in RTL.

```html
<ion-tab-bar slot="bottom" class="tab-bar-position-center">
  <ion-tab-button tab="home">Home</ion-tab-button>
  <ion-tab-button tab="settings">Settings</ion-tab-button>
</ion-tab-bar>
```

These classes do not reposition a separate `ion-fab`; leave room for it when choosing the bar's position.

## Support iPhone Duo

iPhone Duo support, including standalone Vertical Bars, is stable starting with version 2.0.0.

iPhone Duo support — the vertical system rail, hinge posture, and the posture-driven split-pane layout — is independent of the iOS 27 theme and the full Native UI. See [iPhone Duo support](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo.md) for the complete setup, including device-layout monitoring without a projection runtime.

See [Vertical Bars](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/capacitor-native-ui/docs/vertical-bars.md) for rail layout classes, control eligibility and native button appearance.

For standalone setup while keeping your existing theme, see [iPhone Duo with your existing theme](https://github.com/rdlabo-dev/ionic-theme-ios27/blob/main/packages/theme-ios27/docs/iphone-duo-with-original-theme.md).

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

### Segment size and press behavior

| Placement                                 | Minimum height | Container behavior                                               |
| ----------------------------------------- | -------------- | ---------------------------------------------------------------- |
| In content                                | 32px           | Compact, flat background and indicator; outer bounds stay fixed. |
| Inside `ion-toolbar`                      | 48px           | Glass container; outer container scales while pressed.           |
| `.segment-expand`, including in a toolbar | 32px           | Compact, flat background and indicator; outer bounds stay fixed. |

The optional moving glass lens is independent of the container's background.

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

## Opting out

Add `.ios-theme-disabled` to an individual Ionic component when it must retain Ionic's standard iOS styling.

`.ios26-disabled` is deprecated but remains supported as an alias with the same behavior. Use `.ios-theme-disabled` for new code.

```html preview
<ion-button>iOS 27 theme</ion-button> <ion-button class="ios-theme-disabled">Standard Ionic button</ion-button>
```

For the background model behind inset lists, see [Using `ion-item-group`](using-ion-item-group.md).
