import { getOverlayCoordinator, type OverlayDefinition, type OverlayOptions } from './overlays.js';
export type { OverlayOptions as IonicOverlayOptions } from './overlays.js';
const defaults: readonly OverlayDefinition[] = [
  ...['Modal', 'Popover', 'Alert', 'ActionSheet', 'Loading', 'Picker', 'Toast'].map((name) => ({
    selector: `ion-${name.replace(/[A-Z]/g, (letter, index) => (index ? '-' : '') + letter.toLowerCase())}`,
    events: {
      willPresent: `ion${name}WillPresent`,
      didPresent: `ion${name}DidPresent`,
      willDismiss: `ion${name}WillDismiss`,
      didDismiss: `ion${name}DidDismiss`,
    },
  })),
  { selector: 'ion-modal', events: { change: 'ionBreakpointDidChange' } },
  {
    selector: 'ion-menu',
    events: { willPresent: 'ionWillOpen', didPresent: 'ionDidOpen', willDismiss: 'ionWillClose', didDismiss: 'ionDidClose' },
  },
];
/** Call once at app startup. Repeated default calls share the existing configuration and monitor. */
export const enableSupportIonicOverlays = (options?: OverlayOptions, doc: Document | undefined = globalThis.document) => {
  if (!doc) return;
  const coordinator = getOverlayCoordinator(doc);
  coordinator.enable(defaults, options);
  return coordinator;
};

/** The background surface shares the same order used for registered DOM projections. */
export const ionicModalStack = (doc: Document): HTMLElement[] =>
  getOverlayCoordinator(doc).stack.filter((element) => element.matches('ion-modal'));

export const coveredIonicSurface = (overlay: HTMLElement): HTMLElement | undefined => {
  const stack = ionicModalStack(overlay.ownerDocument);
  return overlay.matches('ion-modal') ? stack[stack.indexOf(overlay) - 1] : stack[stack.length - 1];
};
