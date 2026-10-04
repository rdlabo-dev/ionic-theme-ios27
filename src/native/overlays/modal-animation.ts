import type { ShellModalPresentation } from '../definitions';
import { dismissAnimation } from './dismiss-animation';
import { preserveModalBackground } from './modal-background';

/** Keep Ionic's gesture setup, but hide the emptied surface once the relay adopts it. */
export const nativeModalAnimation = (
  overlay: HTMLIonModalElement,
  id: string,
  kind: ShellModalPresentation['kind'],
  close: (gesture: boolean) => Promise<void>,
) => {
  const leaveAnimation = overlay.leaveAnimation;
  // Ionic renders the iOS shadow beside the wrapper. Both belong to the
  // relayed surface; only the backdrop stays in the source for normal modals.
  const surfaces = (
    kind !== 'normal' ? [overlay] : Array.from(overlay.shadowRoot!.querySelectorAll<HTMLElement>('.modal-wrapper, .modal-shadow'))
  ).map((element) => ({ element, visibility: element.style.visibility }));
  const restoreBackground = preserveModalBackground(overlay, id);
  const dismiss = (event: Event) => {
    const closing = close((event as CustomEvent).detail.role === 'gesture');
    overlay.leaveAnimation = () => dismissAnimation(closing);
  };
  overlay.addEventListener('ionModalWillDismiss', dismiss);
  return {
    // Called only after the relay adopts the content: the Web enter animation
    // stays visible until the native surface replaces the same pixels.
    hide() {
      for (const { element } of surfaces) element.style.visibility = 'hidden';
    },
    stop(dismissed: boolean) {
      overlay.removeEventListener('ionModalWillDismiss', dismiss);
      overlay.leaveAnimation = leaveAnimation;
      for (const { element, visibility } of surfaces) element.style.visibility = visibility;
      restoreBackground?.(dismissed);
    },
  };
};
