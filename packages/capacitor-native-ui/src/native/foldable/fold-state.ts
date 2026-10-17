import type { FoldState } from './types';

/** Keep posture on ion-app so descendants can follow it through CSS. */
export function applyFoldStateClasses(root: HTMLElement, fold: FoldState): void {
  for (const state of ['flat', 'half-opened', 'closed']) {
    root.classList.toggle(`ios-theme-fold-${state}`, fold.state === state);
  }
  root.classList.toggle('ios-theme-fold-expanded', fold.state === 'half-opened' || (fold.state === 'flat' && !!fold.hingeBounds));
}
