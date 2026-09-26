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

/** Wraps a runtime handle with the shared enable-lifecycle: reason, suspend hooks and idempotent destroy. */
const manage = (
  handle: NativeUIShellHandle,
  lifecycle: {
    reason?: string;
    suspend?: () => (() => void) | undefined;
    /** Runs after teardown; clears the shared slot only while this activation owns it. */
    release?: () => void;
    destroy?: () => void | Promise<void>;
  } = {},
): NativeUIShellHandle => {
  let destroyed = false;
  return {
    getStatus: () => (lifecycle.reason ? { ...handle.getStatus(), reason: lifecycle.reason } : handle.getStatus()),
    async suspend() {
      const lease = await handle.suspend();
      const resume = lifecycle.suspend?.();
      return {
        async resume() {
          await lease.resume();
          resume?.();
        },
      };
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        await handle.destroy();
      } finally {
        await lifecycle.destroy?.();
        lifecycle.release?.();
      }
    },
  };
};

/** Reads the current native WebView geometry and applies it to page transitions. */
export const configureNativeTransition = async (): Promise<WebViewMetrics> => {
  const metrics =
    typeof document !== 'undefined' && Capacitor.getPlatform() === 'ios' ? (await plugin.getDeviceLayout()).webViewMetrics : { radius: 0 };
  setConfig({ radius: metrics.radius });
  return metrics;
};

/** Resolves a logical vertical-bar edge to the physical side for the given direction. */
const physicalVerticalBarEdge = (edge: Exclude<VerticalBarEdge, null>, rtl: boolean): 'left' | 'right' =>
  (edge === 'leading') !== rtl ? 'left' : 'right';

const elementRtl = (element: Element): boolean => element.closest('[dir]')?.getAttribute('dir') === 'rtl';

/**
 * Applies one placement to the CSS layout and both Web/native projections.
 * Pass `rtl` when the document direction is known; otherwise the nearest `dir` attribute is used.
 */
export const setVerticalControlAreaPlacement = (placement: VerticalBarEdge | VerticalBarPlacement, rtl?: boolean): void => {
  if (typeof document === 'undefined') return;
  const app = document.querySelector<HTMLElement>('ion-app');
  if (!app) throw new Error('Vertical Control Area requires ion-app');
  const { edge, inset } = placement && typeof placement === 'object' ? placement : { edge: placement, inset: 0 };
  app.classList.toggle('ios-theme-vertical-bars', edge !== null);
  app.classList.toggle('ios-theme-vertical-bars-left', edge !== null && physicalVerticalBarEdge(edge, rtl ?? elementRtl(app)) === 'left');
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
  if (active) return active;
  activeConfiguration = configuration;
  const prehide =
    options.controls === undefined || options.controls.toolbar === true ? prehideVerticalBarsToolbarSources(document) : undefined;
  // A slow destroy of a superseded activation must not release a newer one.
  let start: Promise<NativeUIShellHandle>;
  const release = () => {
    if (active === start) {
      active = undefined;
      activeConfiguration = undefined;
    }
  };
  const fallback = (reason: string) =>
    manage(createVerticalBarsWebProjection(document, options), {
      reason,
      suspend: () => prehide?.suspend(),
      destroy: () => prehide?.stop(),
      release,
    });
  return (start = active =
    (async () => {
      if (Capacitor.getPlatform() !== 'ios') return fallback('Requires Capacitor iOS');
      let runtime: NativeUIShellHandle | undefined;
      let placementListener: Awaited<ReturnType<typeof plugin.addListener>> | undefined;
      let monitoring = false;
      try {
        if (!options.verticalBarsOnly) await configureNativeTransition().catch(() => undefined);
        const capabilities = await plugin.configure({ verticalBarsOnly: options.verticalBarsOnly === true });
        if (!capabilities.supported) return fallback('Requires iOS 26 or later');
        let nativeEdge: VerticalBarEdge = null;
        const nativeVerticalBars = () => {
          const root = document.querySelector('ion-app.ios-theme-vertical-bars');
          if (!root) return false;
          // The trait stays unspecified when the OS cannot report a rail — for
          // example an app linked against an SDK older than 27.1 — so the DOM
          // class is trusted there. When the OS does report an edge, the native
          // rail only takes over once the app has applied the matching class.
          const domEdge = root.classList.contains('ios-theme-vertical-bars-left') ? 'left' : 'right';
          return nativeEdge === null || physicalVerticalBarEdge(nativeEdge, elementRtl(root)) === domEdge;
        };
        await plugin.startDeviceLayoutMonitoring();
        monitoring = true;
        placementListener = await plugin.addListener('deviceLayoutChange', ({ placement, webViewMetrics }) => {
          nativeEdge = placement.edge;
          if (!options.verticalBarsOnly) setConfig({ radius: webViewMetrics.radius });
          document.defaultView?.dispatchEvent(new Event('nativeUIShellRefresh'));
        });
        nativeEdge = (await plugin.getDeviceLayout()).placement.edge;
        const native = await createRuntime(document, plugin, options, nativeVerticalBars, options.verticalBarsOnly === true);
        runtime = combine(
          native,
          createVerticalBarsWebProjection(document, options, () => !nativeVerticalBars() || native.getStatus().state === 'stopped'),
        );
        return manage(runtime, {
          suspend: () => prehide?.suspend(),
          release,
          destroy: async () => {
            await placementListener?.remove().catch(() => {});
            if (monitoring) await plugin.stopDeviceLayoutMonitoring().catch(() => {});
            prehide?.stop();
          },
        });
      } catch (error) {
        await runtime?.destroy();
        await placementListener?.remove().catch(() => {});
        if (monitoring) await plugin.stopDeviceLayoutMonitoring().catch(() => {});
        return fallback(error instanceof Error ? error.message : String(error));
      }
    })());
};
