import { createIosTransitionAnimation, shadow } from '@rdlabo/ionic-theme-utils';
import { createAnimation } from '@ionic/core/components/index.js';
import type { Animation } from '@ionic/core/components';
import type { TransitionOptions } from './index';
import { getIonPageElement } from './index';
import { nativeWebViewMetrics } from '@rdlabo/capacitor-native-ui/integration';
import { withNativeUITransition } from './native-ui';

export { shadow };

export interface IosTransitionConfig {
  radius: number;
}

const transitionConfig = {
  offLeftPercent: 30,
  getIonPageElement,
  shouldAnimateFixedBackButton: (navEl: HTMLElement) => !navEl.closest('ion-app.ios-theme-vertical-bars'),
  get radius() {
    return nativeWebViewMetrics.radius;
  },
};

export const setConfig = (config: Partial<IosTransitionConfig>): void => {
  if (config.radius !== undefined) nativeWebViewMetrics.radius = config.radius;
};

const buildTransition = createIosTransitionAnimation<TransitionOptions>(transitionConfig);
export const iosTransitionAnimation: (navEl: HTMLElement, opts: TransitionOptions) => Animation = withNativeUITransition((navEl, opts) => {
  const animation = buildTransition(navEl, opts);
  const backing = 'var(--ion-background-color, #fff)';
  let ownsBacking = false;
  // Translucent pages expose the outlet as they move. Keep that backing surface
  // in the page theme instead of exposing WKWebView's transparent native backing.
  animation.beforeAddWrite(() => {
    if (navEl.style.backgroundColor) return;
    const style = navEl.ownerDocument.defaultView?.getComputedStyle(navEl);
    if (!style || !['transparent', 'rgba(0, 0, 0, 0)'].includes(style.backgroundColor)) return;
    if (style.backgroundImage && style.backgroundImage !== 'none') return;
    navEl.style.backgroundColor = backing;
    ownsBacking = true;
  });
  const restoreBacking = () => {
    if (ownsBacking && navEl.style.backgroundColor === backing && !navEl.style.getPropertyPriority('background-color'))
      navEl.style.removeProperty('background-color');
    ownsBacking = false;
  };
  animation.afterAddWrite(restoreBacking);
  // Ionic destroy does not run after-write hooks when playback is interrupted.
  const destroy = animation.destroy.bind(animation);
  animation.destroy = (...args) => {
    restoreBacking();
    return destroy(...args);
  };
  // Translucent pages move as a whole, but outgoing toolbar actions still need
  // the same exit fade as opaque headers when they return from native to Web.
  const buttons = opts.leavingEl?.querySelectorAll(
    ':scope > ion-header.header-translucent ion-buttons, :scope > ion-header.header-translucent ion-toolbar > ion-button',
  );
  if (buttons?.length)
    animation.addAnimation(
      createAnimation()
        .addElement(buttons)
        .keyframes([
          { offset: 0, opacity: 1 },
          // Finish the exit before the incoming title occupies this toolbar.
          { offset: 0.5, opacity: 0 },
          { offset: 1, opacity: 0 },
        ]),
    );
  return animation;
});
