import { Capacitor, registerPlugin } from '@capacitor/core';
import { setConfig } from '../transition/ios.transition';
import type {
  NativeUIShellHandle,
  NativeUIShellOptions,
  NativeUIShellPlugin,
  VerticalBarEdge,
  VerticalBarPlacement,
  VerticalControlAreaHandle,
  VerticalControlAreaOptions,
  WebViewMetrics,
} from './definitions';
import { createRuntime } from './runtime';
import { createOverlayController } from './overlays/controller';
import { createVerticalBarsWebProjection } from './vertical-bars-web';
import { prehideVerticalBarsToolbarSources } from './prehide';
import { observeVerticalBarsModals } from './shared/modal';
export type {
  NativeUIShellComponent,
  NativeUIShellControls,
  NativeUIShellHandle,
  NativeUIShellOptions,
  NativeUIShellStatus,
  NativeUIShellSuspension,
  VerticalBarEdge,
  VerticalBarPlacement,
  VerticalControlAreaHandle,
  VerticalControlAreaOptions,
  WebViewMetrics,
} from './definitions';

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
    suspend?: () => (() => void) | undefined | Promise<(() => void) | undefined>;
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
      const resume = await lifecycle.suspend?.();
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
  const metrics = typeof document !== 'undefined' && Capacitor.getPlatform() === 'ios' ? await plugin.getWebViewMetrics() : { radius: 0 };
  setConfig({ radius: metrics.radius });
  return metrics;
};

/** Resolves a logical vertical-bar edge to the physical side for the given direction. */
const physicalVerticalBarEdge = (edge: Exclude<VerticalBarEdge, null>, rtl: boolean): 'left' | 'right' =>
  (edge === 'leading') !== rtl ? 'left' : 'right';

const elementRtl = (element: Element): boolean => element.closest('[dir]')?.getAttribute('dir') === 'rtl';

// Device facts are supplied by the application; the theme only compares placement.
const nativePlacements = new WeakMap<HTMLElement, { edge: VerticalBarEdge; rtl?: boolean }>();
const horizontalFallbackAttribute = 'data-native-ui-shell-vertical-bars-suspended';

// Keep the requested rail while ordinary Native UI Shell temporarily uses its
// horizontal layout. Removing the effective class restores normal measurements,
// toolbar ownership and safe areas throughout the existing rendering pipeline.
const observeNativeVerticalBarsLayout = (doc: Document): (() => void) => {
  const reconcile = () => {
    const app = doc.querySelector<HTMLElement>('ion-app');
    if (!app) return;
    const requested = app.classList.contains('ios-theme-vertical-bars') || app.hasAttribute(horizontalFallbackAttribute);
    const suspended = requested && nativePlacements.get(app)?.edge == null;
    if (app.hasAttribute(horizontalFallbackAttribute) !== suspended) app.toggleAttribute(horizontalFallbackAttribute, suspended);
    if (app.classList.contains('ios-theme-vertical-bars') !== (requested && !suspended)) {
      app.classList.toggle('ios-theme-vertical-bars', requested && !suspended);
    }
  };
  const observer = new MutationObserver(reconcile);
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  doc.defaultView?.addEventListener('nativeUIShellRefresh', reconcile);
  reconcile();
  return () => {
    observer.disconnect();
    doc.defaultView?.removeEventListener('nativeUIShellRefresh', reconcile);
    const app = doc.querySelector<HTMLElement>(`ion-app[${horizontalFallbackAttribute}]`);
    if (app) {
      app.removeAttribute(horizontalFallbackAttribute);
      app.classList.add('ios-theme-vertical-bars');
    }
  };
};

/**
 * Applies one placement to the CSS layout and both Web/native projections.
 * Pass `rtl` when the document direction is known; otherwise the nearest `dir` attribute is used.
 */
export const setVerticalControlAreaPlacement = (placement: VerticalBarEdge | VerticalBarPlacement, rtl?: boolean): void => {
  if (typeof document === 'undefined') return;
  const app = document.querySelector<HTMLElement>('ion-app');
  if (!app) throw new Error('Vertical Control Area requires ion-app');
  const { edge, inset = 0 } = placement && typeof placement === 'object' ? placement : { edge: placement, inset: 0 };
  if (placement && typeof placement === 'object' && placement.nativeEdge !== undefined) {
    nativePlacements.set(app, { edge: placement.nativeEdge, rtl });
  }
  app.removeAttribute(horizontalFallbackAttribute);
  app.classList.toggle('ios-theme-vertical-bars', edge !== null);
  app.classList.toggle('ios-theme-vertical-bars-left', edge !== null && physicalVerticalBarEdge(edge, rtl ?? elementRtl(app)) === 'left');
  if (edge && Number.isFinite(inset) && inset > 0) app.style.setProperty('--ios-theme-vertical-bars-native-inset', `${inset}px`);
  else app.style.removeProperty('--ios-theme-vertical-bars-native-inset');
  document.defaultView?.dispatchEvent(new Event('nativeUIShellRefresh'));
};

