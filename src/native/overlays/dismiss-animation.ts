import { createAnimation } from '@ionic/core/components/index.js';

/** Let Ionic finish dismissal after the native presentation has closed. */
export const dismissAnimation = (closing: Promise<void>) => {
  const animation = createAnimation();
  const play = animation.play;
  animation.play = async (options) => {
    await closing;
    await play(options);
  };
  return animation;
};
