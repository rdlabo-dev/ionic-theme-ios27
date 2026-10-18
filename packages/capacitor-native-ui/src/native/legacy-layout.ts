import type { VerticalBarEdge, VerticalBarPlacement } from './definitions';
const physicalVerticalBarEdge = (edge: Exclude<VerticalBarEdge, null>, rtl: boolean) => ((edge === 'leading') !== rtl ? 'left' : 'right');
const elementRtl = (element: Element): boolean => element.closest('[dir]')?.getAttribute('dir') === 'rtl';

/**
 * @deprecated Use the theme setVerticalBarsLayout helper. nativeEdge is ignored; device metrics determine availability.
 * Legacy Web layout adapter; does not report native availability.
 * Pass `rtl` when the document direction is known; otherwise the nearest `dir` attribute is used.
 */
export const setVerticalControlAreaPlacement = (placement: VerticalBarEdge | VerticalBarPlacement, rtl?: boolean): void => {
  if (typeof document === 'undefined') return;
  const app = document.querySelector<HTMLElement>('ion-app');
  if (!app) throw new Error('Vertical Control Area requires ion-app');
  const { edge, inset = 0 } = placement && typeof placement === 'object' ? placement : { edge: placement, inset: 0 };
  app.removeAttribute('data-native-ui-shell-vertical-bars-suspended');
  app.classList.toggle('ios-theme-vertical-bars', edge !== null);
  app.classList.toggle('ios-theme-vertical-bars-left', edge !== null && physicalVerticalBarEdge(edge, rtl ?? elementRtl(app)) === 'left');
  if (edge && Number.isFinite(inset) && inset > 0) app.style.setProperty('--ios-theme-vertical-bars-native-inset', `${inset}px`);
  else app.style.removeProperty('--ios-theme-vertical-bars-native-inset');
  document.defaultView?.dispatchEvent(new Event('nativeUIShellRefresh'));
};
