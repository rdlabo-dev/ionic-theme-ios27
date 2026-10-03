import { bootstrapApplication } from '@angular/platform-browser';
import { createAppConfig, type IonicAnimationOptions } from './app/app.config';
import { AppComponent } from './app/app.component';
import { enableNativeUIShell } from '../../src/native';
import { enableVerticalControlArea, setVerticalControlAreaPlacement } from '../../src/vertical-bars';
import { Capacitor } from '@capacitor/core';
import { Foldable, type BarPlacement } from '@erkamyaman/capacitor-foldable';
import { iosTransitionAnimation, popoverEnterAnimation, popoverLeaveAnimation } from '@rdlabo/ionic-theme-ios27';

// The stock-Ionic build exercises vertical bars without loading the iOS theme.
const stockIonic = getComputedStyle(document.documentElement).getPropertyValue('--demo-stock-ionic').trim() === '1';

/**
 * Adaptive CSS selects styles; page transition always uses iOS 27 — see README.md.
 * Resolved synchronously so Ionic's global config is initialized before any element upgrades.
 */
function loadIOSAnimations(): IonicAnimationOptions {
  if (stockIonic || typeof CSS === 'undefined') return {};
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
    const applyPlacement = ({ verticalBarEdge, inset }: BarPlacement) => {
      const app = document.querySelector('ion-app');
      if (!app) return;
      const enabled = app.classList.contains('ios-theme-vertical-bars') || app.hasAttribute('data-native-ui-shell-vertical-bars-suspended');
      const rtl = app.closest('[dir]')?.getAttribute('dir') === 'rtl';
      const current = app.classList.contains('ios-theme-vertical-bars-left') !== rtl ? 'leading' : 'trailing';
      setVerticalControlAreaPlacement({ edge: enabled ? (verticalBarEdge ?? current) : null, nativeEdge: verticalBarEdge, inset });
    };
    await Foldable.addListener('barPlacementChange', applyPlacement);
    applyPlacement(await Foldable.getBarPlacement());
  })
  .catch((err) => console.error(err));
const startShell =
  stockIonic || new URLSearchParams(window.location.search).has('verticalBarsOnly') ? enableVerticalControlArea : enableNativeUIShell;
const buttonDefaultFill = stockIonic || new URLSearchParams(window.location.search).get('buttonDefaultFill') === 'solid' ? 'solid' : null;
const buttonProjection = new URLSearchParams(window.location.search).get('buttonProjection') === 'source' ? 'source' : 'system';
void startShell({
  buttonProjection,
  buttonDefaultFill,
  controls:
    startShell === enableNativeUIShell
      ? { tabs: true, toolbar: true, segment: true, fab: true, modal: true, popover: true, alert: true }
      : undefined,
}).then((handle) => {
  const app = document.querySelector('ion-app');
  if (app) Object.assign(app, { nativeUIShell: handle });
});
