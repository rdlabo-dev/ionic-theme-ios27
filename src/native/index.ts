import { Capacitor, registerPlugin } from '@capacitor/core';
import { setConfig } from '../transition/ios.transition';
import type {
  NativeUIShellHandle,
  NativeUIShellOptions,
  NativeUIShellPlugin,
  VerticalBarEdge,
  VerticalBarPlacement,
  VerticalControlAreaHandle,
  WebViewMetrics,
} from './definitions';
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
  DeviceLayout,
  VerticalBarEdge,
  VerticalBarPlacement,
  VerticalControlAreaHandle,
  WebViewMetrics,
} from './definitions';
export { HingeStatus } from './definitions';

const plugin = registerPlugin<NativeUIShellPlugin>('IonicNativeUIShell');
export const IonicNativeUIShell = plugin;
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
  const metrics =
    typeof document !== 'undefined' && Capacitor.getPlatform() === 'ios' ? (await plugin.getDeviceLayout()).webViewMetrics : { radius: 0 };
  setConfig({ radius: metrics.radius });
  return metrics;
};

/** Applies one placement to the CSS layout and both Web/native projections. */
export const setVerticalControlAreaPlacement = (placement: VerticalBarEdge | VerticalBarPlacement): void => {
  if (typeof document === 'undefined') return;
  const app = document.querySelector<HTMLElement>('ion-app');
  if (!app) throw new Error('Vertical Control Area requires ion-app');
  const { edge, inset } = placement && typeof placement === 'object' ? placement : { edge: placement, inset: 0 };
  app.classList.toggle('ios-theme-vertical-bars', edge !== null);
  app.classList.toggle('ios-theme-vertical-bars-left', edge === 'left');
  if (edge && Number.isFinite(inset) && inset > 0) app.style.setProperty('--ios-theme-vertical-bars-native-inset', `${inset}px`);
  else app.style.removeProperty('--ios-theme-vertical-bars-native-inset');
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
    let placementListener: Awaited<ReturnType<typeof plugin.addListener>> | undefined;
    let monitoring = false;
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
      await plugin.startDeviceLayoutMonitoring();
      monitoring = true;
      placementListener = await plugin.addListener('deviceLayoutChange', ({ placement, webViewMetrics }) => {
        nativeEdge = placement.edge;
        if (!options.verticalBarsOnly) setConfig({ radius: webViewMetrics.radius });
        document.defaultView?.dispatchEvent(new Event('nativeUIShellRefresh'));
      });
      nativeEdge = (await plugin.getDeviceLayout()).placement.edge;
      runtime = await createRuntime(document, plugin, options, nativeVerticalBars, options.verticalBarsOnly === true);
      runtime = combine(
        runtime,
        createVerticalBarsWebProjection(document, options, () => !nativeVerticalBars()),
      );
      return resetOnDestroy(withPlacementListener(runtime, placementListener), stopPrehide);
    } catch (error) {
      await runtime?.destroy();
      await placementListener?.remove().catch(() => {});
      if (monitoring) await plugin.stopDeviceLayoutMonitoring().catch(() => {});
      return resetOnDestroy(
        withReason(createVerticalBarsWebProjection(document, options), error instanceof Error ? error.message : String(error)),
        stopPrehide,
      );
    }
  })());
};

const withPlacementListener = (
  handle: NativeUIShellHandle,
  listener: Awaited<ReturnType<typeof plugin.addListener>>,
): NativeUIShellHandle => {
  let destroyed = false;
  return {
    getStatus: () => handle.getStatus(),
    suspend: () => handle.suspend(),
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        await handle.destroy();
      } finally {
        await listener.remove().catch(() => {});
        await plugin.stopDeviceLayoutMonitoring().catch(() => {});
      }
    },
  };
};

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
