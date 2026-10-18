---
title: Using ion-item-group
---

# Using `ion-item-group` in inset lists

Most Ionic markup works without changes. When an `ion-list` uses `inset="true"`, wrap its items in `ion-item-group` and keep `ion-list-header` outside the group.

The examples use framework-neutral Web Component markup. In React or Vue, use the equivalent component and property syntax.

```html
<ion-list inset="true">
  <ion-list-header><ion-label>Connections</ion-label></ion-list-header>
  <ion-item-group>
    <ion-item>...</ion-item>
    <ion-item>...</ion-item>
  </ion-item-group>
</ion-list>
```

No wrapper is required for lists that do not use `inset="true"`.

[Check list structure with ESLint](eslint.md).

## Why the wrapper is required

Ionic normally gives `ion-list` its background, which makes `ion-list-header` appear inside the same surface as the items. The iOS 27 layout treats the header and item surface separately.

![Inset list background comparison showing why ion-item-group is required](https://raw.githubusercontent.com/rdlabo-dev/ionic-theme-ios27/v3.0.0/screenshots/why-ion-list-inset.png)

The theme therefore:

- makes the inset `ion-list` background transparent;
- applies the item surface to `ion-item-group`; and
- leaves `ion-list-header` outside that surface.

## Sharing the markup with Material Design

`@rdlabo/ionic-theme-md3` supports the same grouped markup, so one template can be used for both Ionic modes.

When an application uses this package without `@rdlabo/ionic-theme-md3`, import the optional stylesheet to apply the same grouped layout in Material mode:

```css
@import '@rdlabo/ionic-theme-ios27/dist/css/md-ion-list-inset.css';
```

For two-line items and section-header groups, see [Special markup and classes](special-markup.md).
