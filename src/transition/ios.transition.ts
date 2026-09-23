import { createIosTransitionAnimation, shadow } from '@rdlabo/ionic-theme-utils';
import type { Animation } from '@ionic/core';
import type { TransitionOptions } from './index';
import { getIonPageElement } from './index';
import { connectNativeUIShellTransition } from '../native-integration';

export { shadow };

export interface IosTransitionConfig {
  radius: number;
}

const transitionConfig = {
  offLeftPercent: 30,
  getIonPageElement,
  connectNativeUIShellTransition,
  shouldAnimateFixedBackButton: (navEl: HTMLElement) => !navEl.closest(':is(ion-app, body).ios-theme-enable-foldable'),
  radius: 0,
};

export const setConfig = (config: Partial<IosTransitionConfig>): void => {
  Object.assign(transitionConfig, config);
};

export const iosTransitionAnimation: (navEl: HTMLElement, opts: TransitionOptions) => Animation =
  createIosTransitionAnimation<TransitionOptions>(transitionConfig);
