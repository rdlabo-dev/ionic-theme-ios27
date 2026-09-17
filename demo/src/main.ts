import { bootstrapApplication } from '@angular/platform-browser';
import { createAppConfig, type IonicAnimationOptions } from './app/app.config';
import { AppComponent } from './app/app.component';
import { enableNativeUIShell } from '../../src/native';

/** Adaptive CSS selects styles; page transition always uses iOS 27 — see docs/ios-adaptive.md. */
async function loadIOSAnimations(): Promise<IonicAnimationOptions> {
  if (typeof CSS === 'undefined') return {};
  if (!CSS.supports('selector(:open)') && !CSS.supports('text-wrap: pretty')) return {};

  const { iosTransitionAnimation, popoverEnterAnimation, popoverLeaveAnimation } = await import('@rdlabo/ionic-theme-ios27');

  return {
    navAnimation: iosTransitionAnimation,
    popoverEnter: popoverEnterAnimation,
    popoverLeave: popoverLeaveAnimation,
  };
}

async function main() {
  // Demo forces mode: 'ios' (including Playwright), so do not gate on isPlatform('ios').
  const animations = await loadIOSAnimations();
  await bootstrapApplication(AppComponent, createAppConfig(animations));
  void enableNativeUIShell().then((handle) => Object.assign(window, { nativeUIShell: handle }));
}

main().catch((err) => console.error(err));
