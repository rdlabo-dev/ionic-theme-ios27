import { toolbarOptions } from './shared/toolbar-options';
import { createDiagnostics } from './shared/diagnostics';
import { createHTMLWebProjection } from './html';
import { validateExtensions, type NativeUIExtension } from './extensions';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { nativeWebViewMetrics } from '../native-integration';
import type { NativeUIRuntimeHandle, NativeUIRuntimeOptions, NativeUIPlugin, VerticalBarEdge, WebViewMetrics } from './definitions';
import { createRuntime } from './runtime';
import { bounded, boundedListener } from './shared/bridge';
interface OverlayController {
  suspend(): Promise<() => void>;
  destroy(): Promise<void>;
}
type OverlayFactory = (
  doc: Document,
  plugin: NativeUIPlugin,
  options: NativeUIRuntimeOptions,
  retain: (deferActivation?: (id: string) => boolean) => () => void,
  nativeRail: () => boolean,
) => Promise<OverlayController>;
import { createVerticalBarsWebProjection } from './vertical-bars-web';
import { prehideVerticalBarsToolbarSources } from './prehide';
import { observeVerticalBarsModals } from './shared/modal';
export { defineNativeUI } from './extensions';
export type { NativeUIExtension, NativeUIValue } from './extensions';
export type {
  NativeUIComponent,
  NativeUIControls,
  NativeUIRuntimeHandle,
  NativeUIRuntimeOptions,
  NativeUIStatus,
  NativeUISuspension,
  VerticalBarEdge,
  WebViewMetrics,
} from './definitions';

const plugin = registerPlugin<NativeUIPlugin>('NativeUI');
export const NativeUI = plugin;
let active: Promise<NativeUIRuntimeHandle> | undefined;
let activeFailed = false;
let activeRoot: HTMLElement | undefined;
let activeRailHost: HTMLElement | undefined;
let activeConfiguration: string | undefined;
let activeExtensions: readonly NativeUIExtension[] = [];
let stopping: Promise<void> | undefined;

// Every stop entry point releases the activation immediately but reserves the
// shared native/DOM resources until its teardown has settled.
const stopActivation = (owner: Promise<NativeUIRuntimeHandle>, destruction: Promise<void>) => {
  if (active !== owner) return;
  active = undefined;
  activeFailed = false;
  activeConfiguration = undefined;
  activeRoot = undefined;
  activeRailHost = undefined;
  activeExtensions = [];
  stopping = destruction;
  const release = () => {
    if (stopping === destruction) stopping = undefined;
  };
  void destruction.then(release, release);
};
const web = (reason: string): NativeUIRuntimeHandle => ({
  markForCheck: () => {},
  getStatus: () => ({ state: 'web', projected: 0, updates: 0, reason }),
  suspend: async () => ({ resume: async () => {} }),
  destroy: async () => {},
});

