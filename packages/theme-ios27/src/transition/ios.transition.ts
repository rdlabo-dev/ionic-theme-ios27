import { createIosTransitionAnimation, shadow } from '@rdlabo/ionic-theme-utils';
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

export const iosTransitionAnimation: (navEl: HTMLElement, opts: TransitionOptions) => Animation = withNativeUITransition(
  createIosTransitionAnimation<TransitionOptions>(transitionConfig),
);
