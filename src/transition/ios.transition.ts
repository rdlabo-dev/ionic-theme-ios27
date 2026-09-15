import { createIosTransitionAnimation, shadow } from '@rdlabo/ionic-theme-utils';
import type { Animation } from '@ionic/core';
import type { TransitionOptions } from './index';
import { getIonPageElement } from './index';

export { shadow };

// UIKit26 retreats the previous page by 30% without moving/scaling its large title independently.
export const iosTransitionAnimation: (navEl: HTMLElement, opts: TransitionOptions) => Animation =
  createIosTransitionAnimation<TransitionOptions>({
    offLeftPercent: 30,
    getIonPageElement,
  });
