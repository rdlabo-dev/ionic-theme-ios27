import type { Animation } from '@ionic/core/components';
import {
  hasNativeUIShellIntegration,
  suspendNativeUIShell,
  VERTICAL_BARS_TRANSITION_CANCELED,
} from '@rdlabo/capacitor-native-ui/integration';
import type { AnimationBuilder } from '@ionic/core/components';

/**
 * Keeps an existing Ionic navigation animation and coordinates native control handoff.
 * Register the returned builder as navAnimation. Do not use it for overlay animations.
 * The builder must return a fresh Animation for each navigation; Ionic destroys it afterward.
 */
export const withNativeUIShellTransition =
  (builder: AnimationBuilder): AnimationBuilder =>
  (baseEl, opts) => {
    const animation = builder(baseEl, opts);
    if (opts?.enteringEl) connectNativeUIShellTransition(animation, opts.enteringEl, opts.leavingEl);
    return animation;
  };

const connectedTransitions = new WeakSet<Animation>();
const cancellationTransitions = new WeakSet<Animation>();

/** Ionic write hooks cannot await the bridge. Gate playback, including interactive playback. */
export const connectNativeUIShellTransition = (animation: Animation, entering: HTMLElement, leaving?: HTMLElement) => {
  if (leaving && !cancellationTransitions.has(animation)) {
    cancellationTransitions.add(animation);
    animation.onFinish((step) => {
      if (step === 0) leaving.dispatchEvent(new CustomEvent(VERTICAL_BARS_TRANSITION_CANCELED, { bubbles: true, detail: { entering } }));
    });
  }
  if (connectedTransitions.has(animation) || !hasNativeUIShellIntegration(entering.ownerDocument)) return;
  connectedTransitions.add(animation);
  const scopes = leaving ? [entering, leaving] : [entering];
  const play = animation.play.bind(animation);
  const progressStart = animation.progressStart.bind(animation);
  const progressStep = animation.progressStep.bind(animation);
  const progressEnd = animation.progressEnd.bind(animation);
  const destroy = animation.destroy.bind(animation);
  let release: ((canceled?: boolean) => void) | undefined;
  let preparation: Promise<void> | undefined;
  let disposed = false;
  let interactiveReady = false;
  let step: number | undefined;
  let end: Parameters<Animation['progressEnd']> | undefined;
  const prepare = () =>
    (preparation ??= suspendNativeUIShell(scopes).then((resume) => {
      if (disposed) resume(true);
      else release = resume;
    }));
  const finish = (canceled = false) => {
    release?.(canceled);
    release = undefined;
    preparation = undefined;
  };
  animation.onFinish((step) => finish(step === 0));
  animation.play = async (options) => {
    await prepare();
    if (disposed) return;
    try {
      await play(options);
    } finally {
      finish();
    }
  };
  animation.progressStart = (...args) => {
    interactiveReady = false;
    step = undefined;
    end = undefined;
    void prepare().then(() => {
      if (disposed) return;
      progressStart(...args);
      interactiveReady = true;
      if (step !== undefined) progressStep(step);
      if (end) progressEnd(...end);
    });
    return animation;
  };
  animation.progressStep = (value) => {
    step = value;
    if (interactiveReady) progressStep(value);
    return animation;
  };
  animation.progressEnd = (...args) => {
    end = args;
    if (interactiveReady) progressEnd(...args);
    return animation;
  };
  animation.destroy = (...args) => {
    disposed = true;
    finish(true);
    return destroy(...args);
  };
};
