import { bootstrapApplication } from '@angular/platform-browser';
import { createAppConfig, type IonicAnimationOptions } from './app/app.config';
import { AppComponent } from './app/app.component';
import { enableNativeUIShell } from '../../src/native';
import { iosTransitionAnimation, popoverEnterAnimation, popoverLeaveAnimation } from '@rdlabo/ionic-theme-ios27';

/**
 * Adaptive CSS selects styles; page transition always uses iOS 27 — see docs/ios-adaptive.md.
 * Resolved synchronously so Ionic's global config is initialized before any element upgrades.
 */
function loadIOSAnimations(): IonicAnimationOptions {
  if (typeof CSS === 'undefined') return {};
  if (!CSS.supports('overflow-anchor: auto') && !CSS.supports('text-wrap: pretty')) return {};

  return {
    navAnimation: iosTransitionAnimation,
    popoverEnter: popoverEnterAnimation,
    popoverLeave: popoverLeaveAnimation,
  };
}

// Demo forces mode: 'ios' (including Playwright), so do not gate on isPlatform('ios').
bootstrapApplication(AppComponent, createAppConfig(loadIOSAnimations())).catch((err) => console.error(err));
void enableNativeUIShell().then((handle) => Object.assign(window, { nativeUIShell: handle }));
