import { miniPlayer } from './native-ui/mini-player';
import { counter, accessoryCounter } from './native-ui/counter';
import { bootstrapApplication } from '@angular/platform-browser';
import { createAppConfig, type IonicAnimationOptions } from './app/app.config';
import { AppComponent } from './app/app.component';
import { enableNativeUIShell } from '@rdlabo/capacitor-native-ui';
import { setVerticalBarsLayout } from '@rdlabo/ionic-theme-ios27';
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
      const enabled = app.classList.contains('ios-theme-vertical-bars');
      const rtl = app.closest('[dir]')?.getAttribute('dir') === 'rtl';
      const current = app.classList.contains('ios-theme-vertical-bars-left') !== rtl ? 'leading' : 'trailing';
      setVerticalBarsLayout({ edge: enabled ? (verticalBarEdge ?? current) : null, inset });
    };
    await Foldable.addListener('barPlacementChange', applyPlacement);
    applyPlacement(await Foldable.getBarPlacement());
  })
  .catch((err) => console.error(err));
const verticalBarsOnly = stockIonic || new URLSearchParams(window.location.search).has('verticalBarsOnly');
const buttonDefaultFill =
  stockIonic || new URLSearchParams(window.location.search).get('buttonDefaultFill') === 'solid' ? 'solid' : 'glass';
const buttonProjection = new URLSearchParams(window.location.search).get('buttonProjection') === 'source' ? 'source' : 'system';
void enableNativeUIShell({
  extensions: [counter, accessoryCounter, miniPlayer],
  verticalBars: { only: verticalBarsOnly, buttonProjection, buttonDefaultFill, popover: true },
}).then((handle) => {
  const app = document.querySelector('ion-app');
  if (app) Object.assign(app, { nativeUIShell: handle });
});
