import { Capacitor, registerPlugin } from '@capacitor/core';
import { setConfig } from '../transition/ios.transition';
import type { NativeUIShellHandle, NativeUIShellOptions, NativeUIShellPlugin, WebViewMetrics } from './definitions';
import { bindMetricsLifecycle } from './lifecycle';
import { createRuntime } from './runtime';
import { createFoldableWebProjection } from './foldable-web';
import { prehideFoldableToolbarSources } from './prehide';
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

const combine = (native: NativeUIShellHandle, fallback: NativeUIShellHandle): NativeUIShellHandle => ({
  getStatus() {
    const nativeStatus = native.getStatus();
    const fallbackStatus = fallback.getStatus();
    return {
      ...nativeStatus,
      state:
        nativeStatus.state === 'stopped' && fallbackStatus.state === 'stopped' ? 'stopped' : nativeStatus.projected > 0 ? 'native' : 'web',
      projected: nativeStatus.projected + fallbackStatus.projected,
      updates: nativeStatus.updates + fallbackStatus.updates,
    };
  },
  async suspend() {
    const [nativeLease, fallbackLease] = await Promise.all([native.suspend(), fallback.suspend()]);
    return { resume: async () => void (await Promise.all([nativeLease.resume(), fallbackLease.resume()])) };
  },
  async destroy() {
    await Promise.all([native.destroy(), fallback.destroy()]);
  },
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
  const stopPrehide =
    !active && (options.controls === undefined || options.controls.toolbar === true) ? prehideFoldableToolbarSources(document) : undefined;
  return (active ??= (async () => {
    if (Capacitor.getPlatform() !== 'ios')
      return resetOnDestroy(withReason(createFoldableWebProjection(document, options), 'Requires Capacitor iOS'), stopPrehide);
    let runtime: NativeUIShellHandle | undefined;
    try {
      await configureNativeTransition().catch(() => undefined);
      const capabilities = await plugin.configure();
      if (!capabilities.supported) {
        return resetOnDestroy(withReason(createFoldableWebProjection(document, options), 'Requires iOS 26 or later'), stopPrehide);
      }
      runtime = await createRuntime(document, plugin, options, capabilities.foldableRail === true);
      if (capabilities.foldableRail !== true) runtime = combine(runtime, createFoldableWebProjection(document, options));
      runtime = await bindMetricsLifecycle(
        runtime,
        () => plugin.addListener('webViewMetricsChange', (metrics) => setConfig({ radius: metrics.radius })),
        () => (active = undefined),
      );
      return resetOnDestroy(runtime, stopPrehide);
    } catch (error) {
      await runtime?.destroy();
      return resetOnDestroy(
        withReason(createFoldableWebProjection(document, options), error instanceof Error ? error.message : String(error)),
        stopPrehide,
      );
    }
  })());
};

const resetOnDestroy = (handle: NativeUIShellHandle, prehide?: ReturnType<typeof prehideFoldableToolbarSources>): NativeUIShellHandle => ({
  getStatus: handle.getStatus,
  async suspend() {
    const lease = await handle.suspend();
    const resumePrehide = prehide?.suspend();
    return {
      async resume() {
        await lease.resume();
        resumePrehide?.();
      },
    };
  },
  async destroy() {
    await handle.destroy();
    prehide?.stop();
    active = undefined;
  },
});

const withReason = (handle: NativeUIShellHandle, reason: string): NativeUIShellHandle => ({
  getStatus: () => ({ ...handle.getStatus(), reason }),
  suspend: () => handle.suspend(),
  destroy: () => handle.destroy(),
});
