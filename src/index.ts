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
export { withNativeUIShellTransition } from './native-integration/transition';
export { registerSegmentEffect } from './segment';

export const registerTabBarEffect = (targetElement: HTMLElement): registeredEffect | undefined => {
  const win = targetElement.ownerDocument.defaultView;
  if (!targetElement.classList.contains('ios') || !win) return undefined;
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const verticalBarsRoot = targetElement.closest('ion-app');
  let effect: registeredEffect | undefined;
  let placement: 'disabled' | 'horizontal' | 'left' | 'right' | undefined;
  const update = () => {
    const isVertical =
      !!verticalBarsRoot?.classList.contains('ios-theme-vertical-bars') &&
      targetElement.matches('ion-tabs > ion-tab-bar:not(.ios-theme-disabled, .ios26-disabled)') &&
      !targetElement.closest('ion-menu, ion-modal, ion-popover');
    const disabled = reducedMotion.matches || !targetElement.matches('.ios:not(.ios-theme-disabled, .ios26-disabled)');
    const nextPlacement = disabled
      ? 'disabled'
      : isVertical
        ? verticalBarsRoot?.classList.contains('ios-theme-vertical-bars-left')
          ? 'left'
          : 'right'
        : 'horizontal';
    // Gesture/activation classes also change during interaction. Rebuild only when
    // eligibility or placement changes, retaining cancellation when the rail changes sides.
    if (placement === nextPlacement) return;
    placement = nextPlacement;
    effect?.destroy();
    effect = disabled
      ? undefined
      : registerEffect(
          targetElement,
          'ion-tab-button',
          'tab-selected',
          {
            small: 'scale(1.1, 1)',
            medium: 'scale(1.2)',
            large: 'scale(1.15, 1.4)',
            xlarge: 'scale(1.3)',
          },
          isVertical,
        );
  };
  update();
  reducedMotion.addEventListener('change', update);
  const placementObserver = new win.MutationObserver(update);
  if (verticalBarsRoot) placementObserver.observe(verticalBarsRoot, { attributes: true, attributeFilter: ['class'] });
  placementObserver.observe(targetElement, { attributes: true, attributeFilter: ['class'] });
  return {
    destroy: () => {
      reducedMotion.removeEventListener('change', update);
      placementObserver.disconnect();
      effect?.destroy();
      effect = undefined;
    },
  };
};
