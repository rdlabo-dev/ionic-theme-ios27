# Feature requests for Ionic Framework

## feat(): change `--knob-handle-size` to `--knob-handle-width` / `--knob-handle-height`

Currently, only square sizes are taken into consideration.
Overwriting the `knob` itself is possible, but `--knob-handle-size` cannot be ignored as it plays a crucial role in determining the `top` and `margin-inline-start` of `div.range-knob-handle`.

## feat(): ion-config new property for `collapse`

Currently, `collapse` behavior is automatically enabled in iOS mode, but this should be configurable through `ion-config` for better control.

ex:

```typescript
export interface IonicConfig {
    ...,
    collapseLargeTitle: {
        ios: boolean;
        md: boolean;
        ionic: boolean;
    },
    collapseBackButtonAnimation: {
        ios: boolean;
        md: boolean;
        ionic: boolean;
    },
}
```

## feat(): add native shadow-part for design

### native-inner(or item-inner) part to ion-item

The styling for `ion-item[lines=inset]` is applied to `.item-inner`, which cannot be styled directly. This limitation means that for iOS 27 styling, I can only modify the border-bottom style through `::part(native)` with padding-right, preventing me from utilizing the full right side of `ion-item`. Adding `::part(native-inner)` would increase styling flexibility.

```diff
  <ion-item>
    <button type="button" class="item-native" part="native">
-     <div class="item-inner">
+     <div class="item-inner" part="native-inner">
      ...
      </div>
    </button>
  </ion-item>
```

### native part to ion-toast

Resolved: https://github.com/ionic-team/ionic-framework/pull/30992#event-23306774962

## docs(): Naming conventions for Ionic theme classes

Resolved.

### should disable ion-back-button Animation

Resolved: by created https://github.com/rdlabo-dev/ionic-theme-ios27/tree/main/src/transition

## feat(): ion-content[fullscreen=true] will have .content-fullscreen class

Resolved: https://github.com/ionic-team/ionic-framework/pull/30926

## feat(): add .range-knob-min and .range-knob-max directly to ion-range

Resolved: https://github.com/ionic-team/ionic-framework/pull/30932
