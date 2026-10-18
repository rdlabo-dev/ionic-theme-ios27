import { enableNativeUIShell as activate } from './activation';
import type { NativeUIShellRuntimeOptions, NativeUIShellHandle, NativeUIShellOptions, NativeUIShellRuntimeHandle } from './definitions';

type OverlayFactory = Parameters<typeof activate>[1];
const handles = new WeakMap<NativeUIShellRuntimeHandle, NativeUIShellHandle>();

/** Start one shell. Partial options override defaults; markup owns individual placement. */
export const startNativeUIShell = async (
  input: NativeUIShellOptions = {},
  overlayFactory?: OverlayFactory,
): Promise<NativeUIShellHandle> => {
  const root = input.root ?? (typeof document === 'undefined' ? undefined : document.body);
  const bars = { enabled: true, ...input.verticalBars };
  const host = bars.placement?.webHost;
  if (root && (!root.isConnected || root.ownerDocument !== document))
    throw new Error('Native UI requires a connected root in the current document');
  if (host && (!host.isConnected || host.ownerDocument !== document || root?.contains(host) || host.contains(root!)))
    throw new Error('The Web rail host must be connected in the current document and outside the source root');
  const legacy = input.controls;
  const automatic = input.ionic?.auto;
  const controls = automatic === undefined ? legacy : typeof automatic === 'object' ? automatic : {};
  const defaultEnabled = automatic !== false;
  const options: NativeUIShellRuntimeOptions = {
    ...input,
    root,
    source: 'auto',
    explicitControls: automatic !== undefined || (legacy?.buttons ?? legacy?.toolbar ?? true),
    verticalBars: bars,
    controls: {
      ...controls,
      tabs: controls?.tabs ?? defaultEnabled,
      segment: controls?.segment ?? defaultEnabled,
      fab: controls?.fab ?? defaultEnabled,
      toolbar: controls?.buttons ?? (automatic === undefined ? legacy?.toolbar : undefined) ?? defaultEnabled,
      popover: bars.popover ?? legacy?.popover ?? false,
    },
    verticalBarsOnly: bars.only ?? input.verticalBarsOnly ?? false,
    buttonProjection: bars.buttonProjection ?? input.buttonProjection ?? 'system',
    buttonDefaultFill: bars.buttonDefaultFill === 'glass' ? null : (bars.buttonDefaultFill ?? input.buttonDefaultFill ?? null),
    rail: host ? { host, edge: bars.placement?.edge === 'leading' ? 'left' : 'right' } : undefined,
  };
  const runtime = await activate(options, overlayFactory);
  const existing = handles.get(runtime);
  if (existing) return existing;
  let stopped = false;
  let queue = Promise.resolve();
  const change = (enabled: boolean) => {
    const operation = queue.then(async () => {
      if (stopped) throw new Error('Native UI Shell has been destroyed');
      if (bars.enabled === enabled) return;
      // Retire both surfaces before changing ownership. Resume also waits for native reconciliation.
      const lease = await runtime.suspend();
      try {
        if (stopped) throw new Error('Native UI Shell has been destroyed');
        bars.enabled = enabled;
        root?.ownerDocument.defaultView?.dispatchEvent(new Event('nativeUIShellRefresh'));
      } finally {
        await lease.resume();
      }
    });
    queue = operation.catch(() => {});
    return operation;
  };
  let destruction: Promise<void> | undefined;
  const destroy = runtime.destroy.bind(runtime);
  const handle: NativeUIShellHandle = {
    markForCheck: runtime.markForCheck.bind(runtime),
    getStatus: runtime.getStatus.bind(runtime),
    suspend: runtime.suspend.bind(runtime),
    enableVerticalControlArea: () => change(true),
    disableVerticalControlArea: () => change(false),
    destroy() {
      if (!destruction) {
        stopped = true;
        // Reserve native teardown immediately, preserving the shared startup queue.
        destruction = destroy();
      }
      return destruction;
    },
  };
  const managed = Object.assign(runtime, handle);
  handles.set(runtime, managed);
  return managed;
};

/** Enable the shared standard shell without loading the optional Ionic overlay adapter. */
export const enableNativeUIShell = (options: NativeUIShellOptions = {}): Promise<NativeUIShellHandle> => startNativeUIShell(options);
