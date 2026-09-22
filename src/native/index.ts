import { Capacitor, registerPlugin } from '@capacitor/core';
import { setConfig } from '../transition/ios.transition';
import type { NativeUIShellHandle, NativeUIShellOptions, NativeUIShellPlugin, WebViewMetrics } from './definitions';
import { bindMetricsLifecycle } from './lifecycle';
import { createRuntime } from './runtime';
import { createFoldableWebProjection } from './foldable-web';
export type {
  NativeUIShellComponent,
  NativeUIShellControls,
  NativeUIShellHandle,
  NativeUIShellOptions,
  NativeUIShellStatus,
  NativeUIShellSuspension,
  WebViewMetrics,
} from './definitions';

const plugin = registerPlugin<NativeUIShellPlugin>('IonicNativeUIShell');
let active: Promise<NativeUIShellHandle> | undefined;
const web = (reason: string): NativeUIShellHandle => ({
  getStatus: () => ({ state: 'web', projected: 0, updates: 0, reason }),
  suspend: async () => ({ resume: async () => {} }),
  destroy: async () => {},
});

/** Reads the current native WebView geometry and applies it to page transitions. */
export const configureNativeTransition = async (): Promise<WebViewMetrics> => {
  const metrics = typeof document !== 'undefined' && Capacitor.getPlatform() === 'ios' ? await plugin.getWebViewMetrics() : { radius: 0 };
  setConfig({ radius: metrics.radius });
  return metrics;
};

/** Call once at application startup. Ionic markup remains the source of truth. */
export const enableNativeUIShell = (options: NativeUIShellOptions = {}): Promise<NativeUIShellHandle> => {
  if (options.enabled === false) {
    const current = active;
    active = undefined;
    return current
      ? current.then(async (handle) => {
          await handle.destroy();
          return web('Disabled');
        })
      : Promise.resolve(web('Disabled'));
  }
  if (typeof document === 'undefined') return Promise.resolve(web('Requires a document'));
  return (active ??= (async () => {
    if (Capacitor.getPlatform() !== 'ios')
      return resetOnDestroy(withReason(createFoldableWebProjection(document, options), 'Requires Capacitor iOS'));
    let runtime: NativeUIShellHandle | undefined;
    try {
      await configureNativeTransition().catch(() => undefined);
      if (!(await plugin.configure()).supported) {
        return resetOnDestroy(withReason(createFoldableWebProjection(document, options), 'Requires iOS 26 or later'));
      }
      runtime = await createRuntime(document, plugin, options);
      runtime = await bindMetricsLifecycle(
        runtime,
        () => plugin.addListener('webViewMetricsChange', (metrics) => setConfig({ radius: metrics.radius })),
        () => (active = undefined),
      );
      return resetOnDestroy(runtime);
    } catch (error) {
      await runtime?.destroy();
      return resetOnDestroy(
        withReason(createFoldableWebProjection(document, options), error instanceof Error ? error.message : String(error)),
      );
    }
  })());
};

const resetOnDestroy = (handle: NativeUIShellHandle): NativeUIShellHandle => ({
  getStatus: handle.getStatus,
  suspend: handle.suspend,
  async destroy() {
    await handle.destroy();
    active = undefined;
  },
});

const withReason = (handle: NativeUIShellHandle, reason: string): NativeUIShellHandle => ({
  getStatus: () => ({ ...handle.getStatus(), reason }),
  suspend: () => handle.suspend(),
  destroy: () => handle.destroy(),
});
