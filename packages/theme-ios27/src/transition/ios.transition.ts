import { createIosTransitionAnimation, shadow } from '@rdlabo/ionic-theme-utils';
import { createAnimation } from '@ionic/core/components';
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
