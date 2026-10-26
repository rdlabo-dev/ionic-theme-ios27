/** Shared by npm consumers and the runtime injected from the native library. */
export type OverlayPhase = 'willPresent' | 'didPresent' | 'willDismiss' | 'didDismiss' | 'change';
export interface OverlayChange {
  element?: HTMLElement;
  phase: OverlayPhase;
  event?: Event;
}
export interface OverlayDefinition {
  selector: string;
  events: Partial<Record<OverlayPhase, string>>;
}
export interface OverlayOptions {
  /** Additional overlay components; Ionic defaults remain enabled. */
  additional?: readonly OverlayDefinition[];
  exclude?: string;
  /** Return undefined to use the normal DOM/backdrop relationship. */
  covers?: (overlay: HTMLElement, target: HTMLElement) => boolean | undefined;
}
export interface OverlayElement extends HTMLElement {
  presented?: boolean;
  overlayIndex?: number;
  showBackdrop?: boolean;
  initialBreakpoint?: number;
  backdropBreakpoint?: number;
}

/** Whether a Web overlay covers the underlying surface, independently of its renderer. */
export const usesOverlayBackdrop = (element: HTMLElement, breakpoint?: number): boolean => {
  if (element.matches('ion-toast, ion-menu')) return false;
  const overlay = element as OverlayElement;
  if (overlay.showBackdrop === false) return false;
  if (!element.matches('ion-modal')) return true;
  const height = breakpoint ?? overlay.initialBreakpoint;
  return height === undefined || height > (overlay.backdropBreakpoint ?? 0);
};

