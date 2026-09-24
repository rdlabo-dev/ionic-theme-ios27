/// <reference lib="es2021.weakref" />
import type { Animation } from '@ionic/core';

export interface NativeUIShellIntegration {
  suspend(scopes: HTMLElement[]): Promise<(canceled?: boolean) => void>;
  search?(binding: NativeSearchBinding, active: boolean, focus?: boolean): Promise<boolean>;
}

export interface NativeSearchBinding {
  tabBar: HTMLElement;
  trigger: HTMLElement;
  footer: HTMLElement;
  active: boolean;
  focused: boolean;
}

const searches = new WeakMap<Document, WeakRef<NativeSearchBinding>[]>();

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

const runtimes = new WeakMap<Document, NativeUIShellIntegration>();
export const FOLDABLE_TRANSITION_CANCELED = 'iosThemeFoldableTransitionCanceled';

export const setNativeUIShellIntegration = (doc: Document, runtime?: NativeUIShellIntegration) => {
  if (runtime) runtimes.set(doc, runtime);
  else runtimes.delete(doc);
};

export const isNativeUIShell = (element: HTMLElement) => element.hasAttribute('data-native-ui-shell');

export const suspendNativeUIShell = async (scopes: HTMLElement[]): Promise<(canceled?: boolean) => void> =>
  (await runtimes.get(scopes[0]?.ownerDocument)?.suspend(scopes)) ?? (() => {});

/** Ionic write hooks cannot await the bridge. Gate playback, including interactive playback. */
export const connectNativeUIShellTransition = (animation: Animation, entering: HTMLElement, leaving?: HTMLElement) => {
  if (leaving)
    animation.onFinish((step) => {
      if (step === 0) leaving.dispatchEvent(new CustomEvent(FOLDABLE_TRANSITION_CANCELED, { bubbles: true, detail: { entering } }));
    });
  if (!runtimes.has(entering.ownerDocument)) return;
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
