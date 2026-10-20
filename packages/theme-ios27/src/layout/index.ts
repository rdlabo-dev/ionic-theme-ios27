/** Web layout inputs. Device capabilities belong to the application or native plugin. */
export interface VerticalBarsLayout {
  edge: 'leading' | 'trailing' | null;
  inset?: number;
}

/** Applies only Web layout. Does not enable Native UI or report native availability. */
export const setVerticalBarsLayout = (layout: VerticalBarsLayout, root?: HTMLElement, rtl?: boolean): void => {
  const app = root ?? (typeof document === 'undefined' ? undefined : document.querySelector<HTMLElement>('ion-app'));
  if (!app) return;
  const { edge, inset = 0 } = layout;
  const direction = rtl ?? app.closest('[dir]')?.getAttribute('dir') === 'rtl';
  app.classList.toggle('ios-theme-vertical-bars', edge !== null);
  app.classList.toggle('ios-theme-vertical-bars-left', edge !== null && (edge === 'leading') !== direction);
  if (edge && Number.isFinite(inset) && inset > 0) app.style.setProperty('--ios-theme-vertical-bars-native-inset', `${inset}px`);
  else app.style.removeProperty('--ios-theme-vertical-bars-native-inset');
  app.ownerDocument.defaultView?.dispatchEvent(new Event('nativeUIRefresh'));
};

export interface FoldState {
  state: 'flat' | 'half-opened' | 'closed';
  hingeBounds?: { x: number; y: number; width: number; height: number };
}

/** Maps application-supplied posture to theme CSS, without subscribing to a device plugin. */
export function applyFoldStateClasses(root: HTMLElement, fold: FoldState): void {
  for (const state of ['flat', 'half-opened', 'closed']) root.classList.toggle(`ios-theme-fold-${state}`, fold.state === state);
  root.classList.toggle('ios-theme-fold-expanded', fold.state === 'half-opened' || (fold.state === 'flat' && !!fold.hingeBounds));
}
