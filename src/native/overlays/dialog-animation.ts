import { dismissAnimation } from './dismiss-animation';

export type Dialog = HTMLIonPopoverElement | HTMLIonAlertElement;

/** Hide the emptied source surface once the relay hosts the same live content. */
export const nativeDialogAnimation = (overlay: Dialog, close: () => Promise<void>) => {
  const leaveAnimation = overlay.leaveAnimation;
  const opacity = overlay.style.opacity;
  const event = overlay.localName === 'ion-popover' ? 'ionPopoverWillDismiss' : 'ionAlertWillDismiss';
  const dismiss = () => {
    const closing = close();
    overlay.leaveAnimation = () => dismissAnimation(closing);
  };
  overlay.addEventListener(event, dismiss);
  return {
    // Called only after the relay adopts the content: the Web enter animation
    // stays visible until the native surface replaces the same pixels.
    hide() {
      overlay.style.opacity = '0';
    },
    stop() {
      overlay.removeEventListener(event, dismiss);
      overlay.leaveAnimation = leaveAnimation;
      overlay.style.opacity = opacity;
    },
  };
};
