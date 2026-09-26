import { createIosTransitionAnimation, shadow } from '@rdlabo/ionic-theme-utils';
import type { Animation } from '@ionic/core';
import type { TransitionOptions } from './index';
import { getIonPageElement } from './index';
import { withNativeUIShellTransition } from '../native-integration/transition';

export { shadow };

export interface IosTransitionConfig {
  radius: number;
}

const transitionConfig = {
  offLeftPercent: 30,
  getIonPageElement,
  shouldAnimateFixedBackButton: (navEl: HTMLElement) => !navEl.closest('ion-app.ios-theme-vertical-bars'),
  radius: 0,
};

export const setConfig = (config: Partial<IosTransitionConfig>): void => {
  Object.assign(transitionConfig, config);
};

export const iosTransitionAnimation: (navEl: HTMLElement, opts: TransitionOptions) => Animation = withNativeUIShellTransition(
  createIosTransitionAnimation<TransitionOptions>(transitionConfig),
);