const key = Symbol.for('@rdlabo/capacitor-native-ui-engine/overlays/v1');
const createCoordinator = (doc: Document) => {
  const active = new Set<HTMLElement>();
  const native = new Set<HTMLElement>();
  const listeners = new Set<(change: OverlayChange) => void>();
  const breakpoints = new WeakMap<HTMLElement, number>();
  const dismissed = new WeakSet<HTMLElement>();
  const registrations = new Map<string, () => void>();
  let definitions: readonly OverlayDefinition[] = [];
  let options: OverlayOptions = {};
  let routes = new Map<string, { phase: OverlayPhase; selector: string }>();
  let observer: MutationObserver | undefined;
  const notify = (change: OverlayChange) => {
    for (const listener of [...listeners]) {
      try {
        listener(change);
      } catch (error) {
        console.error('Native UI overlay listener failed', error);
      }
    }
  };
  const accept = (element: HTMLElement, phase: OverlayPhase, event?: Event) => {
    if (phase === 'willPresent' || phase === 'didPresent') {
      dismissed.delete(element);
      active.add(element);
    } else if (phase === 'didDismiss') {
      dismissed.add(element);
      active.delete(element);
      native.delete(element);
      breakpoints.delete(element);
    }
    const breakpoint = (event as CustomEvent<{ breakpoint?: number }> | undefined)?.detail?.breakpoint;
    // Zero begins sheet dismissal; retain coverage until DidDismiss retires the surface.
    if (typeof breakpoint === 'number' && breakpoint > 0) breakpoints.set(element, breakpoint);
    notify({ element, phase, event });
  };
  const refresh = (initial = false) => {
    let changed = false;
    for (const element of active)
      if (!element.isConnected || element.ownerDocument !== doc || !definitions.some(({ selector }) => element.matches(selector))) {
        active.delete(element);
        native.delete(element);
        changed = true;
      }
    for (const element of doc.querySelectorAll<OverlayElement>(definitions.map(({ selector }) => selector).join(','))) {
      if (
        !active.has(element) &&
        !dismissed.has(element) &&
        (initial || !element.matches('ion-popover')) &&
        (element.presented || element.classList.contains('show-menu'))
      ) {
        active.add(element);
        changed = true;
      }
    }
    if (changed) notify({ phase: 'change' });
  };
  return {
    get active(): ReadonlySet<HTMLElement> {
      return active;
    },
    subscribe(listener: (change: OverlayChange) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Renderer ownership is explicit because a child native window is outside the DOM stack. */
    setNative(element: HTMLElement, value: boolean) {
      if (native.has(element) === value) return;
      if (value) native.add(element);
      else native.delete(element);
      notify({ element, phase: 'change' });
    },
    isExcluded(element: HTMLElement) {
      return !!options.exclude && element.matches(options.exclude);
    },
    isNative(element: HTMLElement) {
      return native.has(element);
    },
    get stack() {
      const stack = [...active].filter((element) => element.isConnected && element.ownerDocument === doc);
      const order = (element: HTMLElement) => {
        const z = Number.parseFloat(doc.defaultView!.getComputedStyle(element).zIndex);
        return Number.isFinite(z) ? z : ((element as OverlayElement).overlayIndex ?? 0);
      };
      stack.sort((a, b) => order(a) - order(b));
      return stack;
    },
    isCovered(target: HTMLElement) {
      const stack = this.stack;
      const owner = stack.reduce((last, element, index) => (element.contains(target) ? index : last), -1);
      return stack.some((element, index) => {
        if (native.has(element) || (options.exclude && element.matches(options.exclude))) return false;
        const override = options.covers?.(element, target);
        if (override !== undefined) return override;
        return (
          index > owner &&
          !element.contains(target) &&
          (element.matches('ion-menu') || usesOverlayBackdrop(element, breakpoints.get(element)))
        );
      });
    },
    enable(defaults: readonly OverlayDefinition[], config?: OverlayOptions) {
      const nextOptions = { ...options, ...config };
      const nextDefinitions = [...defaults, ...(nextOptions.additional ?? [])];
      if (nextOptions.exclude) doc.querySelector(nextOptions.exclude);
      const nextRoutes = new Map<string, { phase: OverlayPhase; selector: string }>();
      for (const definition of nextDefinitions) {
        doc.querySelector(definition.selector);
        for (const [phase, name] of Object.entries(definition.events)) {
          const existing = nextRoutes.get(name);
          if (existing && existing.phase !== phase) throw new TypeError(`Overlay event "${name}" has conflicting phases`);
          nextRoutes.set(name, {
            phase: phase as OverlayPhase,
            selector: existing ? `${existing.selector}, ${definition.selector}` : definition.selector,
          });
        }
      }
      options = nextOptions;
      definitions = nextDefinitions;
      routes = nextRoutes;
      for (const name of routes.keys()) {
        if (registrations.has(name)) continue;
        const listener = (event: Event) => {
          const route = routes.get(name)!;
          const element = event
            .composedPath()
            .find((node): node is HTMLElement => node instanceof doc.defaultView!.HTMLElement && node.matches(route.selector));
          if (element) accept(element, route.phase, event);
        };
        doc.addEventListener(name, listener, true);
        registrations.set(name, () => doc.removeEventListener(name, listener, true));
      }
      for (const [name, remove] of registrations)
        if (!routes.has(name)) {
          remove();
          registrations.delete(name);
        }
      const initial = !observer;
      if (!observer) {
        observer = new MutationObserver(() => refresh());
        observer.observe(doc.documentElement, { childList: true, subtree: true });
        doc.addEventListener('nativeUIOverlayAdopted', (event) => {
          const element = (event as CustomEvent<HTMLElement>).detail;
          if (element?.ownerDocument === doc) accept(element, 'willPresent', event);
        });
      }
      refresh(initial);
      if (initial || config) notify({ phase: 'change' });
    },
  };
};
export type OverlayCoordinator = ReturnType<typeof createCoordinator>;

/** Access is inert: only the explicit framework initializer installs DOM listeners. */
export const getOverlayCoordinator = (doc: Document): OverlayCoordinator => {
  const shared = doc as unknown as Record<symbol, OverlayCoordinator>;
  return (shared[key] ??= createCoordinator(doc));
};
