---
title: Adaptive iOS themes
---

# Adaptive iOS themes

Use CSS feature queries to choose a theme while keeping Ionic's default iOS styles on older browsers. The newer theme branch uses `overflow-anchor` support; see the [MDN `overflow-anchor` documentation](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-anchor).

These checks detect browser capabilities, not the operating system version. Other browsers may support the same features. Keep Ionic mode and platform-specific animation configuration consistent with your application.

## Load only the iOS 27 theme

In your global Sass stylesheet, use `meta.load-css` inside the feature query. Unlike `@use`, it can emit the theme inside `@supports`.

```scss
@use 'sass:meta';

@supports (overflow-anchor: auto) {
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/default-variables');
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/ionic-theme-ios27');
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/ionic-theme-ios27-dark-class');
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/md-remove-ios-class-effect');
}
```

Configure animations from the same package as in the [README](https://docs.rdlabo.dev/projects/ionic-theme-ios27#configure-animations).

## Use the iOS 26 and iOS 27 themes together

Install both packages:

```bash
npm install @rdlabo/ionic-theme-ios26 @rdlabo/ionic-theme-ios27
```

Use this global Sass configuration instead of unconditional theme imports:

```scss
@use 'sass:meta';

@supports (overflow-anchor: auto) {
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/default-variables');
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/ionic-theme-ios27');
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/ionic-theme-ios27-dark-class');
  @include meta.load-css('@rdlabo/ionic-theme-ios27/src/styles/md-remove-ios-class-effect');
}

@supports (text-wrap: pretty) and (not (overflow-anchor: auto)) {
  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/default-variables');
  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/ionic-theme-ios26');
  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/ionic-theme-ios26-dark-class');
  @include meta.load-css('@rdlabo/ionic-theme-ios26/src/styles/md-remove-ios-class-effect');
}
```

The branches are mutually exclusive. Browsers without either feature retain Ionic's default styling. The `text-wrap: pretty` check preserves the earlier theme's capability-based fallback when `overflow-anchor` is unavailable.

Both examples use class-based dark mode. Load Ionic's matching dark palette in your application; for system or always-dark mode, replace the `-dark-class` imports with the matching variant. If you also use `md-ion-list-inset`, load the corresponding package's stylesheet inside each branch.

### Page transition and overlay animations

When both packages are installed, keep **page transition** (`navAnimation`) on the iOS 27 animation. Styles still follow the feature queries above; only the transition stays on `@rdlabo/ionic-theme-ios27`. Use the same package for popover enter/leave so overlay motion stays consistent with that transition.

```ts
async function loadIOSAnimations() {
  if (typeof CSS === 'undefined') {
    return {};
  }

  // Styles are adaptive; apply iOS theme animations when either generation matches.
  if (!CSS.supports('overflow-anchor: auto') && !CSS.supports('text-wrap: pretty')) {
    return {};
  }

  const { iosTransitionAnimation, popoverEnterAnimation, popoverLeaveAnimation } = await import('@rdlabo/ionic-theme-ios27');

  return {
    navAnimation: iosTransitionAnimation,
    popoverEnter: popoverEnterAnimation,
    popoverLeave: popoverLeaveAnimation,
  };
}

// In your browser bootstrap, before initializing Ionic:
const animations = isPlatform('ios') ? await loadIOSAnimations() : {};
provideIonicAngular({ ...animations });
```

Import `isPlatform` and `provideIonicAngular` from your Ionic Angular entry point as shown in the README. Pass the same options to `setupIonicReact` or `IonicVue` when using those frameworks. In server-rendered apps, run the selection during browser initialization.
