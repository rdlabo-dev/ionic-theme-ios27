import type { AnimationBuilder } from '@ionic/core/components';
import { coordination, type NativeSearchBinding } from './protocol';
export const nativeWebViewMetrics = coordination.metrics;
export const isNativeUIShell = (element: HTMLElement) => element.hasAttribute('data-native-ui-shell');
export const suspendNativeUIShell = async (scopes: HTMLElement[]): Promise<(canceled?: boolean) => void> =>
  (await coordination.runtimes.get(scopes[0]?.ownerDocument)?.suspend(scopes)) ?? (() => {});
export const requestNativeSearch = async (binding: NativeSearchBinding, active: boolean, focus?: boolean): Promise<boolean> =>
  (await coordination.runtimes.get(binding.tabBar.ownerDocument)?.search?.(binding, active, focus)) ?? false;
export const registerNativeSearch = (tabBar: HTMLElement, trigger: HTMLElement, footer: HTMLElement): NativeSearchBinding => {
  const binding = { tabBar, trigger, footer, active: false, focused: false };
  const entries = (coordination.searches.get(tabBar.ownerDocument) ?? []).filter(
    (entry) => entry.deref() && entry.deref()?.footer !== footer,
  );
  entries.push(new WeakRef(binding));
  coordination.searches.set(tabBar.ownerDocument, entries);
  tabBar.ownerDocument.defaultView?.dispatchEvent(new Event('nativeUIShellRefresh'));
  return binding;
};

/** Router coordination is automatic; registering an animation never enables Native UI. */
export const withNativeUIShellTransition =
  (builder: AnimationBuilder): AnimationBuilder =>
  (baseEl, opts) => {
    const animation = builder(baseEl, opts);
    const entering = opts?.enteringEl as HTMLElement | undefined;
    const leaving = opts?.leavingEl as HTMLElement | undefined;
    if (!entering) return animation;
    if (leaving && !coordination.cancellations.has(animation)) {
      coordination.cancellations.add(animation);
      animation.onFinish((step) => {
        if (step === 0)
          leaving.dispatchEvent(new CustomEvent('iosThemeVerticalBarsTransitionCanceled', { bubbles: true, detail: { entering } }));
      });
    }
    coordination.runtimes.get(entering.ownerDocument)?.connectTransition(animation, entering, leaving);
    return animation;
  };
