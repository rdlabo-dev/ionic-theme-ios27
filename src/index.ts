import { registeredEffect } from './sheets-of-glass/interfaces';
import { registerEffect } from './sheets-of-glass';
export * from './sheets-of-glass/interfaces';
export {
  iosPopoverEnterAnimation as popoverEnterAnimation,
  iosPopoverLeaveAnimation as popoverLeaveAnimation,
} from '@rdlabo/ionic-theme-utils';
export * from './tab-bar-searchable';
export * from './searchbar';
export * from './transition/ios.transition';
export { registerSegmentEffect } from './segment';

export const registerTabBarEffect = (targetElement: HTMLElement): registeredEffect | undefined => {
  const win = targetElement.ownerDocument.defaultView;
  if (!targetElement.classList.contains('ios') || !win) return undefined;
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const verticalBarsRoot = targetElement.closest('ion-app');
  let effect: registeredEffect | undefined;
  const update = () => {
    effect?.destroy();
    const isVertical =
      !!verticalBarsRoot?.classList.contains('ios-theme-vertical-bars') && !targetElement.closest('ion-menu, ion-modal, ion-popover');
    effect =
      reducedMotion.matches || isVertical
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
  const placementObserver = new win.MutationObserver(update);
  if (verticalBarsRoot) placementObserver.observe(verticalBarsRoot, { attributes: true, attributeFilter: ['class'] });
  return {
    destroy: () => {
      reducedMotion.removeEventListener('change', update);
      placementObserver?.disconnect();
      effect?.destroy();
      effect = undefined;
    },
  };
};
