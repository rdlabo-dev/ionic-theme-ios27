import { bootstrapApplication } from '@angular/platform-browser';
import { createAppConfig, type IonicAnimationOptions } from './app/app.config';
import { AppComponent } from './app/app.component';
import { enableNativeUIShell } from '../../src/native';

const isE2ETesting = typeof window !== 'undefined' && (window as any).IONIC_E2E_TESTING === true;

async function loadIOSAnimations(): Promise<IonicAnimationOptions> {
  if (typeof CSS === 'undefined') return {};
  // E2E pins iOS 27 animations to match the screenshot baseline stylesheet.
  const theme =
    isE2ETesting || CSS.supports('selector(:heading)')
      ? await import('@rdlabo/ionic-theme-ios27')
      : CSS.supports('text-wrap: pretty')
        ? await import('@rdlabo/ionic-theme-ios26')
        : undefined;
  if (!theme) return {};
  return {
    navAnimation: theme.iosTransitionAnimation,
    popoverEnter: theme.popoverEnterAnimation,
    popoverLeave: theme.popoverLeaveAnimation,
  };
}

async function main() {
  const animations = await loadIOSAnimations();
  await bootstrapApplication(AppComponent, createAppConfig(animations));
  void enableNativeUIShell().then((handle) => Object.assign(window, { nativeUIShell: handle }));
}

main().catch((err) => console.error(err));
