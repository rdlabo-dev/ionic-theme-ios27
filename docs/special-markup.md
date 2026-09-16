---
title: Special markup and classes
---

# Special markup and classes

Most Ionic markup works without changes. The combinations below are explicit opt-ins provided by the theme.

## Primary submit buttons

Solid primary submit buttons use `--ion-color-primary-brightness` for their foreground and border treatment. Define a value with sufficient contrast for your primary color.

```css
:root {
  --ion-color-primary-brightness: #96feff;
}
```

```html preview
<ion-button type="submit" color="primary">Submit</ion-button>
<ion-button class="button-submit" fill="solid" color="primary">Continue</ion-button>
```

Use `.button-submit` when the button needs the same treatment but cannot use `type="submit"`.

## Alert and action-sheet actions

For the prominent action in an alert, use `role: 'preferred'`. It uses the primary
background and contrast color; it does not change the submit-button brightness
palette. Keep actions in the intended reading and keyboard order:

```ts
const buttons = [
  { text: 'Cancel', role: 'cancel' },
  { text: 'OK', role: 'preferred', handler: () => confirm() },
];
```

Action sheets use Ionic's existing `role: 'selected'` for this emphasis. Other
actions stay neutral or destructive. The theme follows the centered, unanchored
`UIAlertController` presentation measured on iOS 26.1/26.5. Use `ion-popover` for
an anchored menu. `ios-theme-disabled` / `ios26-disabled` retain the original
Ionic presentation. Long content remains scrollable. Optional measured animation
builders are described in [Experimental animation](./experimental-animation.md);
CSS alone does not replace Ionic's enter/leave animations.

## Tab bar position

Add one of `tab-bar-position-start`, `tab-bar-position-center`, or `tab-bar-position-end` to an iOS `ion-tab-bar` to position the whole bar within its safe area. These classes work with both `slot="top"` and `slot="bottom"` and preserve the bar's width and press animation. Start and end follow the text direction (reversed in RTL). Without a class, the theme uses its default placement.

```html
<ion-tab-bar slot="bottom" class="tab-bar-position-center">
  <ion-tab-button tab="home">Home</ion-tab-button>
  <ion-tab-button tab="settings">Settings</ion-tab-button>
</ion-tab-bar>
```

These classes do not reposition a separate `ion-fab`; leave room for it when choosing the bar's position.

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

Add `.segment-expand` when segment buttons should divide the available width evenly. The class also changes the Liquid Glass effect sizing when `registerSegmentEffect` is used.

```html preview
<ion-segment class="segment-expand" value="new">
  <ion-segment-button value="new"><ion-label>New</ion-label></ion-segment-button>
  <ion-segment-button value="replied"><ion-label>Replied</ion-label></ion-segment-button>
</ion-segment>
```

## Classic search bar in a condense header

The theme gives iOS search bars the iOS 26 appearance by default. Add `.searchbar-classic` to the search field shown beneath a large title in an `ion-header` with `collapse="condense"`. It uses the conventional filled iOS appearance and collapses with the large title instead of remaining in the fixed header.

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

```html preview
<ion-button>iOS 26 theme</ion-button> <ion-button class="ios-theme-disabled">Standard Ionic button</ion-button>
```

For the background model behind inset lists, see [Using `ion-item-group`](https://docs.rdlabo.dev/projects/ionic-theme-ios26/docs/using-ion-item-group).

`ios26-disabled` remains supported as a deprecated alias for `ios-theme-disabled`.
