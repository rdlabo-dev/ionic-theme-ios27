/// <reference lib="es2021.weakref" />
import type { Animation } from '@ionic/core/components';

import { coordination, type NativeSearchBinding, type NativeUIShellIntegration } from './protocol';
export type { NativeSearchBinding, NativeUIShellIntegration } from './protocol';
const { searches, runtimes, cancellations: cancellationTransitions } = coordination;

export const registerNativeSearch = (tabBar: HTMLElement, trigger: HTMLElement, footer: HTMLElement): NativeSearchBinding => {
  const binding = { tabBar, trigger, footer, active: false, focused: false };
  const entries = (searches.get(tabBar.ownerDocument) ?? []).filter((entry) => entry.deref() && entry.deref()?.footer !== footer);
  entries.push(new WeakRef(binding));
  searches.set(tabBar.ownerDocument, entries);
  tabBar.ownerDocument.defaultView?.dispatchEvent(new Event('nativeUIShellRefresh'));
  return binding;
};

export const getNativeSearchBindings = (doc: Document): NativeSearchBinding[] =>
  (searches.get(doc) ?? []).flatMap((entry) => entry.deref() ?? []);

export const requestNativeSearch = async (binding: NativeSearchBinding, active: boolean, focus?: boolean): Promise<boolean> =>
  (await runtimes.get(binding.tabBar.ownerDocument)?.search?.(binding, active, focus)) ?? false;

export const VERTICAL_BARS_TRANSITION_CANCELED = 'iosThemeVerticalBarsTransitionCanceled';

export const setNativeUIShellIntegration = (doc: Document, runtime?: NativeUIShellIntegration) => {
  if (runtime)
    runtimes.set(doc, {
      suspend: (scopes) => runtime.suspend(scopes),
      search: runtime.search ? (binding, active, focus) => runtime.search!(binding, active, focus) : undefined,
      connectTransition: connectNativeUIShellTransition,
    });
  else runtimes.delete(doc);
};

export const isNativeUIShell = (element: HTMLElement) => element.hasAttribute('data-native-ui-shell');

export const suspendNativeUIShell = async (scopes: HTMLElement[]): Promise<(canceled?: boolean) => void> =>
  (await runtimes.get(scopes[0]?.ownerDocument)?.suspend(scopes)) ?? (() => {});

const connectedTransitions = new WeakSet<Animation>();

/** Ionic write hooks cannot await the bridge. Gate playback, including interactive playback. */
export const connectNativeUIShellTransition = (animation: Animation, entering: HTMLElement, leaving?: HTMLElement) => {
  if (leaving && !cancellationTransitions.has(animation)) {
    cancellationTransitions.add(animation);
    animation.onFinish((step) => {
      if (step === 0) leaving.dispatchEvent(new CustomEvent(VERTICAL_BARS_TRANSITION_CANCELED, { bubbles: true, detail: { entering } }));
    });
  }
  if (connectedTransitions.has(animation) || !runtimes.has(entering.ownerDocument)) return;
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

/** Shared geometry used by the theme's transition adapter; no theme import in the plugin. */
export const nativeWebViewMetrics = coordination.metrics;
export { withNativeUIShellTransition } from './transition';
