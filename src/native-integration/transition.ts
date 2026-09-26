import type { AnimationBuilder } from '@ionic/core';
import { connectNativeUIShellTransition } from './index';

/**
 * Keeps an existing Ionic navigation animation and coordinates native control handoff.
 * Register the returned builder as navAnimation. Do not use it for overlay animations.
 */
export const withNativeUIShellTransition =
  (builder: AnimationBuilder): AnimationBuilder =>
  (baseEl, opts) => {
    const animation = builder(baseEl, opts);
    if (opts?.enteringEl) connectNativeUIShellTransition(animation, opts.enteringEl, opts.leavingEl);
    return animation;
  };
