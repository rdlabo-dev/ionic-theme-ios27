import { moveContent } from './content';

/** Keep Ionic's host registered; its existing wrapper retains input and button handlers. */
export const relayAlert = (overlay: HTMLIonAlertElement, destination: HTMLElement) => {
  const doc = destination.ownerDocument;
  const root = doc.createElement('ion-alert');
  for (const attribute of Array.from(overlay.attributes)) root.setAttribute(attribute.name, attribute.value);
  Object.assign(root.style, { visibility: 'visible', opacity: '1', pointerEvents: 'auto' });
  destination.append(root);
  const restore = moveContent(Array.from(overlay.children) as HTMLElement[], root);
  const backdrop = () => {
    if (overlay.backdropDismiss) void overlay.dismiss(undefined, 'backdrop');
  };
  root.addEventListener('ionBackdropTap', backdrop);
  return {
    root,
    stop() {
      root.removeEventListener('ionBackdropTap', backdrop);
      restore();
      root.remove();
    },
  };
};
