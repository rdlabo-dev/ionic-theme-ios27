import type { ShellModalPresentation } from '../definitions';
import { dismissAnimation } from './dismiss-animation';
import { preserveModalBackground } from './modal-background';

/** Keep Ionic's gesture setup, but let UIKit animate the relayed presentation. */
export const nativeModalAnimation = (
  overlay: HTMLIonModalElement,
  id: string,
  kind: ShellModalPresentation['kind'],
  close: (gesture: boolean) => Promise<void>,
) => {
  const animated = overlay.animated;
  const leaveAnimation = overlay.leaveAnimation;
  // Ionic renders the iOS shadow beside the wrapper. Both belong to the
  // relayed surface; only the backdrop stays in the source for normal modals.
  const surfaces = (
    kind !== 'normal' ? [overlay] : Array.from(overlay.shadowRoot!.querySelectorAll<HTMLElement>('.modal-wrapper, .modal-shadow'))
  ).map((element) => ({ element, visibility: element.style.visibility }));
  const restoreBackground = preserveModalBackground(overlay, id);
  overlay.animated = false;
  for (const { element } of surfaces) element.style.visibility = 'hidden';
  const dismiss = (event: Event) => {
    const closing = close((event as CustomEvent).detail.role === 'gesture');
    overlay.leaveAnimation = () => dismissAnimation(closing);
  };
  overlay.addEventListener('ionModalWillDismiss', dismiss);
  return {
    stop(dismissed: boolean) {
      overlay.removeEventListener('ionModalWillDismiss', dismiss);
      overlay.animated = animated;
      overlay.leaveAnimation = leaveAnimation;
      for (const { element, visibility } of surfaces) element.style.visibility = visibility;
      restoreBackground?.(dismissed);
    },
  };
};
