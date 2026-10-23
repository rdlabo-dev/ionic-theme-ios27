import type { NativeUITransitionRelease } from '@rdlabo/capacitor-native-ui/integration';
import type { Animation } from '@ionic/core/components';
import { hasNativeUIIntegration, suspendNativeUI, VERTICAL_BARS_TRANSITION_CANCELED } from '@rdlabo/capacitor-native-ui/integration';
import type { AnimationBuilder } from '@ionic/core/components';

/**
 * Keeps an existing Ionic navigation animation and coordinates native control handoff.
 * Register the returned builder as navAnimation. Do not use it for overlay animations.
 * The builder must return a fresh Animation for each navigation; Ionic destroys it afterward.
 */
export const withNativeUITransition =
  (builder: AnimationBuilder): AnimationBuilder =>
  (baseEl, opts) => {
    const animation = builder(baseEl, opts);
    if (opts?.enteringEl) connectNativeUITransition(animation, opts.enteringEl, opts.leavingEl, opts.direction);
    return animation;
  };

const connectedTransitions = new WeakSet<Animation>();
const cancellationTransitions = new WeakSet<Animation>();

/** Ionic write hooks cannot await the bridge. Gate playback, including interactive playback. */
export const connectNativeUITransition = (
  animation: Animation,
  entering: HTMLElement,
  leaving?: HTMLElement,
  direction?: 'forward' | 'back' | 'root',
) => {
  if (leaving && !cancellationTransitions.has(animation)) {
    cancellationTransitions.add(animation);
    animation.onFinish((step) => {
      if (step === 0) leaving.dispatchEvent(new CustomEvent(VERTICAL_BARS_TRANSITION_CANCELED, { bubbles: true, detail: { entering } }));
    });
  }
  if (connectedTransitions.has(animation) || !hasNativeUIIntegration(entering.ownerDocument)) return;
  connectedTransitions.add(animation);
  const scopes = leaving ? [entering, leaving] : [entering];
  const play = animation.play.bind(animation);
  const progressStart = animation.progressStart.bind(animation);
  const progressStep = animation.progressStep.bind(animation);
  const progressEnd = animation.progressEnd.bind(animation);
  const destroy = animation.destroy.bind(animation);
  let release: NativeUITransitionRelease | undefined;
  let frame = 0;
  const win = entering.ownerDocument.defaultView;
  const webAnimations = (value: Animation): globalThis.Animation[] => [
    ...value.getWebAnimations(),
    ...value.childAnimations.flatMap(webAnimations),
  ];
  const track = () => {
    if (!release?.progress || !win) return;
    const sample = () => {
      const progress = webAnimations(animation)
        .map((value) => value.effect?.getComputedTiming().progress)
        .find((value) => value != null);
      if (progress != null) release?.progress?.(progress);
      frame = win.requestAnimationFrame(sample);
    };
    frame = win.requestAnimationFrame(sample);
  };
  let preparation: Promise<void> | undefined;
  let disposed = false;
  let interactiveReady = false;
  let step: number | undefined;
  let end: Parameters<Animation['progressEnd']> | undefined;
  const prepare = (interactive = false) =>
    (preparation ??= suspendNativeUI(scopes, {
      navigation: true,
      ...(direction ? { direction } : {}),
      ...(interactive ? { interactive: true } : {}),
    }).then((resume) => {
      if (disposed) resume(true);
      else release = resume;
    }));
  const finish = (canceled = false) => {
    if (frame) win?.cancelAnimationFrame(frame);
    frame = 0;
    release?.progress?.(canceled ? 0 : 1);
    release?.(canceled);
    release = undefined;
    preparation = undefined;
  };
  animation.onFinish((step) => finish(step === 0));
  animation.play = async (options) => {
    await prepare();
    if (disposed) return;
    try {
      const playing = play(options);
      track();
      await playing;
    } finally {
      finish();
    }
  };
  animation.progressStart = (...args) => {
    interactiveReady = false;
    step = undefined;
    end = undefined;
    void prepare(true).then(() => {
      if (disposed) return;
      progressStart(...args);
      track();
      interactiveReady = true;
      if (step !== undefined) {
        progressStep(step);
        release?.progress?.(step);
      }
      if (end) {
        release?.finishGesture?.(end[0] === 1);
        progressEnd(...end);
      }
    });
    return animation;
  };
  animation.progressStep = (value) => {
    step = value;
    if (interactiveReady) {
      progressStep(value);
      release?.progress?.(value);
    }
    return animation;
  };
  animation.progressEnd = (...args) => {
    end = args;
    if (interactiveReady) {
      release?.finishGesture?.(args[0] === 1);
      progressEnd(...args);
    }
    return animation;
  };
  animation.destroy = (...args) => {
    disposed = true;
    finish(true);
    return destroy(...args);
  };
};
