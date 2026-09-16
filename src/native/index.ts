import { Capacitor, registerPlugin } from '@capacitor/core';
import { setConfig } from '../transition/ios.transition';
import type { NativeUIShellHandle, NativeUIShellOptions, NativeUIShellPlugin, WebViewMetrics } from './definitions';
import { createRuntime } from './runtime';
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
  if (typeof document === 'undefined' || Capacitor.getPlatform() !== 'ios') return Promise.resolve(web('Requires Capacitor iOS'));
  return (active ??= (async () => {
    try {
      await configureNativeTransition().catch(() => undefined);
      if (!(await plugin.configure()).supported) {
        active = undefined;
        return web('Requires iOS 26 or later');
      }
      const runtime = await createRuntime(document, plugin, options);
      const metricsListener = await plugin.addListener('webViewMetricsChange', (metrics) => setConfig({ radius: metrics.radius }));
      return {
        getStatus: runtime.getStatus,
        suspend: runtime.suspend,
        async destroy() {
          await metricsListener.remove();
          await runtime.destroy();
          active = undefined;
        },
      };
    } catch (error) {
      active = undefined;
      return web(error instanceof Error ? error.message : String(error));
    }
  })());
};
