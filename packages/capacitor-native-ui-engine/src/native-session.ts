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
  fallbackSelector: string;
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
  bridge: NativeSessionBridge,
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
  let destination: ProjectionDestination = 'native';
  let automaticMotion = false;
  let nativeScroll = false;
  let scrollOwner: HTMLElement | undefined;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let manager: WebProjection | undefined;
  let target: HTMLElement | undefined;
  let revision = 0;
  let generation = 0;
  let restoring = false;
  let initializing = false;
  let scheduled = false;
  let reconciling = false;
  const style = document.createElement('style');
  const marker = `data-native-ui-session-${config.id.replace(/[^a-zA-Z0-9-]/g, '')}`;
  style.textContent = `[${marker}="native"], [${marker}="native"] *, [${marker}="none"], [${marker}="none"] * {visibility:hidden!important}`;
  document.documentElement.append(style);
  const setVisibility = () => {
    if (!target) return;
    if (destination === 'web') target.removeAttribute(marker);
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
  const wake = () => {
    if (stopped) return;
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
        current.updated(undefined, [sourceID], ++revision);
        setVisibility();
        schedule();
      })
      .catch(() => {
        if (version !== generation || stopped) return;
        current.invalidate();
        void bridge.send({ action: 'visibility', visible: false }).catch(() => {});
        target?.removeAttribute(marker);
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
    const candidates = document.querySelectorAll(config.fallbackSelector);
    const found = candidates.length === 1 && candidates[0] instanceof HTMLElement ? candidates[0] : undefined;
    if (found !== target) {
      generation++;
      target?.removeAttribute(marker);
      await manager?.destroy();
      manager = undefined;
      if (stopped) return;
      target = found;
      sizeObserver.disconnect();
      if (target) sizeObserver.observe(target);
    }
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
          blocked: () => destination !== 'native' || automaticMotion,
          revision: () => revision,
          transient: true,
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
      manager.consider(++revision, sources());
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
        target?.removeAttribute(marker);
      } finally {
        reconciling = false;
      }
    });
  };
  const resized = () => {
    manager?.invalidate();
    schedule();
  };
  const sizeObserver = new ResizeObserver(resized);
  window.addEventListener('resize', resized);
  const onScroll = (event: Event) => {
    if (stopped || destination !== 'native' || !target || !(event.target instanceof Node) || !event.target.contains(target)) return;
    if (nativeScroll && event.target === scrollOwner) {
      manager?.changed(event.target);
      return;
    }
    if (!automaticMotion) {
      automaticMotion = true;
      manager?.begin();
      if (!manager?.token) void bridge.send({ action: 'visibility', visible: false }).catch(() => {});
      target.removeAttribute(marker);
    } else manager?.changed();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      automaticMotion = false;
      if (stopped || destination !== 'native') return;
      manager?.end();
      if (!manager?.restoring) schedule();
    }, 100);
  };
  document.addEventListener('scroll', onScroll, true);
  const observer = new MutationObserver(() => {
    // Do not react to Engine's own image styles or ordinary content updates.
    const matches = document.querySelectorAll(config.fallbackSelector);
    if (!target?.isConnected || matches.length !== 1 || matches[0] !== target) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  let events: ListenerHandle | undefined;
  const destroy = async () => {
    if (stopped) return;
    stopped = true;
    generation++;
    observer.disconnect();
    sizeObserver.disconnect();
    window.removeEventListener('resize', resized);
    document.removeEventListener('scroll', onScroll, true);
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
          automaticMotion = false;
          clearTimeout(scrollTimer);
          destination = next;
          generation++;
          void bridge.send({ action: 'destination', destination }).catch(() => {});
        }
        const version = generation;
        if (next === 'none') {
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
        } else if (next === 'web') {
          manager?.begin();
          if (!manager?.token) void bridge.send({ action: 'visibility', visible: false }).catch(() => {});
          setVisibility();
        } else if (next === 'native') {
          manager?.end();
          if (!manager?.restoring) schedule();
        }
        if (updated) {
          manager?.changed();
          if (destination === 'native') schedule();
        }
      },
    );
    const initial = await bridge.send({ action: 'connect' });
    if (generation === initialGeneration && ['native', 'web', 'none'].includes(initial?.destination)) destination = initial.destination;
    ready = true;
    schedule();
    return { destroy };
  } catch (error) {
    await destroy();
    throw error;
  }
};