/**
 * Call once after ion-app is mounted. Ionic markup remains the source of truth.
 * Native vertical buttons default to SwiftUI appearance.
 * See VerticalControlAreaOptions for source styling and local overrides.
 */
export const enableVerticalControlArea = async (options: VerticalControlAreaOptions = {}): Promise<VerticalControlAreaHandle> => {
  const handle = await enableNativeUIShell({
    buttonProjection: options.buttonProjection,
    buttonDefaultFill: options.buttonDefaultFill,
    controls: { tabs: true, toolbar: true },
    verticalBarsOnly: true,
  });
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
    options.buttonProjection ?? 'system',
    // Local source overrides can use this even when the startup projection is system.
    options.buttonDefaultFill ?? null,
    ...(['tabs', 'toolbar', 'segment', 'fab'] as const).map((component) => !controls || controls[component] === true),
    controls?.modal === true,
  ]);
  if (active && activeConfiguration !== configuration)
    return Promise.reject(
      new Error('Native UI Shell is already running with different controls; destroy it before changing configuration.'),
    );
  if (active) return active;
  activeConfiguration = configuration;
  const stopModals = observeVerticalBarsModals(document);
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
      destroy: () => {
        prehide?.stop();
        stopModals();
      },
      release,
    });
  return (start = active =
    (async () => {
      if (Capacitor.getPlatform() !== 'ios') return fallback('Requires Capacitor iOS');
      let runtime: NativeUIShellHandle | undefined;
      let overlays: ReturnType<typeof createOverlayController> | undefined;
      let metricsListener: Awaited<ReturnType<typeof plugin.addListener>> | undefined;
      let stopVerticalBarsLayout: (() => void) | undefined;
      try {
        const capabilities = await plugin.configure({ verticalBarsOnly: options.verticalBarsOnly === true });
        if (!capabilities.supported) return fallback('Requires iOS 26 or later');
        if (!options.verticalBarsOnly) stopVerticalBarsLayout = observeNativeVerticalBarsLayout(document);
        // The application owns device state and selects the rail through placement classes.
        const nativeVerticalBars = () => {
          const app = document.querySelector<HTMLElement>('ion-app.ios-theme-vertical-bars');
          if (!app) return false;
          const reported = nativePlacements.get(app);
          if (!reported?.edge) return false;
          const physicalEdge = app.classList.contains('ios-theme-vertical-bars-left') ? 'left' : 'right';
          return physicalEdge === physicalVerticalBarEdge(reported.edge, reported.rtl ?? elementRtl(app));
        };
        if (!options.verticalBarsOnly) {
          metricsListener = await plugin.addListener('webViewMetricsChange', (metrics) => {
            setConfig({ radius: metrics.radius });
          });
          await configureNativeTransition().catch(() => undefined);
        }
        const native = await createRuntime(document, plugin, options, nativeVerticalBars, options.verticalBarsOnly === true);
        runtime = combine(
          native,
          createVerticalBarsWebProjection(document, options, () => !nativeVerticalBars() || native.getStatus().state === 'stopped'),
        );
        if (controls?.modal === true) overlays = createOverlayController(document, plugin);
        return manage(runtime, {
          suspend: async () => {
            const restorePrehide = prehide?.suspend();
            const resumeOverlays = await overlays?.suspend();
            return () => {
              restorePrehide?.();
              resumeOverlays?.();
            };
          },
          release,
          destroy: async () => {
            await overlays?.destroy();
            await metricsListener?.remove().catch(() => {});
            stopVerticalBarsLayout?.();
            prehide?.stop();
            stopModals();
          },
        });
      } catch (error) {
        await overlays?.destroy();
        await runtime?.destroy();
        await metricsListener?.remove().catch(() => {});
        stopVerticalBarsLayout?.();
        return fallback(error instanceof Error ? error.message : String(error));
      }
    })());
};
