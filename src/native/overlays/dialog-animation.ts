import { dismissAnimation } from './dismiss-animation';

export type Dialog = HTMLIonPopoverElement | HTMLIonAlertElement;

/** Hide the source surface while UIKit presents the same live content. */
export const nativeDialogAnimation = (overlay: Dialog, close: () => Promise<void>) => {
  const animated = overlay.animated;
  const leaveAnimation = overlay.leaveAnimation;
  const opacity = overlay.style.opacity;
  overlay.animated = false;
  overlay.style.opacity = '0';
  const event = overlay.localName === 'ion-popover' ? 'ionPopoverWillDismiss' : 'ionAlertWillDismiss';
  const dismiss = () => {
    const closing = close();
    overlay.leaveAnimation = () => dismissAnimation(closing);
  };
  overlay.addEventListener(event, dismiss);
  return () => {
    overlay.removeEventListener(event, dismiss);
    overlay.animated = animated;
    overlay.leaveAnimation = leaveAnimation;
    overlay.style.opacity = opacity;
  };
};
