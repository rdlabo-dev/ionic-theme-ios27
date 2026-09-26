import { createIosTransitionAnimation, shadow } from '@rdlabo/ionic-theme-utils';
import type { Animation } from '@ionic/core';
import type { TransitionOptions } from './index.js';
import { getIonPageElement } from './index.js';
import { connectNativeUIShellTransition } from '../native-integration/index.js';

export { shadow };

export interface IosTransitionConfig {
  radius: number;
}

const transitionConfig = {
  offLeftPercent: 30,
  getIonPageElement,
  connectNativeUIShellTransition,
  radius: 0,
};

export const setConfig = (config: Partial<IosTransitionConfig>): void => {
  Object.assign(transitionConfig, config);
};

export const iosTransitionAnimation: (navEl: HTMLElement, opts: TransitionOptions) => Animation =
  createIosTransitionAnimation<TransitionOptions>(transitionConfig);
