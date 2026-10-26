import { projectionPlacement } from './projection-placement.js';
import { getOverlayCoordinator } from './overlays.js';
import { readScrollPlacement } from './scroll-placement.js';
import { projectionAncestors } from './geometry.js';
import { createWebProjection, type WebProjection } from './web-projection.js';
import { createWebProjectionScope } from './web-projection-scope.js';
import { bindProjectionEvents, type ProjectionDestination } from './projection-events.js';
import type { Frame, ScrollPlacement, ListenerHandle, WebProjectionRequest } from './types.js';

/** Serialized by the native library. One registration owns one fixed fallback container. */
export interface NativeSessionConfiguration {
  id: string;
  plugin: string;
  projectionSelector: string;
  /** Recovery while native is requested. Explicit web/none destinations take precedence. */
  failedFallback?: 'web' | 'native';
  captureMode?: 'composited' | 'view';
  /** Native registration accepts a final placement in its reveal request. */
  placementHandoff?: boolean;
  receiveListeners?: {
    update?: string[];
    projection?: Partial<Record<ProjectionDestination, string[]>>;
    match?: Record<string, string | number | boolean>;
  };
}
export interface NativeSessionBridge {
  send(
    request:
      | WebProjectionRequest
      | { action: 'resume'; token?: string }
      | { action: 'visibility'; visible: boolean }
      | { action: 'track'; viewportWidth: number; scroll?: ScrollPlacement }
      | { action: 'connect' }
      | { action: 'destination'; destination: ProjectionDestination },
  ): Promise<any>;
  listen(listener: (event: { active: boolean }) => void): Promise<ListenerHandle>;
}

