import { createAnimation } from '@ionic/core/components/index.js';

/** Let Ionic finish dismissal after the native presentation has closed. */
export const dismissAnimation = (closing: Promise<void>) => {
  const animation = createAnimation();
  const play = animation.play;
  animation.play = async (options) => {
    // A native failure must not suppress Ionic's didDismiss event/data.
    await closing.catch((error) => {
      console.error('Native popover dismissal failed; completing the Ionic lifecycle.', error);
    });
    await play(options);
  };
  return animation;
};
