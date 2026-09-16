import { Capacitor, registerPlugin } from '@capacitor/core';
import { setConfig } from '../transition/ios.transition';
import type { NativeUIShellBridgePlugin, NativeUIShellHandle, WebViewMetrics } from './definitions';
import { createRuntime } from './runtime';
export type { NativeUIShellComponent, NativeUIShellHandle, NativeUIShellPlugin, NativeUIShellStatus, WebViewMetrics } from './definitions';

const plugin = registerPlugin<NativeUIShellBridgePlugin>('IonicNativeUIShell');
let active: Promise<NativeUIShellHandle> | undefined;
const web = (reason: string): NativeUIShellHandle => ({
  getStatus: () => ({ state: 'web', projected: 0, updates: 0, reason }),
  destroy: async () => {},
});

/** Reads the current native WebView geometry and applies it to page transitions. */
export const configureNativeTransition = async (): Promise<WebViewMetrics> => {
  const metrics = typeof document !== 'undefined' && Capacitor.getPlatform() === 'ios' ? await plugin.getWebViewMetrics() : { radius: 0 };
  setConfig({ radius: metrics.radius });
  return metrics;
};

/** Call once at application startup. Ionic markup remains the source of truth. */
export const enableNativeUIShell = (): Promise<NativeUIShellHandle> => {
  if (typeof document === 'undefined' || Capacitor.getPlatform() !== 'ios') return Promise.resolve(web('Requires Capacitor iOS'));
  return (active ??= (async () => {
    try {
      await configureNativeTransition().catch(() => undefined);
      if (!(await plugin.configure()).supported) {
        active = undefined;
        return web('Requires iOS 26 or later');
      }
      const runtime = await createRuntime(document, plugin);
      const metricsListener = await plugin.addListener('webViewMetricsChange', (metrics) => setConfig({ radius: metrics.radius }));
      return {
        getStatus: runtime.getStatus,
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
