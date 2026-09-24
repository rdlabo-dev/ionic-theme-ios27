import { Capacitor, registerPlugin } from '@capacitor/core';
import { setConfig } from '../transition/ios.transition';
import type {
  NativeUIShellHandle,
  NativeUIShellOptions,
  NativeUIShellPlugin,
  VerticalBarEdge,
  VerticalControlAreaHandle,
  WebViewMetrics,
} from './definitions';
import { bindMetricsLifecycle } from './lifecycle';
import { createRuntime } from './runtime';
import { createVerticalBarsWebProjection } from './vertical-bars-web';
import { prehideVerticalBarsToolbarSources } from './prehide';
export type {
  NativeUIShellComponent,
  NativeUIShellControls,
  NativeUIShellHandle,
  NativeUIShellOptions,
  NativeUIShellStatus,
  NativeUIShellSuspension,
  VerticalBarEdge,
  VerticalControlAreaHandle,
  WebViewMetrics,
} from './definitions';

const plugin = registerPlugin<NativeUIShellPlugin>('IonicNativeUIShell');
let active: Promise<NativeUIShellHandle> | undefined;
let activeConfiguration: string | undefined;
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

/** Reads the system's current vertical-bar placement without changing the theme. */
export const getVerticalBarPlacement = (): Promise<{ edge: VerticalBarEdge }> =>
  typeof document !== 'undefined' && Capacitor.getPlatform() === 'ios' ? plugin.getVerticalBarPlacement() : Promise.resolve({ edge: null });

/** Observes placement; the application decides whether to apply each change. */
export const addVerticalBarPlacementListener = (listener: (placement: { edge: VerticalBarEdge }) => void) =>
  typeof document !== 'undefined' && Capacitor.getPlatform() === 'ios'
    ? plugin.addListener('verticalBarPlacementChange', listener)
    : Promise.resolve({ remove: async () => {} });

/** Applies one placement to the CSS layout and both Web/native projections. */
export const setVerticalControlAreaPlacement = (edge: VerticalBarEdge): void => {
  if (typeof document === 'undefined') return;
  const app = document.querySelector('ion-app');
  if (!app) throw new Error('Vertical Control Area requires ion-app');
  app.classList.toggle('ios-theme-vertical-bars', edge !== null);
  app.classList.toggle('ios-theme-vertical-bars-left', edge === 'left');
};

/** Call once at application startup. Ionic markup remains the source of truth. */
export const enableVerticalControlArea = async (): Promise<VerticalControlAreaHandle> => {
  const handle = await enableNativeUIShell({ controls: { tabs: true, toolbar: true }, verticalBarsOnly: true });
  return {
    getStatus: () => handle.getStatus(),
    suspend: () => handle.suspend(),
    destroy: () => handle.destroy(),
    setPlacement: setVerticalControlAreaPlacement,
  };
};

/** Call once at application startup. Ionic markup remains the source of truth. */
export const enableNativeUIShell = (options: NativeUIShellOptions = {}): Promise<NativeUIShellHandle> => {
  if (options.enabled === false) {
    const current = active;
    active = undefined;
    activeConfiguration = undefined;
    return current
      ? current.then(async (handle) => {
          await handle.destroy();
          return web('Disabled');
        })
      : Promise.resolve(web('Disabled'));
  }
  if (typeof document === 'undefined') return Promise.resolve(web('Requires a document'));
  const controls = options.controls;
  const configuration = JSON.stringify([
    options.verticalBarsOnly === true,
    ...(['tabs', 'toolbar', 'segment', 'fab'] as const).map((component) => !controls || controls[component] === true),
  ]);
  if (active && activeConfiguration !== configuration)
    return Promise.reject(
      new Error('Native UI Shell is already running with different controls; destroy it before changing configuration.'),
    );
  activeConfiguration = configuration;
  const stopPrehide =
    !active && (options.controls === undefined || options.controls.toolbar === true)
      ? prehideVerticalBarsToolbarSources(document)
      : undefined;
  return (active ??= (async () => {
    if (Capacitor.getPlatform() !== 'ios')
      return resetOnDestroy(withReason(createVerticalBarsWebProjection(document, options), 'Requires Capacitor iOS'), stopPrehide);
    let runtime: NativeUIShellHandle | undefined;
    let placementListener: Awaited<ReturnType<typeof addVerticalBarPlacementListener>> | undefined;
    try {
      if (!options.verticalBarsOnly) await configureNativeTransition().catch(() => undefined);
      const capabilities = await plugin.configure({ verticalBarsOnly: options.verticalBarsOnly === true });
      if (!capabilities.supported) {
        return resetOnDestroy(withReason(createVerticalBarsWebProjection(document, options), 'Requires iOS 26 or later'), stopPrehide);
      }
      let nativeEdge: VerticalBarEdge = null;
      const nativeVerticalBars = () => {
        const root = document.querySelector('ion-app.ios-theme-vertical-bars');
        return nativeEdge !== null && !!root && nativeEdge === (root.classList.contains('ios-theme-vertical-bars-left') ? 'left' : 'right');
      };
      placementListener = await addVerticalBarPlacementListener(({ edge }) => {
        nativeEdge = edge;
        document.defaultView?.dispatchEvent(new Event('nativeUIShellRefresh'));
      });
      nativeEdge = (await getVerticalBarPlacement()).edge;
      runtime = await createRuntime(document, plugin, options, nativeVerticalBars, options.verticalBarsOnly === true);
      runtime = combine(
        runtime,
        createVerticalBarsWebProjection(document, options, () => !nativeVerticalBars()),
      );
      if (!options.verticalBarsOnly)
        runtime = await bindMetricsLifecycle(
          runtime,
          () => plugin.addListener('webViewMetricsChange', (metrics) => setConfig({ radius: metrics.radius })),
          () => {
            active = undefined;
          },
        );
      return resetOnDestroy(withPlacementListener(runtime, placementListener), stopPrehide);
    } catch (error) {
      await runtime?.destroy();
      await placementListener?.remove().catch(() => {});
      return resetOnDestroy(
        withReason(createVerticalBarsWebProjection(document, options), error instanceof Error ? error.message : String(error)),
        stopPrehide,
      );
    }
  })());
};

const withPlacementListener = (
  handle: NativeUIShellHandle,
  listener: Awaited<ReturnType<typeof addVerticalBarPlacementListener>>,
): NativeUIShellHandle => ({
  getStatus: () => handle.getStatus(),
  suspend: () => handle.suspend(),
  async destroy() {
    try {
      await handle.destroy();
    } finally {
      await listener.remove().catch(() => {});
    }
  },
});

const resetOnDestroy = (
  handle: NativeUIShellHandle,
  prehide?: ReturnType<typeof prehideVerticalBarsToolbarSources>,
): NativeUIShellHandle => ({
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
    try {
      await handle.destroy();
    } finally {
      prehide?.stop();
      active = undefined;
      activeConfiguration = undefined;
    }
  },
});

const withReason = (handle: NativeUIShellHandle, reason: string): NativeUIShellHandle => ({
  getStatus: () => ({ ...handle.getStatus(), reason }),
  suspend: () => handle.suspend(),
  destroy: () => handle.destroy(),
});
