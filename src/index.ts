import { registeredEffect } from './sheets-of-glass/interfaces';
import { registerEffect } from './sheets-of-glass';
export * from './sheets-of-glass/interfaces';
export { iosEnterAnimation as popoverEnterAnimation } from './popover/animations/ios.enter';
export { iosLeaveAnimation as popoverLeaveAnimation } from './popover/animations/ios.leave';
export * from './tab-bar-searchable';
export * from './transition/ios.transition';

export { registerSegmentEffect } from './segment';

export { registerButtonEffect } from './button';
export { alertEnterAnimation, alertLeaveAnimation, actionSheetEnterAnimation, actionSheetLeaveAnimation } from './overlay';

export const registerTabBarEffect = (targetElement: HTMLElement): registeredEffect | undefined => {
  return registerEffect(targetElement, 'ion-tab-button', 'tab-selected', {
    small: 'scale(1.1, 1)',
    medium: 'scale(1.2)',
    large: 'scale(1.3)',
    xlarge: 'scale(1.15, 1.4)',
  });
};
