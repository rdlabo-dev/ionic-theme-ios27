import { registeredEffect } from './sheets-of-glass/interfaces.js';
import { registerEffect } from './sheets-of-glass/index.js';
export * from './sheets-of-glass/interfaces.js';
export {
  iosPopoverEnterAnimation as popoverEnterAnimation,
  iosPopoverLeaveAnimation as popoverLeaveAnimation,
} from '@rdlabo/ionic-theme-utils';
export * from './tab-bar-searchable/index.js';
export * from './searchbar/index.js';
export * from './transition/ios.transition.js';
export { registerSegmentEffect } from './segment/index.js';

export const registerTabBarEffect = (targetElement: HTMLElement): registeredEffect | undefined => {
  const win = targetElement.ownerDocument.defaultView;
  if (!targetElement.classList.contains('ios') || !win) return undefined;
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  let effect: registeredEffect | undefined;
  const update = () => {
    effect?.destroy();
    effect = reducedMotion.matches
      ? undefined
      : registerEffect(targetElement, 'ion-tab-button', 'tab-selected', {
          small: 'scale(1.1, 1)',
          medium: 'scale(1.2)',
          large: 'scale(1.15, 1.4)',
          xlarge: 'scale(1.3)',
        });
  };
  update();
  reducedMotion.addEventListener('change', update);
  return {
    destroy: () => {
      reducedMotion.removeEventListener('change', update);
      effect?.destroy();
      effect = undefined;
    },
  };
};
