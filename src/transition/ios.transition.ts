import { createIosTransitionAnimation, shadow } from '@rdlabo/ionic-theme-utils';
import type { Animation } from '@ionic/core';
import type { TransitionOptions } from './index';
import { getIonPageElement } from './index';
import { connectNativeUIShellTransition } from '../native-integration';

export { shadow };

export const iosTransitionAnimation: (navEl: HTMLElement, opts: TransitionOptions) => Animation =
  createIosTransitionAnimation<TransitionOptions>({
    offLeftPercent: 30,
    getIonPageElement,
    connectNativeUIShellTransition,
  });
