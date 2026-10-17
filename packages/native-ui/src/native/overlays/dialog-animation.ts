import type { Animation } from '@ionic/core';
import { createAnimation } from '@ionic/core/components/index.js';
import { iosPopoverEnterAnimation } from '@rdlabo/ionic-theme-utils';
import type { Frame } from '../definitions';
import { dismissAnimation } from './dismiss-animation';

export type Dialog = HTMLIonPopoverElement;

/** Prepare the source's final layout while SwiftUI owns visible motion. */
export const nativeDialogAnimation = (overlay: Dialog, close: () => Promise<void>, anchor: Promise<Frame | undefined>) => {
  const enterAnimation = overlay.enterAnimation;
  const builder = enterAnimation ?? iosPopoverEnterAnimation;
  overlay.enterAnimation = (base, options) => {
    const animation = createAnimation();
    const play = animation.play;
    animation.play = async () => {
      const frame = await anchor;
      const proxy = overlay.ownerDocument.createElement('ion-button');
      if (frame) proxy.getBoundingClientRect = () => new DOMRect(frame.x, frame.y, frame.width, frame.height);
      // The real trigger is display:none while projected. Use only a detached
      // measurement proxy; never replace or mutate the application's button.
      const positioned = frame ? { ...options, trigger: proxy } : options;
      animation.addAnimation(builder(base, positioned));
      const finishWithoutMotion = (item: Animation) => {
        item.duration(0).delay(0);
        item.childAnimations.forEach(finishWithoutMotion);
      };
      finishWithoutMotion(animation);
      // Ionic owns this wrapper and destroys its children on dismissal.
      await play({ sync: true });
    };
    return animation;
  };
  const leaveAnimation = overlay.leaveAnimation;
  const opacity = overlay.style.opacity;
  const event = 'ionPopoverWillDismiss';
  const dismiss = () => {
    const closing = close();
    overlay.leaveAnimation = () => dismissAnimation(closing);
  };
  overlay.addEventListener(event, dismiss);
  return {
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
