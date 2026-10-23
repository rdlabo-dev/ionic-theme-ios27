/// <reference lib="es2021.weakref" />

export interface NativeUISuspensionOptions {
  /** Navigation-only toolbar handoff; omitted for explicit Web ownership requests. */
  navigation?: boolean;
  /** A swipe whose navigation result has not yet been committed. */
  interactive?: boolean;
  /** Direction supplied by Ionic's navigation animation builder. */
  direction?: 'forward' | 'back' | 'root';
}

export type NativeUITransitionRelease = ((canceled?: boolean) => void) & {
  progress?: (value: number) => void;
  /** The finger lifted; Web will now settle toward its chosen endpoint. */
  finishGesture?: (complete: boolean) => void;
};

export interface NativeUIIntegration {
  suspend(scopes: HTMLElement[], options?: NativeUISuspensionOptions): Promise<NativeUITransitionRelease>;
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
  tabBar.ownerDocument.defaultView?.dispatchEvent(new Event('nativeUIRefresh'));
  return binding;
};

export const getNativeSearchBindings = (doc: Document): NativeSearchBinding[] =>
  (searches.get(doc) ?? []).flatMap((entry) => entry.deref() ?? []);

export const requestNativeSearch = async (binding: NativeSearchBinding, active: boolean, focus?: boolean): Promise<boolean> =>
  (await runtimes.get(binding.tabBar.ownerDocument)?.search?.(binding, active, focus)) ?? false;

const runtimes = new WeakMap<Document, NativeUIIntegration>();
export const VERTICAL_BARS_TRANSITION_CANCELED = 'iosThemeVerticalBarsTransitionCanceled';

export const setNativeUIIntegration = (doc: Document, runtime?: NativeUIIntegration) => {
  if (runtime) runtimes.set(doc, runtime);
  else runtimes.delete(doc);
};

export const hasNativeUIIntegration = (doc: Document): boolean => runtimes.has(doc);

export const isNativeUI = (element: HTMLElement) => element.hasAttribute('data-native-ui-projected');

export const suspendNativeUI = async (scopes: HTMLElement[], options?: NativeUISuspensionOptions): Promise<NativeUITransitionRelease> =>
  (await runtimes.get(scopes[0]?.ownerDocument)?.suspend(scopes, options)) ?? (() => {});

/** Shared geometry used by the theme's transition adapter; no theme import in the plugin. */
export const nativeWebViewMetrics = { radius: 0 };
