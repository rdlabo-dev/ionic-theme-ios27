import type { PluginListenerHandle } from '@capacitor/core';
import { LIFECYCLE_WILL_ENTER, LIFECYCLE_WILL_LEAVE, LIFECYCLE_DID_ENTER, LIFECYCLE_DID_LEAVE } from '@ionic/core';
import { getNativeSearchBindings, setNativeUIShellIntegration } from '../native-integration';
import { createSearchSupport } from './components/searchable-tabs';
import type {
  ShellActivation,
  ShellSnapshot,
  NativeUIShellHandle,
  NativeUIShellOptions,
  NativeUIShellPlugin,
  NativeUIShellStatus,
} from './definitions';
import { readCandidate, selector, shadowSelector, motionSelector, isFoldableRailCandidate } from './components';
import {
  activateProjectedElement,
  createFoldablePageState,
  isFoldableRailSource,
  marker,
  prehideOnlyMutation,
  rejectedClass,
  unprojected,
} from './shared/dom';
import { createIconRenderer } from './shared/icons';
import type { Candidate } from './shared/candidate';
import { CSS_MOTION_EVENTS } from './shared/events';
import { createCrossfade, fadeMarker } from './shared/crossfade';

const overlays = 'ion-modal, ion-popover, ion-alert, ion-action-sheet, ion-loading, ion-picker, ion-toast, ion-menu';
const overlayNames = ['Modal', 'Popover', 'Alert', 'ActionSheet', 'Loading', 'Picker', 'Toast'];
const foldableRailMarker = 'data-native-ui-shell-foldable-rail';
const foldableRailMemberMarker = 'data-native-ui-shell-foldable-rail-member';

