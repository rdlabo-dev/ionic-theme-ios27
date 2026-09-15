---
title: Experimental animation
---

# Experimental animation

These gesture and animation helpers are experimental and optional. The theme works without them.

## Size-aware button press

`registerButtonEffect` adds the measured iOS 26 press/release effect to a hydrated,
standalone `ion-button` or `ion-back-button`. Register after layout (for example,
in `ionViewDidEnter`) and destroy on leave. It does not synthesize clicks or own
form submission. The iOS 26 `--ion-color-primary-brightness` palette is unchanged.

```ts
import { registerButtonEffect } from '@rdlabo/ionic-theme-ios26';

const button = document.querySelector<HTMLElement>('ion-button');
const effect = button ? registerButtonEffect(button) : undefined;
// On page leave / element removal:
effect?.destroy();
```

The current native calibration covers resting heights up to 44pt (28pt and 44pt
fixtures, widths 44–220pt). Clear/outline buttons, themed `ion-buttons` groups and
larger buttons retain their CSS behavior. Disabled buttons and reduced-motion
preferences suppress the optional effect. Duplicate registration is a no-op;
destroy before registering again. This remains experimental: native/Web font,
material and timing residuals are tracked in `demo/native-parity/WORKLOG.md`.

## Centered alert and action-sheet motion

The optional overlay builders reproduce the measured iOS 26.1/26.5 unanchored
`UIAlertController` response: a centered 1.2→1 scale and opacity spring over
approximately 417ms. Dismissal fades in place, rather than sliding offscreen.
They do not implement anchored popovers or add a native bridge.

```ts
import { alertEnterAnimation, alertLeaveAnimation, actionSheetEnterAnimation, actionSheetLeaveAnimation } from '@rdlabo/ionic-theme-ios26';

// Add to your existing Ionic configuration (provideIonicAngular / IonicModule.forRoot):
const overlayAnimations = {
  alertEnter: alertEnterAnimation,
  alertLeave: alertLeaveAnimation,
  actionSheetEnter: actionSheetEnterAnimation,
  actionSheetLeave: actionSheetLeaveAnimation,
};
```

`--backdrop-opacity` remains configurable. Both theme opt-out classes retain
Ionic's default iOS animation; reduced-motion preferences complete without
motion. CSS alone does not replace Ionic's animation builders. Native controller
construction latency, button-press deformation inside the dialog, and glass/text
rendering residuals remain separate from this response curve.

## Sheet of Glass with `ion-tab-button` / `ion-segment-button`

Register an `ion-tab-bar` or `ion-segment` element to add a moving selection effect to its buttons.

[![Sheet of Glass animation on ion-tab-button and ion-segment-button](https://i.gyazo.com/fafd726b520827f042c76b6c73abd81c.gif)](https://gyazo.com/fafd726b520827f042c76b6c73abd81c)

```ts
import { registerTabBarEffect, registerSegmentEffect } from '@rdlabo/ionic-theme-ios26';

/**
 * Register DOM elements. Effects are applied using Ionic Gesture and Ionic Animation.
 */
const tabBar = document.querySelector<HTMLElement>('ion-tab-bar');
const segment = document.querySelector<HTMLElement>('ion-segment');
const registeredTabBarEffect = tabBar ? registerTabBarEffect(tabBar) : undefined;
const registeredSegmentEffect = segment ? registerSegmentEffect(segment) : undefined;

const destroy = () => {
  /**
   * If the registered DOM element is removed (e.g., due to page navigation),
   * make sure to destroy the gesture and animation. This will also remove the event listeners.
   * You can re-register them if needed.
   */
  registeredTabBarEffect?.destroy();
  registeredSegmentEffect?.destroy();
};
```

## TabBarSearchable: Searchable with `ion-tab-bar` and `ion-fab-button`

Use the following structure inside `ion-tabs` to animate a search button into a search toolbar.

[![TabBarSearchable animation expanding search from ion-fab-button into the tab bar](https://i.gyazo.com/06bc63f4a474f9f19f5b1d865f5c2a85.gif)](https://gyazo.com/06bc63f4a474f9f19f5b1d865f5c2a85)

```html
<ion-content>...</ion-content>
<ion-fab vertical="bottom" horizontal="end" slot="fixed">
  <ion-fab-button (click)="present($event)">
    <ion-icon name="search"></ion-icon>
  </ion-fab-button>
</ion-fab>
<ion-footer [translucent]="true">
  <ion-toolbar>
    <ion-buttons slot="start">
      <!-- ion-icon name is set dynamically by the animation -->
      <ion-button fill="default"><ion-icon slot="icon-only"></ion-icon> </ion-button>
    </ion-buttons>
    <!-- User set `ionChange` or other events. -->
    <ion-searchbar (ionChange)="example($event)"></ion-searchbar>
  </ion-toolbar>
</ion-footer>
```

```ts
import { attachTabBarSearchable, TabBarSearchableType } from '@rdlabo/ionic-theme-ios26';
import type { TabBarSearchableFunction } from '@rdlabo/ionic-theme-ios26';

let searchableFun: TabBarSearchableFunction | undefined;
const initialize = () => {
  // attachTabBarSearchable has state. You should initialize per page.
  const tabBar = document.querySelector<HTMLElement>('ion-tab-bar');
  const fabButton = document.querySelector<HTMLElement>('ion-fab-button');
  const footer = document.querySelector<HTMLElement>('ion-footer');
  if (!tabBar || !fabButton || !footer) {
    return;
  }
  searchableFun = attachTabBarSearchable(tabBar, fabButton, footer);
};

const present = (event: Event) => {
  searchableFun!(event, TabBarSearchableType.Enter);
};

const dismiss = (event: Event) => {
  searchableFun!(event, TabBarSearchableType.Leave);
};
```
