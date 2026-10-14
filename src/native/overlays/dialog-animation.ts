import { createAnimation } from '@ionic/core/components/index.js';
import { dismissAnimation } from './dismiss-animation';

export type Dialog = HTMLIonPopoverElement;

/** Hide the emptied source surface once the relay hosts the same live content. */
export const nativeDialogAnimation = (overlay: Dialog, close: () => Promise<void>) => {
  const enterAnimation = overlay.enterAnimation;
  overlay.enterAnimation = () => createAnimation();
  const leaveAnimation = overlay.leaveAnimation;
  const opacity = overlay.style.opacity;
  const event = 'ionPopoverWillDismiss';
  const dismiss = () => {
    const closing = close();
    overlay.leaveAnimation = () => dismissAnimation(closing);
  };
  overlay.addEventListener(event, dismiss);
  return {
    // Hide the source surface while the native presentation prepares.
    hide() {
      overlay.style.opacity = '0';
    },
    stop() {
      overlay.removeEventListener(event, dismiss);
      overlay.enterAnimation = enterAnimation;
      overlay.leaveAnimation = leaveAnimation;
      overlay.style.opacity = opacity;
    },
  };
};
