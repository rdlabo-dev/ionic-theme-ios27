import { bootstrapApplication } from '@angular/platform-browser';
import { createAppConfig, type IonicAnimationOptions } from './app/app.config';
import { AppComponent } from './app/app.component';
import { enableNativeUIShell } from '../../src/native';
import { IonicNativeUIShell, enableVerticalControlArea, setVerticalControlAreaPlacement } from '../../src/vertical-bars';
import { Capacitor } from '@capacitor/core';
import { iosTransitionAnimation, popoverEnterAnimation, popoverLeaveAnimation } from '@rdlabo/ionic-theme-ios27';

/**
 * Adaptive CSS selects styles; page transition always uses iOS 27 — see README.md.
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

// Keep the Web fallback available in the demo; applications can choose when to enable it.
void bootstrapApplication(AppComponent, createAppConfig(loadIOSAnimations()))
  .then(async () => {
    if (Capacitor.getPlatform() !== 'ios') return;
    await IonicNativeUIShell.startDeviceLayoutMonitoring();
    await IonicNativeUIShell.addListener('deviceLayoutChange', ({ placement }) => {
      const app = document.querySelector('ion-app.ios-theme-vertical-bars');
      if (app)
        setVerticalControlAreaPlacement(
          placement.edge ? placement : app.classList.contains('ios-theme-vertical-bars-left') ? 'left' : 'right',
        );
    });
  })
  .catch((err) => console.error(err));
const startShell = new URLSearchParams(window.location.search).has('verticalBarsOnly') ? enableVerticalControlArea : enableNativeUIShell;
void startShell().then((handle) => {
  const app = document.querySelector('ion-app');
  if (app) Object.assign(app, { nativeUIShell: handle });
});