// A failed bridge must not leave the source inaccessible indefinitely.
const bounded = <T>(promise: Promise<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Native UI Shell bridge timed out')), 5000);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });

export const createRuntime = async (
  doc: Document,
  plugin: NativeUIShellPlugin,
  options: NativeUIShellOptions = {},
  nativeFoldableRail = true,
): Promise<NativeUIShellHandle> => {
  const win = doc.defaultView!;
  const icons = createIconRenderer();
  const crossfade = createCrossfade(win);
  const ids = new WeakMap<Element, string>();
  let rejected = new WeakMap<HTMLElement, string>();
  const sources = new Map<HTMLElement, string | null>();
  const foldableRailOwners = new Set<HTMLElement>();
  const foldableRailMembers = new Set<HTMLElement>();
  const suspended = new Set<HTMLElement[]>();
  const pages = new Set<HTMLElement>();
  const foldablePages = createFoldablePageState();
  const presented = new Set<HTMLElement>();
  const manualSuspensions = new Set<symbol>();
  const moving = new Map<HTMLElement, Set<string>>();
  const observed = new Set<Element | ShadowRoot>();
  const listeners = new AbortController();
  let actions = new Map<string, HTMLElement>();
  let nextId = 0;
  let revision = 0;
  let acceptedRevision = 0;
  let updatingRevision: number | undefined;
  let pendingActivations: ShellActivation[] = [];
  let lastSequence = 0;
  let lastSnapshot = '';
  let viewport = `${win.innerWidth}:${win.innerHeight}`;
  let forceRefresh = false;
  let dirty = false;
  let pending = false;
  let stopped = false;
  /** True while a tab-switch handoff should skip crossfade. */
  let tabSwitchHandoff = false;
  /** Keep instant updates until this time — DidLeave often precedes the retire sync. */
  let handoffUntil = 0;
  /** Tab switch armed while a sync was already in flight; extend instant past that sync. */
  let handoffAcrossPending = false;
  /** Captured at the start of each sync so an in-flight update keeps a stable duration. */
  let handoffInstant = false;
  /** Retire native controls immediately as a modal starts covering the page. */
  let modalPresentHandoff = false;
  let frame = 0;
  let updates = 0;
  let reason: string | undefined;
  let listener: PluginListenerHandle | undefined;
  let searchListener: PluginListenerHandle | undefined;
  let waiters: (() => void)[] = [];
  const control = (kind: Candidate['control']['kind']): keyof NonNullable<NativeUIShellOptions['controls']> => {
    if (kind === 'ion-tab-bar') return 'tabs';
    if (kind === 'ion-segment') return 'segment';
    if (kind === 'ion-fab') return 'fab';
    return 'toolbar';
  };
  const controlEnabled = (candidate: Candidate) => {
    const controls = options.controls;
    return controls === undefined || controls[control(candidate.control.kind)] === true;
  };
  const id = (element: Element) => {
    let value = ids.get(element);
    if (!value) {
      value = `shell-${++nextId}`;
      ids.set(element, value);
    }
    return value;
  };
  const style = doc.createElement('style');
  const hidden = `[${marker}]:not([${fadeMarker}])`;
  style.textContent = `${hidden}, ${hidden} *, ${hidden}::before, ${hidden}::after, ${hidden}::part(native) { visibility: hidden !important; }
    [${marker}], [${marker}] * { pointer-events: none !important; }
    /* Ionic disables the covered page while a menu is open. Foldable rail
       controls remain outside that page; zero specificity preserves any
       pointer-events rule supplied by the application itself. */
    :where(.menu-content-open) :where([${foldableRailMarker}]) {
      pointer-events: auto;
    }
    :where(.menu-content-open) :where([${foldableRailMarker}]) > :where(:not([${foldableRailMemberMarker}])) {
      pointer-events: none;
    }`;

  const restore = (element: HTMLElement) => {
    lastSnapshot = '';
    search.release(element);
    element.removeAttribute(marker);
    if (!stopped) crossfade.play(element, false, handoffInstant || isFoldableRailSource(element));
    if (element.getAttribute('aria-hidden') === 'true') {
      const previous = sources.get(element);
      if (previous == null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', previous);
    }
    sources.delete(element);
    element.dispatchEvent(new CustomEvent('nativeUIShellChange'));
  };
  const restoreAll = () => {
    Array.from(sources.keys()).forEach(restore);
    foldableRailOwners.forEach((element) => element.removeAttribute(foldableRailMarker));
    foldableRailOwners.clear();
    foldableRailMembers.forEach((element) => element.removeAttribute(foldableRailMemberMarker));
    foldableRailMembers.clear();
  };
  const finishWaiters = () => {
    const current = waiters;
    waiters = [];
    current.forEach((resolve) => resolve());
  };
  const schedule = () => {
    if (stopped) return;
    dirty = true;
    if (!pending && !frame) frame = win.requestAnimationFrame(() => void sync());
  };
  const search = createSearchSupport(doc, id, schedule);
  const candidateSources = (candidate: Candidate) => candidate.sources ?? [candidate.element];
  const setRejected = (element: HTMLElement, value: boolean) => {
    element.classList.toggle(rejectedClass, value);
  };
  const measuringPointerPages = new WeakSet<HTMLElement>();
  const readEnabledCandidate = (element: HTMLElement): Candidate | undefined => {
    const pointerPage = isFoldableRailCandidate(element) ? element.closest<HTMLElement>('.ion-page') : undefined;
    let candidate: Candidate | undefined;
    if (pointerPage && getComputedStyle(pointerPage).pointerEvents === 'none') {
      const previous = pointerPage.style.getPropertyValue('pointer-events');
      const priority = pointerPage.style.getPropertyPriority('pointer-events');
      const hadStyle = pointerPage.hasAttribute('style');
      measuringPointerPages.add(pointerPage);
      pointerPage.style.setProperty('pointer-events', 'auto', 'important');
      try {
        candidate = readCandidate(element, id);
      } finally {
        if (previous) pointerPage.style.setProperty('pointer-events', previous, priority);
        else pointerPage.style.removeProperty('pointer-events');
        if (!hadStyle && !pointerPage.style.length) pointerPage.removeAttribute('style');
        win.setTimeout(() => measuringPointerPages.delete(pointerPage), 0);
      }
    } else candidate = readCandidate(element, id);
    if (candidate && isFoldableRailCandidate(element)) {
      if (!nativeFoldableRail) return undefined;
      candidate.control.placement = 'foldable-rail';
    }
    return candidate && controlEnabled(candidate) ? candidate : undefined;
  };
  const flush = async () => {
    if (stopped) return;
    schedule();
    try {
      await bounded(new Promise<void>((resolve) => waiters.push(resolve)));
    } catch (error) {
      await fail(error);
    }
  };
  const blocked = (element: HTMLElement) =>
    foldablePages.isDeparted(element) ||
    (!isFoldableRailSource(element) &&
      (Array.from(suspended).some((scopes) => scopes.some((scope) => scope.contains(element))) ||
        Array.from(pages).some((scope) => scope.contains(element)) ||
        Array.from(moving.keys()).some((surface) => surface.contains(element))));
  const painted = () => new Promise<void>((resolve) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
  const overlayOpen = (includeMenu = true) => {
    for (const element of presented) if (!element.isConnected) presented.delete(element);
    const presentedOverlayOpen = Array.from(presented).some((element) => includeMenu || !element.matches('ion-menu'));
    return (
      manualSuspensions.size > 0 ||
      presentedOverlayOpen ||
      Array.from(doc.querySelectorAll(overlays)).some(
        (element) =>
          (includeMenu || !element.matches('ion-menu')) &&
          ((element as Element & { presented?: boolean }).presented || element.classList.contains('show-menu')),
      )
    );
  };
  // Compare source data before PNG rendering mutates each item's payload.
  const signature = (candidate: Candidate) =>
    JSON.stringify({ control: candidate.control, icons: candidate.icons.map(({ source }) => source) });
  const read = (): Candidate[] => {
    search.keepSearchTabsVisible();
    for (const page of pages) if (!page.isConnected) pages.delete(page);
    for (const surface of moving.keys()) if (!surface.isConnected) moving.delete(surface);
    if (doc.hidden || overlayOpen(false)) return [];
    if (win.visualViewport && (win.visualViewport.scale !== 1 || win.visualViewport.offsetTop !== 0) && !search.hasActive()) return [];
    const menuOpen = overlayOpen();
    const candidates = unprojected(sources.keys(), () =>
      search
        .decorate(
          Array.from(doc.querySelectorAll<HTMLElement>(selector))
            .filter((element) => !foldablePages.isDeparted(element) && (!blocked(element) || (menuOpen && isFoldableRailSource(element))))
            .map(readEnabledCandidate)
            .filter((candidate): candidate is Candidate => !!candidate),
          blocked,
        )
        .filter((candidate) => !rejected.has(candidate.element) || rejected.get(candidate.element) !== signature(candidate)),
    );
    return menuOpen ? candidates.filter((candidate) => isFoldableRailCandidate(candidate.element)) : candidates;
  };
  const observe = () => {
    const wanted = new Set<Element | ShadowRoot>();
    for (const element of Array.from(doc.querySelectorAll<HTMLElement>(selector))) {
      wanted.add(element);
      if (element.parentElement) wanted.add(element.parentElement);
      const inspectShadow = (node: Element) => {
        if (node.shadowRoot) {
          wanted.add(node.shadowRoot);
          node.shadowRoot.querySelectorAll('ion-icon').forEach(inspectShadow);
        }
      };
      inspectShadow(element);
      element.querySelectorAll(shadowSelector).forEach(inspectShadow);
    }
    // Reconnect only when the set changes; no per-frame observer allocation.
    if (wanted.size === observed.size && Array.from(wanted).every((element) => observed.has(element))) return;
    observer.disconnect();
    resize.disconnect();
    observed.clear();
    observer.observe(doc.documentElement, observation);
    for (const element of wanted) {
      observed.add(element);
      if (element instanceof ShadowRoot) observer.observe(element, observation);
      else resize.observe(element);
    }
  };
  const fail = async (error: unknown) => {
    reason = error instanceof Error ? error.message : String(error);
    console.warn('[Native UI Shell] Returning to Web:', reason);
    await handle.destroy();
  };
  const sync = async () => {
    frame = 0;
    dirty = false;
    pending = true;
    handoffInstant = tabSwitchHandoff || handoffAcrossPending || modalPresentHandoff || win.performance.now() < handoffUntil;
    modalPresentHandoff = false;
    try {
      const size = `${win.innerWidth}:${win.innerHeight}`;
      // WebKit can resize before Ionic's fixed DOM positions catch up.
      // Measure on the next frame instead of retiring a valid native search.
      if (viewport !== size) {
        viewport = size;
        dirty = true;
        return;
      }
      observe();
      const candidates = read();
      const signatures = new Map(candidates.map((candidate) => [candidate.element, signature(candidate)]));
      for (const candidate of candidates) {
        for (const icon of candidate.icons) {
          const field = icon.field ?? 'icon';
          icon.item[field] = await icons.render(
            icon.source,
            field === 'icon' ? icon.item.iconWidth! : icon.item.closeIconWidth!,
            field === 'icon' ? icon.item.iconHeight! : icon.item.closeIconHeight!,
          );
        }
      }
      if (stopped || dirty) return;
      const retained = new Set(candidates.flatMap(candidateSources));
      const removed = Array.from(sources.keys()).filter((element) => !retained.has(element));
      if (removed.length) {
        // Restore the source and let WebKit paint before removing its native cover.
        removed.forEach(restore);
        // The outgoing tab is no longer visible, so waiting two frames only leaves its
        // native snapshot over the destination. Stack transitions still need the paint.
        if (!handoffInstant && removed.some((element) => !isFoldableRailSource(element))) {
          await painted();
          if (stopped || dirty) return;
        }
      }
      const data = { viewportWidth: win.innerWidth, controls: candidates.map((candidate) => candidate.control) };
      const serialized = JSON.stringify(data);
      if (serialized === lastSnapshot && !forceRefresh) return;
      const snapshot: ShellSnapshot = { ...data, revision: ++revision, transitionDuration: crossfade.duration(handoffInstant) };
      // A native visibility notification during this update must survive its ack.
      forceRefresh = false;
      updates++;
      updatingRevision = snapshot.revision;
      const result = await bounded(plugin.update(snapshot));
      if (stopped) return;
      if (result.revision !== snapshot.revision) throw new Error('Native UI Shell revision mismatch');
      if (`${win.innerWidth}:${win.innerHeight}` !== size) {
        lastSnapshot = '';
        dirty = true;
        return;
      }
      if (result.rejectedSearches?.length) {
        search.reject(result.rejectedSearches);
        lastSnapshot = '';
        dirty = true;
      }
      for (const candidate of candidates) {
        if (result.rejectedControls?.includes(candidate.control.id)) {
          rejected.set(candidate.element, signatures.get(candidate.element)!);
          setRejected(candidate.element, true);
          dirty = true;
        }
      }
      // A page mutation must not tear down unchanged shared controls such as tabs.
      const currentCandidates = dirty ? read() : candidates;
      const current = dirty ? new Map(currentCandidates.map((candidate) => [candidate.element, signature(candidate)])) : signatures;
      const currentSources = new Set(currentCandidates.flatMap(candidateSources));
      const accepted = candidates.filter((candidate) => current.get(candidate.element) === signatures.get(candidate.element));
      accepted.forEach((candidate) => setRejected(candidate.element, false));
      const acceptedFoldableRailOwners = new Set(
        accepted.filter((candidate) => candidate.control.placement === 'foldable-rail').map((candidate) => candidate.element),
      );
      const acceptedFoldableRailMembers = new Set(
        accepted
          .filter((candidate) => candidate.control.placement === 'foldable-rail')
          .flatMap((candidate) => Array.from(candidate.actions.values())),
      );
      const invalidated = candidates.length !== accepted.length;
      acceptedRevision = result.revision;
      lastSnapshot = invalidated ? '' : serialized;
      actions = new Map(
        candidates.filter((candidate) => current.has(candidate.element)).flatMap((candidate) => Array.from(candidate.actions)),
      );
      // Keep an existing cover while its content catches up. Only an ineligible
      // source needs to return to Web; new sources still require an exact ack.
      for (const element of sources.keys()) if (!currentSources.has(element)) restore(element);
      for (const element of foldableRailOwners) {
        if (acceptedFoldableRailOwners.has(element)) continue;
        element.removeAttribute(foldableRailMarker);
        foldableRailOwners.delete(element);
      }
      for (const element of acceptedFoldableRailOwners) {
        element.setAttribute(foldableRailMarker, '');
        foldableRailOwners.add(element);
      }
      for (const element of foldableRailMembers) {
        if (acceptedFoldableRailMembers.has(element)) continue;
        element.removeAttribute(foldableRailMemberMarker);
        foldableRailMembers.delete(element);
      }
      for (const element of acceptedFoldableRailMembers) {
        element.setAttribute(foldableRailMemberMarker, '');
        foldableRailMembers.add(element);
      }
      for (const element of accepted.flatMap(candidateSources)) {
        if (!sources.has(element)) {
          sources.set(element, element.getAttribute('aria-hidden'));
          crossfade.play(element, true, handoffInstant || isFoldableRailSource(element));
          element.setAttribute(marker, '');
          element.setAttribute('aria-hidden', 'true');
          element.dispatchEvent(new CustomEvent('nativeUIShellChange'));
        }
      }
      const received = pendingActivations;
      pendingActivations = [];
      received.forEach(activate);
      await crossfade.settled();
      if (invalidated) {
        dirty = true;
        // Sources that became ineligible must paint before their cover is removed.
        await painted();
      }
    } catch (error) {
      await fail(error);
    } finally {
      updatingRevision = undefined;
      pendingActivations = [];
      // A refresh received before the ack must also invalidate that ack's rejects.
      if (forceRefresh) rejected = new WeakMap();
      // A tab switch mid-update (or a dirty follow-up) must keep instant through the retire sync.
      if (!stopped && (handoffAcrossPending || (handoffInstant && dirty))) {
        handoffUntil = Math.max(handoffUntil, win.performance.now() + 400);
      }
      handoffAcrossPending = false;
      pending = false;
      if (dirty && !stopped) schedule();
      else finishWaiters();
    }
  };
  const observation: MutationObserverInit = {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeOldValue: true,
  };
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          record.attributeName !== marker &&
          record.attributeName !== fadeMarker &&
          !prehideOnlyMutation(record) &&
          !(record.attributeName === 'style' && measuringPointerPages.has(record.target as HTMLElement)) &&
          !(
            record.attributeName === 'aria-hidden' &&
            sources.has(record.target as HTMLElement) &&
            (record.target as Element).getAttribute('aria-hidden') === 'true'
          ),
      )
    )
      schedule();
  });
  const resize = new ResizeObserver(schedule);
  const on = (target: EventTarget, name: string, callback: EventListener = schedule) =>
    target.addEventListener(name, callback, { capture: true, signal: listeners.signal });
  const pageWill: EventListener = (event) => {
    const page = event.target as HTMLElement;
    foldablePages.lifecycle(event);
    getNativeSearchBindings(doc)
      .filter((binding) => page.contains(binding.footer))
      .forEach((binding) => search.retire(binding));
    // Angular updates the URL before willLeave, but keeps ion-tab-bar.selectedTab on the
    // leaving tab until DidChange. A mismatch means this leave is a tab switch, not a stack push.
    if (event.type === LIFECYCLE_WILL_LEAVE) beginTabSwitchHandoffIfNeeded(page);
    pages.add(page);
    schedule();
  };
  const pageDid: EventListener = (event) => {
    const page = event.target as HTMLElement;
    foldablePages.lifecycle(event);
    pages.delete(page);
    schedule();
    if (tabSwitchHandoff && pages.size === 0) endTabSwitchHandoff();
  };
  const tabOfPath = (tabs: Element, pathname: string) => {
    let best: { tab: string; length: number } | undefined;
    for (const button of Array.from(tabs.querySelectorAll('ion-tab-button'))) {
      const tab = button.getAttribute('tab');
      const href = button.getAttribute('href')?.split(/[?#]/)[0];
      if (!tab || !href) continue;
      if (pathname === href || pathname.startsWith(`${href}/`)) {
        if (!best || href.length > best.length) best = { tab, length: href.length };
      }
    }
    return best?.tab;
  };
  const armTabSwitchHandoff = () => {
    tabSwitchHandoff = true;
    // Retiring outgoing controls often lands in a later async sync than WillLeave/DidChange.
    handoffUntil = Math.max(handoffUntil, win.performance.now() + 400);
    // The in-flight sync already captured handoffInstant=false; hold instant for the next one.
    if (pending) handoffAcrossPending = true;
  };
  const beginTabSwitchHandoffIfNeeded = (page: HTMLElement) => {
    const tabs = page.closest('ion-tabs');
    if (!tabs) return;
    const bar = tabs.querySelector('ion-tab-bar');
    const selected =
      (bar && 'selectedTab' in bar ? String((bar as HTMLElement & { selectedTab?: string }).selectedTab ?? '') : '') ||
      tabs.querySelector('ion-tab-button.tab-selected')?.getAttribute('tab') ||
      undefined;
    const destination = tabOfPath(tabs, win.location.pathname);
    if (selected && destination && selected !== destination) armTabSwitchHandoff();
  };
  // DidChange / pageDid can land in the same turn as WillLeave. Clear the sticky flag on the
  // next frame; handoffUntil / handoffAcrossPending still cover the async retire sync.
  const endTabSwitchHandoff = () => {
    win.requestAnimationFrame(() => {
      if (stopped || !tabSwitchHandoff) return;
      tabSwitchHandoff = false;
      schedule();
    });
  };
  const motion: EventListener = (event) => {
    const target = event.target as HTMLElement;
    if (!target.matches?.(motionSelector)) return;
    const key = (event as TransitionEvent).propertyName ?? (event as AnimationEvent).animationName;
    if (event.type === CSS_MOTION_EVENTS.transitionRun || event.type === CSS_MOTION_EVENTS.animationStart) {
      const keys = moving.get(target) ?? new Set<string>();
      keys.add(key);
      moving.set(target, keys);
    } else {
      moving.get(target)?.delete(key);
      if (!moving.get(target)?.size) moving.delete(target);
    }
    schedule();
  };
  for (const name of Object.values(CSS_MOTION_EVENTS)) on(doc, name, motion);
  for (const name of [LIFECYCLE_WILL_ENTER, LIFECYCLE_WILL_LEAVE]) on(doc, name, pageWill);
  for (const name of [LIFECYCLE_DID_ENTER, LIFECYCLE_DID_LEAVE]) on(doc, name, pageDid);
  on(doc, 'ionTabsWillChange', () => {
    // Vanilla ion-tabs dispatches DOM events; @ionic/angular uses EventEmitters instead.
    armTabSwitchHandoff();
    schedule();
  });
  on(doc, 'ionTabsDidChange', endTabSwitchHandoff);
  for (const name of overlayNames) {
    on(doc, `ion${name}WillPresent`, (event) => {
      presented.add(event.target as HTMLElement);
      if (name === 'Modal') {
        modalPresentHandoff = true;
        // WillPresent may arrive while another bridge update is awaiting its ack.
        // Make that retirement instant too instead of racing the modal animation.
        if (pending) handoffInstant = true;
      }
      schedule();
    });
    on(doc, `ion${name}DidDismiss`, (event) => {
      presented.delete(event.target as HTMLElement);
      schedule();
    });
  }
  const eventMenu = (event: Event) =>
    event.composedPath().find((target): target is HTMLElement => target instanceof HTMLElement && target.matches('ion-menu'));
  on(doc, 'ionWillOpen', (event) => {
    const menu = eventMenu(event);
    if (menu) presented.add(menu);
    schedule();
  });
  on(doc, 'ionDidClose', (event) => {
    const menu = eventMenu(event);
    if (menu) presented.delete(menu);
    schedule();
  });
  for (const name of [
    'ionChange',
    'ionSelect',
    'ionImgDidLoad',
    CSS_MOTION_EVENTS.transitionEnd,
    CSS_MOTION_EVENTS.animationEnd,
    'focusin',
    'focusout',
  ])
    on(doc, name);
  on(doc, 'visibilitychange', () => {
    if (doc.hidden) getNativeSearchBindings(doc).forEach((binding) => search.retire(binding));
    schedule();
  });
  on(win, 'resize');
  on(win, 'keyboardWillShow', () => search.keyboard(true));
  on(win, 'keyboardWillHide', () => search.keyboard(false));
  on(win, 'scroll');
  on(win.matchMedia('(prefers-color-scheme: dark)'), 'change');
  on(win, 'nativeUIShellRefresh', (event) => {
    rejected = new WeakMap();
    if ((event as Event & { retireSearch?: boolean }).retireSearch)
      getNativeSearchBindings(doc).forEach((binding) => search.retire(binding));
    forceRefresh = true;
    schedule();
  });
  if (win.visualViewport) {
    on(win.visualViewport, 'resize');
    on(win.visualViewport, 'scroll');
  }
  const handle: NativeUIShellHandle = {
    getStatus: (): NativeUIShellStatus => ({
      state: stopped ? 'stopped' : sources.size ? 'native' : 'web',
      projected: sources.size,
      updates,
      reason,
    }),
    async suspend() {
      const token = Symbol();
      let resumed = false;
      if (!stopped) {
        manualSuspensions.add(token);
        getNativeSearchBindings(doc).forEach((binding) => search.retire(binding));
        await flush();
      }
      return {
        async resume() {
          if (resumed) return;
          resumed = true;
          if (stopped || !manualSuspensions.delete(token)) return;
          await flush();
        },
      };
    },
    async destroy() {
      if (stopped) return;
      stopped = true;
      setNativeUIShellIntegration(doc);
      win.cancelAnimationFrame(frame);
      listeners.abort();
      observer.disconnect();
      resize.disconnect();
      observed.clear();
      actions.clear();
      pendingActivations = [];
      search.destroy();
      crossfade.destroy();
      restoreAll();
      if (!doc.hidden) await painted();
      try {
        await bounded(plugin.clear({ revision: ++revision }));
      } catch {
        /* Always restore the Web, even after bridge loss. */
      }
      style.remove();
      doc.querySelectorAll<HTMLElement>(`.${rejectedClass}`).forEach((element) => setRejected(element, false));
      icons.clear();
      pages.clear();
      presented.clear();
      manualSuspensions.clear();
      moving.clear();
      suspended.clear();
      await listener?.remove().catch(() => {});
      await searchListener?.remove().catch(() => {});
      finishWaiters();
    },
  };
  const activate = (event: ShellActivation) => {
    if (
      stopped ||
      doc.hidden ||
      event.revision < acceptedRevision ||
      event.revision > revision ||
      event.sequence <= lastSequence ||
      overlayOpen(false)
    )
      return;
    // Native may send input before update() resolves on the JS bridge.
    // Revalidate it after ownership is accepted, using the same action path.
    if (event.revision > acceptedRevision && event.revision === updatingRevision) {
      pendingActivations.push(event);
      return;
    }
    lastSequence = event.sequence;
    const element = actions.get(event.id);
    if (!element) return;
    const owner = Array.from(sources.keys()).find((source) => source === element || source.contains(element));
    if (!owner) return;
    const direct = !blocked(owner) && unprojected(sources.keys(), () => readEnabledCandidate(owner));
    const candidate = direct || read().find((candidate) => candidate.actions.has(event.id));
    const item = candidate?.control.items.find((item) => item.id === event.id);
    const searchAction =
      candidate?.control.search && [candidate.control.search.trigger.id, candidate.control.search.closeId].includes(event.id);
    if (!searchAction && (!item || item.disabled || item.visible === false)) return;
    // The original Ionic host owns form submission, routerLink and selection events.
    activateProjectedElement(element);
    lastSnapshot = ''; // Reconcile even if Ionic rejects the proposed native selection.
    schedule();
  };
  try {
    listener = await bounded(plugin.addListener('activate', activate));
    searchListener = await bounded(
      plugin.addListener('search', (event) => {
        if (stopped || doc.hidden || event.revision < acceptedRevision || event.revision > revision || overlayOpen()) return;
        search.event(event);
      }),
    );
    doc.head.append(style);
    observer.observe(doc.documentElement, observation);
    setNativeUIShellIntegration(doc, {
      async search(binding, active, focus) {
        if (!getNativeSearchBindings(doc).includes(binding) || !search.projected(binding)) return false;
        if (!active) {
          search.setStatus(binding, false);
        } else {
          const entering = !binding.active;
          if (entering) search.begin(binding, revision + 1);
          const nextFocused = focus === true ? true : focus === false ? false : entering ? false : binding.focused;
          search.setStatus(binding, true, nextFocused);
        }
        await flush();
        return !stopped && search.projected(binding);
      },
      async suspend(scopes) {
        getNativeSearchBindings(doc)
          .filter((binding) => scopes.some((scope) => scope.contains(binding.footer) || scope.contains(binding.tabBar)))
          .forEach((binding) => search.retire(binding));
        suspended.add(scopes);
        await flush();
        // Source DOM has been restored before Ionic starts moving it.
        await new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()));
        return (canceled = false) => {
          suspended.delete(scopes);
          if (canceled || !scopes.some((scope) => scope.closest(':is(ion-app, body).ios-theme-enable-foldable'))) {
            scopes.forEach((scope) => pages.delete(scope)); // Preserve ordinary iPhone handoff; cancellation has no DidLeave.
            if (canceled) {
              foldablePages.cancel(scopes[0], scopes[1]); // The entering page is abandoned; the leaving page stays active.
            }
          }
          schedule();
        };
      },
    });
    on(win, 'pagehide', () => {
      void handle.destroy();
    });
    schedule();
  } catch (error) {
    await fail(error);
  }
  return handle;
};