/** Native startup calls this; application code does not initialize or wrap the plugin. */
export const startNativeSession = async (
  config: NativeSessionConfiguration,
  nativeBridge: NativeSessionBridge,
  plugin: { addListener(name: string, listener: (event: unknown) => void): Promise<ListenerHandle> } = {
    addListener: async (name, listener) => {
      const capacitor = (
        globalThis as unknown as {
          Capacitor: {
            addListener(plugin: string, event: string, listener: (event: unknown) => void): ListenerHandle;
          };
        }
      ).Capacitor;
      return capacitor.addListener(config.plugin, name, listener);
    },
  },
) => {
  const sourceID = 'view';
  const listeners = config.receiveListeners;
  let stopped = false;
  let ready = false;
  let requestedDestination: ProjectionDestination = 'native';
  let destination: ProjectionDestination = 'native';
  const overlays = getOverlayCoordinator(document);
  const effectiveDestination = (): ProjectionDestination =>
    requestedDestination === 'native' && target && overlays.isCovered(target) ? 'web' : requestedDestination;
  let automaticMotion = false;
  let placementPending = false;
  let nativeScroll = false;
  let scrollOwner: HTMLElement | undefined;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let manager: WebProjection | undefined;
  let startingProjection = false;
  const beginProjection = () => {
    const previous = startingProjection;
    startingProjection = true;
    try {
      manager?.begin();
    } finally {
      startingProjection = previous;
    }
  };
  let target: HTMLElement | undefined;
  const placementOwner = {};
  let coveredToken: string | undefined;
  let placementEpoch = 0;
  const clearPlacement = () => {
    placementEpoch++;
    coveredToken = undefined;
    const binding = projectionPlacement(target);
    if (binding?.owner === placementOwner) {
      binding.projected = false;
      binding.owner = undefined;
    }
  };
  const bridge: NativeSessionBridge = {
    listen: (listener) => nativeBridge.listen(listener),
    send: (request) => {
      if (!config.placementHandoff) return nativeBridge.send(request);
      const binding = projectionPlacement(target);
      if (request.action === 'cover') {
        const epoch = ++placementEpoch;
        coveredToken = request.token;
        if (binding) {
          binding.owner = placementOwner;
          binding.projected = false;
        }
        return nativeBridge
          .send(request)
          .then((result) => {
            if (epoch === placementEpoch && binding === projectionPlacement(target) && binding?.owner === placementOwner)
              binding.projected = result?.shown === true;
            return result;
          })
          .catch((error) => {
            if (epoch === placementEpoch && binding?.owner === placementOwner) {
              clearPlacement();
              binding.invalidate();
            }
            throw error;
          });
      }
      const releasing = request.action === 'release' && request.token === coveredToken;
      const revealing =
        coveredToken &&
        (request.action === 'restore' || releasing || request.action === 'reset' || (request.action === 'visibility' && request.visible));
      if (revealing) placementEpoch++;
      const epoch = placementEpoch;
      const failed = () => {
        if (epoch !== placementEpoch || binding?.owner !== placementOwner) return;
        clearPlacement();
        binding.invalidate();
      };
      // Measure synchronously and use the existing ordered reveal/draw acknowledgement.
      try {
        const payload =
          revealing && binding?.owner === placementOwner
            ? { ...request, token: ('token' in request ? request.token : coveredToken)!, placement: binding.measure() }
            : request;
        return nativeBridge
          .send(payload)
          .then((result) => {
            if (
              epoch === placementEpoch &&
              (request.action === 'resume' || releasing || request.action === 'reset' || request.action === 'visibility')
            )
              clearPlacement();
            return result;
          })
          .catch((error) => {
            failed();
            throw error;
          });
      } catch (error) {
        failed();
        return Promise.reject(error);
      }
    },
  };

  let revision = 0;
  let contentRevision = 0;
  let generation = 0;
  let restoring = false;
  let initializing = false;
  let scheduled = false;
  let reconciling = false;
  const style = document.createElement('style');
  const marker = `data-native-ui-session-${config.id.replace(/[^a-zA-Z0-9-]/g, '')}`;
  style.textContent = `[${marker}="native"], [${marker}="native"] *, [${marker}="none"], [${marker}="none"] * {visibility:hidden!important}`;
  document.documentElement.append(style);
  const findTarget = () => {
    const matches = document.querySelectorAll(config.projectionSelector);
    return matches.length === 1 && matches[0] instanceof HTMLElement ? matches[0] : undefined;
  };
  const setVisibility = () => {
    if (!target) return;
    if (destination === 'web' || (destination === 'native' && placementPending)) target.removeAttribute(marker);
    else target.setAttribute(marker, destination);
  };
  const sources = () => {
    if (!target?.isConnected) return [];
    const r = target.getBoundingClientRect();
    const frame: Frame = { x: r.x, y: r.y, width: r.width, height: r.height };
    const scroll = scrollOwner && readScrollPlacement(target, scrollOwner, () => config.id);
    return [
      {
        element: target!,
        scrollElement: scrollOwner,
        control: { id: sourceID, ...frame, ...(scroll ? { scroll } : {}) },
      },
    ];
  };
  const recoverFailedProjection = async () => {
    if (stopped) return;
    const version = generation;
    const native = config.failedFallback === 'native' && effectiveDestination() === 'native' && !!target?.isConnected;
    await bridge.send({ action: 'visibility', visible: native }).catch(() => {});
    if (stopped || version !== generation) return;
    if (native || destination === 'none') setVisibility();
    else target?.removeAttribute(marker);
  };
  const applyFailedFallback = () => {
    if (!automaticMotion || destination !== 'native' || !target?.isConnected || manager?.token || manager?.restoring) return;
    const native = config.failedFallback === 'native';
    void bridge.send({ action: 'visibility', visible: native }).catch(() => {});
    if (native) setVisibility();
    else target.removeAttribute(marker);
  };
  const wake = () => {
    // begin() can synchronously retire a previous return before installing its next
    // image. That intermediate state is not a failed projection or a new reveal.
    if (stopped || startingProjection) return;
    applyFailedFallback();
    if (destination === 'web' && manager && !manager.token && !manager.restoring) {
      void bridge.send({ action: 'visibility', visible: false }).catch(() => {});
      target?.removeAttribute(marker);
      return;
    }
    if (restoring || !manager?.restoring || destination !== 'native') return;
    restoring = true;
    const version = generation;
    const current = manager;
    // The native library acknowledges after the live views have entered a draw pass.
    void bridge
      .send({ action: 'resume' })
      .then(() => {
        if (stopped || version !== generation || current !== manager) return;
        placementPending = false;
        current.updated(undefined, [sourceID], ++revision);
        setVisibility();
        schedule();
      })
      .catch(() => {
        if (version !== generation || stopped) return;
        current.invalidate();
        void recoverFailedProjection();
      })
      .finally(() => {
        restoring = false;
        wake();
      });
  };
  const reconcile = async () => {
    if (stopped || initializing || automaticMotion) return;
    if (manager?.restoring) {
      wake();
      return;
    }
    const found = findTarget();
    if (found !== target) {
      generation++;
      clearPlacement();
      target?.removeAttribute(marker);
      await manager?.destroy();
      manager = undefined;
      if (stopped) return;
      target = found;
      placementPending = false;
      sizeObserver.disconnect();
      if (target) sizeObserver.observe(target);
    }
    refreshScrollListeners();
    destination = effectiveDestination();
    if (!target) {
      await bridge.send({ action: 'visibility', visible: false });
      return;
    }
    if (!manager) {
      initializing = true;
      const version = generation;
      try {
        const created = await createWebProjection(createWebProjectionScope(target, config.id), bridge, {
          wake,
          blocked: () => destination !== 'native' || automaticMotion || (placementPending && !manager?.token),
          revision: () => revision,
          captureRevision: config.captureMode === 'view' ? () => contentRevision : undefined,
          transient: true,
          opaqueUnderlay: config.captureMode === 'view',
        });
        if (stopped || version !== generation) {
          await created.destroy();
          return;
        }
        manager = created;
      } finally {
        initializing = false;
      }
    }
    if (stopped) return;
    if (destination === 'native' && placementPending) {
      await bridge.send({ action: 'visibility', visible: false });
      setVisibility();
      return;
    }
    if (destination === 'native') {
      const version = generation;
      await bridge.send({ action: 'visibility', visible: true });
      if (stopped || version !== generation || destination !== 'native') return;
      setVisibility();
      scrollOwner = [...projectionAncestors(target!)].find((element) => {
        const style = getComputedStyle(element);
        return (
          /auto|scroll/.test(style.overflowX + style.overflowY) &&
          (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth)
        );
      });
      const scroll = scrollOwner && readScrollPlacement(target!, scrollOwner, () => config.id);
      const tracking = await bridge.send({ action: 'track', viewportWidth: innerWidth, ...(scroll ? { scroll } : {}) });
      if (stopped || version !== generation) return;
      nativeScroll = tracking?.tracked === true;
      manager.consider(config.captureMode === 'view' ? contentRevision : ++revision, sources());
    } else {
      await bridge.send({ action: 'visibility', visible: false });
      setVisibility();
    }
  };
  const schedule = () => {
    if (stopped) return;
    scheduled = true;
    if (!ready || reconciling) return;
    reconciling = true;
    queueMicrotask(async () => {
      try {
        while (scheduled && !stopped) {
          scheduled = false;
          await reconcile();
        }
      } catch {
        // Preserve the selected recovery policy without overriding a newer destination.
        await recoverFailedProjection();
      } finally {
        reconciling = false;
        if (scheduled) schedule();
      }
    });
  };
  const resized = () => {
    manager?.invalidate();
    schedule();
  };
  const sizeObserver = new ResizeObserver(resized);
  window.addEventListener('resize', resized);
  const scrollAncestors = new Set<HTMLElement>();
  const handledScrolls = new WeakSet<Event>();
  const onScroll = (event: Event) => {
    const owner = event.composedPath()[0] ?? event.target;
    if (
      stopped ||
      destination !== 'native' ||
      !target ||
      handledScrolls.has(event) ||
      (owner !== document && ![...projectionAncestors(target)].includes(owner as HTMLElement))
    )
      return;
    handledScrolls.add(event);
    if (nativeScroll && owner === scrollOwner) {
      manager?.changed(owner as EventTarget);
      return;
    }
    if (!automaticMotion) {
      // A fresh gesture supersedes the preceding presentation's pending draw ACK.
      // begin() retires that return image and starts another presentation on the same manager.
      if (restoring || manager?.restoring) generation++;
      automaticMotion = true;
      beginProjection();
      placementPending = config.failedFallback !== 'native';
      if (manager?.token) target.removeAttribute(marker);
      else applyFailedFallback();
    } else if (config.captureMode === 'view') manager?.moved();
    else manager?.changed();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      automaticMotion = false;
      if (stopped || destination !== 'native') return;
      manager?.end();
      if (!manager?.restoring) schedule();
    }, 100);
  };
  // Listen on composed-tree ancestors themselves: non-composed scroll events inside
  // Ionic's shadow tree never reach document, and Node.contains excludes slotted children.
  const refreshScrollListeners = () => {
    const next = new Set(target ? projectionAncestors(target) : []);
    const changed = next.size !== scrollAncestors.size || [...next].some((element) => !scrollAncestors.has(element));
    for (const element of scrollAncestors)
      if (!next.has(element)) {
        element.removeEventListener('scroll', onScroll);
        element.removeEventListener('slotchange', slotChanged);
        scrollAncestors.delete(element);
      }
    for (const element of next)
      if (!scrollAncestors.has(element)) {
        element.addEventListener('scroll', onScroll, { passive: true });
        element.addEventListener('slotchange', slotChanged);
        scrollAncestors.add(element);
      }
    if (changed) {
      nativeScroll = false;
      scrollOwner = undefined;
      manager?.invalidate();
      schedule();
    }
  };
  const slotChanged = () => {
    refreshScrollListeners();
    schedule();
  };
  document.addEventListener('scroll', onScroll, true);
  const observer = new MutationObserver((records) => {
    refreshScrollListeners();
    if (findTarget() !== target) schedule();
    // Moving the same host into or out of an overlay changes coverage, not registration.
    else if (target && records.some((record) => record.type === 'childList')) applyDestination(effectiveDestination());
  });
  observer.observe(document.documentElement, { childList: true, attributes: true, subtree: true });
  const applyDestination = (next: ProjectionDestination, force = false) => {
    if (stopped || (!force && next === destination)) return;
    automaticMotion = false;
    clearTimeout(scrollTimer);
    destination = next;
    generation++;
    const version = generation;
    if (destination === 'none') {
      // Retire native visibility before releasing images; release must not resurrect hidden views.
      void bridge
        .send({ action: 'visibility', visible: false })
        .then(() => {
          if (destination !== 'none' || version !== generation || stopped) return;
          manager?.invalidate();
          setVisibility();
        })
        .catch(() => {
          if (destination !== 'none' || version !== generation || stopped) return;
          manager?.invalidate();
          setVisibility();
        });
    } else if (destination === 'web') {
      beginProjection();
      if (!manager?.token) void bridge.send({ action: 'visibility', visible: false }).catch(() => {});
      setVisibility();
    } else if (destination === 'native') {
      manager?.end();
      if (!manager?.restoring) schedule();
    }
  };
  // Let a renderer claim a native child window during the same Ionic event dispatch.
  const stopOverlays = overlays.subscribe(() => queueMicrotask(() => applyDestination(effectiveDestination())));
  let events: ListenerHandle | undefined;
  const destroy = async () => {
    if (stopped) return;
    stopped = true;
    clearPlacement();
    generation++;
    stopOverlays();
    observer.disconnect();
    sizeObserver.disconnect();
    window.removeEventListener('resize', resized);
    document.removeEventListener('scroll', onScroll, true);
    for (const element of scrollAncestors) {
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('slotchange', slotChanged);
    }
    scrollAncestors.clear();
    clearTimeout(scrollTimer);
    target?.removeAttribute(marker);
    style.remove();
    await Promise.allSettled([Promise.resolve(events?.remove()), manager?.destroy()]);
  };
  try {
    const initialGeneration = generation;
    events = await bindProjectionEvents(
      {
        addListener: (name, listener) => plugin.addListener(name, listener),
        update: listeners?.update,
        projection: listeners?.projection,
        accepts: (event) =>
          !listeners?.match ||
          Object.entries(listeners?.match).every(
            ([key, value]) => typeof event === 'object' && event !== null && (event as Record<string, unknown>)[key] === value,
          ),
      },
      (next, updated) => {
        if (stopped) return;
        if (next) {
          if (next === 'native') placementPending = false;
          requestedDestination = next;
          void bridge.send({ action: 'destination', destination: next }).catch(() => {});
          applyDestination(effectiveDestination(), true);
        }
        if (updated) {
          contentRevision++;
          manager?.changed();
          if (destination === 'native') schedule();
        }
      },
    );
    const initial = await bridge.send({ action: 'connect' });
    if (generation === initialGeneration && ['native', 'web', 'none'].includes(initial?.destination))
      requestedDestination = initial.destination;
    destination = effectiveDestination();
    ready = true;
    schedule();
    return {
      destroy,
      show: () => {
        placementPending = false;
        requestedDestination = 'native';
        applyDestination(effectiveDestination(), true);
      },
      hide: () => {
        requestedDestination = destination = 'none';
        generation++;
        automaticMotion = false;
        clearTimeout(scrollTimer);
        manager?.invalidate();
        setVisibility();
      },
    };
  } catch (error) {
    await destroy();
    throw error;
  }
};
