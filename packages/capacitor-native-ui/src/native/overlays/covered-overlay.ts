import type { CoveredSnapshots } from '../shared/covered-snapshot';

export { usesOverlayBackdrop as usesCoveredBackground } from '@rdlabo/capacitor-native-ui-engine';
import { usesOverlayBackdrop as usesCoveredBackground } from '@rdlabo/capacitor-native-ui-engine';

/** The prepared image is optional; Ionic presentation never waits for it. */
export const coverOverlayBackground = (element: HTMLElement, snapshots: CoveredSnapshots) => {
  if (usesCoveredBackground(element))
    snapshots.begin(element.matches('ion-modal') ? (element as HTMLIonModalElement).presentingElement : undefined);
  else snapshots.retireRestoration();
};
