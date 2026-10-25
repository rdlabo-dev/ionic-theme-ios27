import type { CoveredSnapshots } from '../shared/covered-snapshot';

/** Only a blocking Web backdrop may replace live background controls with pixels. */
export const usesCoveredBackground = (element: HTMLElement): boolean => {
  if (!element.matches('ion-modal, ion-popover, ion-alert, ion-action-sheet, ion-loading, ion-picker')) return false;
  const overlay = element as HTMLIonModalElement;
  if (overlay.showBackdrop === false) return false;
  if (!element.matches('ion-modal')) return true;
  return overlay.initialBreakpoint === undefined || overlay.initialBreakpoint > (overlay.backdropBreakpoint ?? 0);
};

/** The prepared image is optional; Ionic presentation never waits for it. */
export const coverOverlayBackground = (element: HTMLElement, snapshots: CoveredSnapshots) => {
  if (usesCoveredBackground(element))
    snapshots.begin(element.matches('ion-modal') ? (element as HTMLIonModalElement).presentingElement : undefined);
  else snapshots.retireRestoration();
};