const combine = (native: NativeUIRuntimeHandle, fallback: NativeUIRuntimeHandle): NativeUIRuntimeHandle => ({
  markForCheck() {
    native.markForCheck();
    fallback.markForCheck();
  },
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
  handle: NativeUIRuntimeHandle,
  lifecycle: {
    reason?: string;
    suspend?: () => (() => void) | undefined | Promise<(() => void) | undefined>;
    /** Registers teardown before it starts so direct destroy and disable share the same queue. */
    stopping?: (destruction: Promise<void>) => void;
    destroy?: () => void | Promise<void>;
  } = {},
): NativeUIRuntimeHandle => {
  let destruction: Promise<void> | undefined;
  return {
    markForCheck: () => {
      if (!destruction) handle.markForCheck();
    },
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
    destroy() {
      if (!destruction) {
        destruction = Promise.resolve().then(async () => {
          try {
            await handle.destroy();
          } finally {
            await lifecycle.destroy?.();
          }
        });
        lifecycle.stopping?.(destruction);
      }
      return destruction;
    },
  };
};

/** Reads the current native WebView geometry and applies it to page transitions. */
export const configureNativeTransition = async (): Promise<WebViewMetrics> => {
  const metrics =
    typeof document !== 'undefined' && Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('NativeUI')
      ? await bounded(plugin.getWebViewMetrics())
      : { radius: 0 };
  nativeWebViewMetrics.radius = metrics.radius;
  return metrics;
};

/** Resolves a logical vertical-bar edge to the physical side for the given direction. */
const physicalVerticalBarEdge = (edge: Exclude<VerticalBarEdge, null>, rtl: boolean): 'left' | 'right' =>
  (edge === 'leading') !== rtl ? 'left' : 'right';

const elementRtl = (element: Element): boolean => element.closest('[dir]')?.getAttribute('dir') === 'rtl';

const webProjection = (doc: Document, options: NativeUIRuntimeOptions, enabled: () => boolean = () => true) => {
  const ionic = () => createVerticalBarsWebProjection(doc, options, () => options.verticalBars?.enabled !== false && enabled());
  if (options.source === 'html') return createHTMLWebProjection(doc, options);
  if (options.source === 'auto') return combine(ionic(), createHTMLWebProjection(doc, options));
  return ionic();
};

/** Call once at application startup. Ionic markup remains the source of truth. */
export const enableNativeUI = (options: NativeUIRuntimeOptions = {}, overlayFactory?: OverlayFactory): Promise<NativeUIRuntimeHandle> => {
  if (options.enabled === false) {
    const current = active;
    if (current)
      stopActivation(
        current,
        current.then((handle) => handle.destroy()),
      );
    return (stopping ?? Promise.resolve()).then(() => web('Disabled'));
  }
  if (typeof document === 'undefined') return Promise.resolve(web('Requires a document'));
  const extensions = [...(options.extensions ?? [])];
  const nativeState: NonNullable<NativeUIRuntimeOptions['nativeState']> = (options.nativeState = {});
  try {
    validateExtensions(extensions, document);
  } catch (error) {
    return Promise.reject(error);
  }
  const controls = options.controls;
  const configuration = JSON.stringify([
    options.source ?? 'ionic',
    options.debug === true,
    options.explicitControls !== false,
    options.verticalBars?.enabled !== false,
    options.verticalBars?.placement?.edge,
    options.rail?.edge,
    options.verticalBarsOnly === true,
    toolbarOptions(options, false),
    toolbarOptions(options, true),
    options.buttonProjection ?? 'system',
    // Local source overrides can use this even when the startup projection is system.
    options.buttonDefaultFill ?? null,
    ...(['tabs', 'toolbar', 'segment', 'fab'] as const).map((component) => !controls || controls[component] === true),
    controls?.popover === true,
  ]);
  if (active && activeFailed) {
    const previous = active;
    stopActivation(
      previous,
      previous.then((handle) => handle.destroy()),
    );
  }
  if (
    active &&
    (activeConfiguration !== configuration ||
      activeRoot !== options.root ||
      activeRailHost !== options.rail?.host ||
      extensions.length !== activeExtensions.length ||
      extensions.some((extension, index) => extension !== activeExtensions[index]))
  )
    return Promise.reject(
      new Error('Native UI is already running with different controls or extensions; destroy it before changing configuration.'),
    );
  if (active) return active;
  activeConfiguration = configuration;
  activeRoot = options.root;
  activeRailHost = options.rail?.host;
  activeExtensions = extensions;
  const previousStop = stopping;
  let start: Promise<NativeUIRuntimeHandle>;
  const stop = (destruction: Promise<void>) => stopActivation(start, destruction);
  let releaseNative = async () => {};
  let retired = false;
  const pagehide = () => runtimeStopped('pagehide');
  const runtimeStopped = (cause: 'failure' | 'pagehide') => {
    if (cause === 'failure') {
      // Keep the Web rail usable, but replace this degraded activation on the next enable.
      if (active === start) activeFailed = true;
      void start
        .then(async () => {
          if (!retired) document.defaultView?.addEventListener('pagehide', pagehide, { once: true });
          await releaseNative();
        })
        .catch(() => {});
      return;
    }
    const destruction = start.then((handle) => handle.destroy());
    stop(destruction);
    void destruction.catch(() => {});
  };
  return (start = active =
    (async () => {
      // Native controls and DOM ownership are shared. A replacement activation
      // must wait until the old handle has finished clearing both surfaces.
      if (previousStop) await previousStop.catch(() => {});
      const platform = Capacitor.getPlatform();
      const diagnose = createDiagnostics(options.debug);
      const stopModals = options.source === 'html' ? () => {} : observeVerticalBarsModals(document);
      const prehide =
        platform !== 'android' && options.source !== 'html' && (options.controls === undefined || options.controls.toolbar === true)
          ? prehideVerticalBarsToolbarSources(document, () => options.verticalBars?.enabled !== false, options.root, options)
          : undefined;
      const fallback = (reason: string) => {
        diagnose(`web-fallback: ${reason}`);
        return manage(webProjection(document, options), {
          reason,
          suspend: () => prehide?.suspend(),
          destroy: () => {
            retired = true;
            document.defaultView?.removeEventListener('pagehide', pagehide);
            prehide?.stop();
            stopModals();
          },
          stopping: stop,
        });
      };
      if (platform !== 'ios' && platform !== 'android') return fallback('Requires Capacitor iOS or Android');
      if (!Capacitor.isPluginAvailable('NativeUI')) return fallback('Native UI plugin is not registered');
      let runtime: NativeUIRuntimeHandle | undefined;
      let overlays: OverlayController | undefined;
      let metricsListener: Awaited<ReturnType<typeof plugin.addListener>> | undefined;
      let nativeRelease: Promise<void> | undefined;
      releaseNative = () =>
        (nativeRelease ??= (async () => {
          try {
            await overlays?.destroy();
          } finally {
            if (metricsListener) await bounded(metricsListener.remove()).catch(() => {});
          }
        })());
      const cleanup = async () => {
        retired = true;
        try {
          await releaseNative();
        } finally {
          document.defaultView?.removeEventListener('pagehide', pagehide);
          prehide?.stop();
          stopModals();
        }
      };
      try {
        const capabilities = await bounded(plugin.configure({ verticalBarsOnly: options.verticalBarsOnly === true }));
        if (!capabilities.supported) return fallback('Native UI is unavailable on this device');
        const unavailableExtensions = new Map<string, string>();
        for (const extension of extensions) {
          if (platform === 'android' && extension.placement === 'tab-accessory')
            unavailableExtensions.set(extension.name, 'unsupported-placement: tab-accessory requires a supported iOS tab host.');
          else if (!capabilities.extensions?.includes(extension.name))
            unavailableExtensions.set(
              extension.name,
              'unregistered-extension: register this name in the native app before enabling the shell, then rebuild.',
            );
        }
        if (platform === 'android') {
          runtime = await createRuntime(
            document,
            plugin,
            {
              ...options,
              source: 'extensions',
              extensions,
              unavailableExtensions,
            },
            () => false,
            options.verticalBarsOnly === true,
            runtimeStopped,
          );
          runtime = combine(runtime, webProjection(document, options));
          metricsListener = await boundedListener(
            plugin.addListener('webViewMetricsChange', () => {
              document.defaultView?.dispatchEvent(new Event('nativeUIRefresh'));
            }),
          );
          return manage(runtime, {
            stopping: stop,
            destroy: cleanup,
          });
        }
        let deviceEdge: VerticalBarEdge = null;
        const ionicRoot = () => {
          if (options.source === 'html') return null;
          const root = options.root ?? document.body;
          return root.closest<HTMLElement>('ion-app') ?? root.querySelector<HTMLElement>('ion-app');
        };
        const updateNativeEdge = () => {
          const requested = options.verticalBars?.placement?.edge;
          const root = ionicRoot() ?? options.root ?? document.body;
          nativeState.edge =
            deviceEdge && (!requested || requested === deviceEdge) ? physicalVerticalBarEdge(deviceEdge, elementRtl(root)) : undefined;
        };
        // Ionic layout is read-only input; device metrics determine native availability.
        const nativeVerticalBars = () => {
          updateNativeEdge();
          if (options.verticalBars?.enabled === false) return false;
          const app = ionicRoot();
          if (!app?.classList.contains('ios-theme-vertical-bars')) return !!nativeState.edge;
          const physicalEdge = app.classList.contains('ios-theme-vertical-bars-left') ? 'left' : 'right';
          return physicalEdge === nativeState.edge;
        };
        const applyMetrics = (metrics: WebViewMetrics) => {
          if (!options.verticalBarsOnly) nativeWebViewMetrics.radius = metrics.radius;
          deviceEdge = metrics.verticalBarEdge ?? null;
          updateNativeEdge();
          document.defaultView?.dispatchEvent(new Event('nativeUIRefresh'));
        };
        metricsListener = await boundedListener(plugin.addListener('webViewMetricsChange', applyMetrics));
        await bounded(Promise.resolve().then(() => plugin.getWebViewMetrics()))
          .then(applyMetrics)
          .catch(() => undefined);
        const native = await createRuntime(
          document,
          plugin,
          { ...options, extensions, unavailableExtensions },
          nativeVerticalBars,
          options.verticalBarsOnly === true,
          runtimeStopped,
        );
        runtime = combine(
          native,
          webProjection(document, options, () => !nativeVerticalBars() || native.getStatus().projected === 0),
        );
        if (controls?.popover === true && overlayFactory)
          overlays = await overlayFactory(document, plugin, options, native.retain, nativeVerticalBars);
        return manage(runtime, {
          suspend: async () => {
            const restorePrehide = prehide?.suspend();
            const resumeOverlays = await overlays?.suspend();
            return () => {
              restorePrehide?.();
              resumeOverlays?.();
            };
          },
          stopping: stop,
          destroy: cleanup,
        });
      } catch (error) {
        await overlays?.destroy().catch(() => {});
        await runtime?.destroy().catch(() => {});
        if (metricsListener) await bounded(metricsListener.remove()).catch(() => {});
        return fallback(error instanceof Error ? error.message : String(error));
      }
    })());
};
