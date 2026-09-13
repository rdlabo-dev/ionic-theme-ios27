import { registeredEffect } from './sheets-of-glass/interfaces';
import { registerEffect } from './sheets-of-glass';
export * from './sheets-of-glass/interfaces';
export { iosEnterAnimation as popoverEnterAnimation } from './popover/animations/ios.enter';
export { iosLeaveAnimation as popoverLeaveAnimation } from './popover/animations/ios.leave';
export * from './tab-bar-searchable';
export * from './searchbar';
export * from './transition/ios.transition';
export { registerSegmentEffect } from './segment';

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
