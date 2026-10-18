import { htmlSelector, readHTMLControl } from './html';
import { extensionAncestors, readExtension } from './extensions';
import { bounded, boundedListener } from './shared/bridge';
import { popoverTrigger } from './overlays/popover';
import {
  alignVerticalTabBar,
  forgetVerticalBarFrame,
  rememberVerticalBarFrame,
  validVerticalBarFrame,
} from './shared/vertical-bars-geometry';
import { projectionIds } from './shared/projection-id';
import { inVerticalBarsSurface, topModal, modalUsesVerticalBars, modalVerticalBarFrame } from './shared/modal';
import type { PluginListenerHandle } from '@capacitor/core';
import { LIFECYCLE_WILL_ENTER, LIFECYCLE_WILL_LEAVE, LIFECYCLE_DID_ENTER, LIFECYCLE_DID_LEAVE } from './shared/events';
import { VERTICAL_BARS_TRANSITION_CANCELED, getNativeSearchBindings, setNativeUIShellIntegration } from '../native-integration';
import { createSearchSupport } from './components/searchable-tabs';
import type {
  ShellActivation,
  ShellSnapshot,
  NativeUIShellRuntimeHandle,
  NativeUIShellRuntimeOptions,
  NativeUIShellPlugin,
  NativeUIShellStatus,
} from './definitions';
import { readCandidate, selector, shadowSelector, motionSelector, isVerticalBarsCandidate } from './components';
import {
  activateProjectedElement,
  createVerticalBarsPageState,
  isVerticalBarsSource,
  preferredVerticalBarsBack,
  marker,
  syncToolbarText,
  toolbarTextMarker,
  prehideOnlyMutation,
  rejectedClass,
  unprojected,
} from './shared/dom';
import { createIconRenderer } from './shared/icons';
import type { Candidate } from './shared/candidate';
import { CSS_MOTION_EVENTS } from './shared/events';
import { createCrossfade, fadeMarker } from './shared/crossfade';

const overlays = 'ion-modal, ion-popover, ion-alert, ion-action-sheet, ion-loading, ion-picker, ion-toast, ion-menu';
// Only these Web overlays leave the rail's display and interaction intact.
const railPreservingOverlays = 'ion-toast, ion-popover, ion-picker';
const overlayNames = ['Modal', 'Popover', 'Alert', 'ActionSheet', 'Loading', 'Picker', 'Toast'];
const verticalBarsMarker = 'data-native-ui-shell-vertical-bars';
const verticalBarsMemberMarker = 'data-native-ui-shell-vertical-bars-member';

export const createRuntime = async (
  doc: Document,
  plugin: NativeUIShellPlugin,
  options: NativeUIShellRuntimeOptions = {},
  nativeVerticalBars: () => boolean = () => true,
  verticalBarsOnly = false,
): Promise<NativeUIShellRuntimeHandle & { retain: (deferActivation?: (id: string) => boolean) => () => void }> => {
  const win = doc.defaultView!;
  const extensions = options.extensions ?? [];
  const scope = options.root ?? doc;
  const discovery = [
    options.source === 'html' ? htmlSelector : options.source === 'auto' ? `${selector}, ${htmlSelector}` : selector,
    ...extensions.map((extension) => extension.selector),
  ].join(', ');
  const icons = createIconRenderer();
  const crossfade = createCrossfade(win);
  const ids = new WeakMap<Element, string>();
  let rejected = new WeakMap<HTMLElement, string>();
  const sources = new Map<HTMLElement, string | null>();
  const verticalBarsOwners = new Set<HTMLElement>();
  const verticalBarsMembers = new Set<HTMLElement>();
  const suspended = new Set<HTMLElement[]>();
  const pages = new Set<HTMLElement>();
  const verticalBarsPages = createVerticalBarsPageState();
  const presented = new Set<HTMLElement>();
  const railPopovers = new WeakSet<HTMLElement>();
  const manualSuspensions = new Set<symbol>();
  const moving = new Map<HTMLElement, Set<string>>();
  const observed = new Set<Element | ShadowRoot>();
  const listeners = new AbortController();
  let actions = new Map<string, HTMLElement>();
  let nextId = 0;
  let revision = 0;
  const tabGeometry = new Map<HTMLElement, () => void>();
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
  let destruction: Promise<void> | undefined;
  const retentions = new Set<{ accepts?: (id: string) => boolean; activation?: ShellActivation }>();
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
  const control = (kind: Candidate['control']['kind']): keyof NonNullable<NativeUIShellRuntimeOptions['controls']> => {
    if (kind === 'tab-bar') return 'tabs';
    if (kind === 'segment') return 'segment';
    if (kind === 'floating-action-button') return 'fab';
    return 'toolbar';
  };
  const controlEnabled = (candidate: Candidate) => {
    if (candidate.control.kind === 'extension') return true;
    const controls = options.controls;
    return controls === undefined || controls[control(candidate.control.kind)] === true;
  };
  const id = (element: Element) => {
    let value = ids.get(element);
    if (!value) {
      value = `shell-${++nextId}`;
      ids.set(element, value);
      projectionIds.set(element, value);
    }
    return value;
  };
  const style = doc.createElement('style');
  const hidden = `[${marker}]:not([${fadeMarker}])`;
  style.textContent = `${hidden}, ${hidden} *, ${hidden}::before, ${hidden}::after, ${hidden}::part(native) { visibility: hidden !important; }
    [${marker}], [${marker}] * { pointer-events: none !important; }
    /* Ionic disables the covered page while a menu is open. VerticalBars rail
       controls remain outside that page; zero specificity preserves any
       pointer-events rule supplied by the application itself. */
    :where(.menu-content-open) :where([${verticalBarsMarker}]) {
      pointer-events: auto;
    }
    :where(.menu-content-open) :where([${verticalBarsMarker}]) > :where(:not([${verticalBarsMemberMarker}])) {
      pointer-events: none;
    }`;

  const restore = (element: HTMLElement) => {
    lastSnapshot = '';
    search.release(element);
    element.removeAttribute(marker);
    if (!stopped) crossfade.play(element, false, handoffInstant || (isVerticalBarsSource(element) && !element.matches('ion-tab-bar')));
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
    verticalBarsOwners.forEach((element) => element.removeAttribute(verticalBarsMarker));
    verticalBarsOwners.clear();
    verticalBarsMembers.forEach((element) => element.removeAttribute(verticalBarsMemberMarker));
    verticalBarsMembers.clear();
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
    if (options.root && !options.root.contains(element)) return;
    if (element.matches('ion-back-button') && element.closest('ion-app.ios-theme-vertical-bars') && !isVerticalBarsCandidate(element))
      return;
    if (extensions.some((extension) => element.matches(extension.selector))) {
      const candidate = readExtension(element, extensions, id);
      if (verticalBarsOnly && (!candidate?.control.extension?.tabBarId || !nativeVerticalBars())) return;
      return candidate;
    }
    if (options.source === 'html' || element.matches(htmlSelector)) {
      const candidate = readHTMLControl(element, id, options);
      if (!candidate || !controlEnabled(candidate)) return;
      const rail = candidate.control.placement === 'vertical-bars';
      if (verticalBarsOnly && !rail) return;
      if (rail && !nativeVerticalBars()) return;
      return candidate;
    }
    if (verticalBarsOnly && (!isVerticalBarsCandidate(element) || element.closest('[data-native-ui-placement="element"]'))) return;
    if (options.verticalBars?.enabled === false && isVerticalBarsCandidate(element)) return;
    const pointerPage = isVerticalBarsCandidate(element) ? element.closest<HTMLElement>('.ion-page') : undefined;
    let candidate: Candidate | undefined;
    if (pointerPage && getComputedStyle(pointerPage).pointerEvents === 'none') {
      const previous = pointerPage.style.getPropertyValue('pointer-events');
      const priority = pointerPage.style.getPropertyPriority('pointer-events');
      const hadStyle = pointerPage.hasAttribute('style');
      measuringPointerPages.add(pointerPage);
      pointerPage.style.setProperty('pointer-events', 'auto', 'important');
      try {
        candidate = readCandidate(element, id, options);
      } finally {
        if (previous) pointerPage.style.setProperty('pointer-events', previous, priority);
        else pointerPage.style.removeProperty('pointer-events');
        if (!hadStyle && !pointerPage.style.length) pointerPage.removeAttribute('style');
        win.setTimeout(() => measuringPointerPages.delete(pointerPage), 0);
      }
    } else candidate = readCandidate(element, id, options);
    if (candidate && isVerticalBarsCandidate(element) && !element.closest('[data-native-ui-placement="element"]')) {
      if (!nativeVerticalBars()) return undefined;
      candidate.control.placement = 'vertical-bars';
      if (['button', 'button-group', 'menu-button'].includes(candidate.control.kind)) {
        const slot = (element.matches('ion-buttons') ? element : (element.closest('ion-buttons') ?? element)).getAttribute('slot');
        if (slot === 'start' || slot === 'end') candidate.control.toolbarSlot = slot;
      }
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
    verticalBarsPages.isDeparted(element) ||
    (!isVerticalBarsSource(element) &&
      (Array.from(suspended).some((scopes) => scopes.some((scope) => scope.contains(element))) ||
        Array.from(pages).some((scope) => scope.contains(element)) ||
        Array.from(moving.keys()).some((surface) => surface.contains(element))));
  const painted = () => new Promise<void>((resolve) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
  const overlayOpen = (includeMenu = true, allowModal = false, ignoredSelector?: string) => {
    const modal = topModal(doc);
    const ignored = (element: Element) =>
      (!!ignoredSelector && element.matches(ignoredSelector) && !railPopovers.has(element as HTMLElement)) ||
      (allowModal && !!modal && modalUsesVerticalBars(modal) && element.matches('ion-modal'));
    for (const element of presented) if (!element.isConnected) presented.delete(element);
    const presentedOverlayOpen = Array.from(presented).some(
      (element) => !ignored(element) && (includeMenu || !element.matches('ion-menu')),
    );
    return (
      manualSuspensions.size > 0 ||
      presentedOverlayOpen ||
      Array.from(doc.querySelectorAll(overlays)).some(
        (element) =>
          !ignored(element) &&
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
    if (doc.hidden || overlayOpen(false, true, railPreservingOverlays)) return [];
    if (win.visualViewport && (win.visualViewport.scale !== 1 || win.visualViewport.offsetTop !== 0) && !search.hasActive()) return [];
    const overlayVisible = overlayOpen();
    // Web rail projections also hide their originals. Measure those sources
    // without releasing the visible clones before native acknowledges ownership.
    const measurableSources = new Set([
      ...sources.keys(),
      ...Array.from(scope.querySelectorAll<HTMLElement>(`[${marker}], [data-native-ui-web-source]`)).filter(isVerticalBarsSource),
    ]);
    const candidates = unprojected(measurableSources, () =>
      search
        .decorate(
          Array.from(scope.querySelectorAll<HTMLElement>(discovery))
            .filter(
              (element) =>
                inVerticalBarsSurface(element) &&
                !verticalBarsPages.isDeparted(element) &&
                (!blocked(element) || (overlayVisible && isVerticalBarsSource(element))),
            )
            .map(readEnabledCandidate)
            .filter((candidate): candidate is Candidate => !!candidate),
          blocked,
        )
        .filter((candidate) => !rejected.has(candidate.element) || rejected.get(candidate.element) !== signature(candidate)),
    );
    // An extension owns its entire source subtree. Never project a nested built-in twice.
    const extensionSources = candidates.filter((candidate) => candidate.control.kind === 'extension');
    const exclusive = candidates.filter((candidate) => {
      if (extensionSources.some((owner) => owner !== candidate && owner.element.contains(candidate.element))) return false;
      const tabBarId = candidate.control.extension?.tabBarId;
      if (!tabBarId) return true;
      // Wait for the owning native tab host; do not cache an early rejection while its icons load.
      return (
        candidates.some(
          (owner) => owner.control.id === tabBarId && owner.control.kind === 'tab-bar' && owner.control.placement === 'vertical-bars',
        ) && extensionSources.filter((source) => source.control.extension?.tabBarId === tabBarId).length === 1
      );
    });
    const back = preferredVerticalBarsBack(
      candidates
        .filter((candidate) => candidate.control.kind === 'back-button' && isVerticalBarsCandidate(candidate.element))
        .map((candidate) => candidate.element),
      doc,
    );
    const selected = exclusive.filter(
      (candidate) => candidate.control.kind !== 'back-button' || !isVerticalBarsCandidate(candidate.element) || candidate.element === back,
    );
    return overlayVisible ? selected.filter((candidate) => isVerticalBarsCandidate(candidate.element)) : selected;
  };
  const observe = () => {
    const wanted = new Set<Element | ShadowRoot>();
    for (const element of Array.from(scope.querySelectorAll<HTMLElement>(discovery))) {
      wanted.add(element);
      if (element.parentElement) wanted.add(element.parentElement);
      if (extensions.some((extension) => element.matches(extension.selector))) {
        for (const ancestor of extensionAncestors(element)) {
          wanted.add(ancestor);
          const root = ancestor.getRootNode();
          if (root instanceof ShadowRoot) wanted.add(root);
        }
      }
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
    for (const element of observed) if (element instanceof ShadowRoot) element.removeEventListener('scroll', schedule, true);
    observed.clear();
    observer.observe(doc.documentElement, observation);
    for (const element of wanted) {
      observed.add(element);
      if (element instanceof ShadowRoot) {
        observer.observe(element, observation);
        on(element, 'scroll');
      } else resize.observe(element);
    }
  };
  const fail = async (error: unknown) => {
    reason = error instanceof Error ? error.message : String(error);
    console.warn('[Native UI Shell] Returning to Web:', reason);
    await handle.destroy();
    // The Web fallback re-evaluates eligibility once native projection is stopped.
    win.dispatchEvent(new Event('nativeUIShellRefresh'));
  };
  const sync = async () => {
    frame = 0;
    dirty = false;
    pending = true;
    syncToolbarText(doc);
    handoffInstant = tabSwitchHandoff || handoffAcrossPending || modalPresentHandoff || win.performance.now() < handoffUntil;
    try {
      // A retained sync performs no update; keep the modal handoff armed so the
      // deferred retirement still runs instantly after the overlay releases.
      if (retentions.size && !manualSuspensions.size) return;
      modalPresentHandoff = false;
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
      if (stopped || dirty || (retentions.size && !manualSuspensions.size)) return;
      const retained = new Set(candidates.flatMap(candidateSources));
      const removed = Array.from(sources.keys()).filter((element) => !retained.has(element));
      if (removed.some(isVerticalBarsSource)) {
        actions.forEach(forgetVerticalBarFrame);
        try {
          const geometry = await bounded(
            plugin.getVerticalBarsGeometry({ viewportWidth: win.innerWidth, ids: [...actions.keys(), 'BackButton', '__tabBar'] }),
          );
          if (stopped || dirty || (retentions.size && !manualSuspensions.size)) return;
          if (geometry.revision === acceptedRevision && size === `${win.innerWidth}:${win.innerHeight}`) {
            for (const tabBar of removed.filter((element) => element.matches('ion-tab-bar'))) {
              tabGeometry.get(tabBar)?.();
              tabGeometry.delete(tabBar);
              const items = new Map(
                [...actions]
                  .filter(
                    ([id, element]) => element.parentElement === tabBar && geometry.items[id] && validVerticalBarFrame(geometry.items[id]),
                  )
                  .map(([id, element]) => [element, geometry.items[id]]),
              );
              if (
                geometry.items['__tabBar'] &&
                validVerticalBarFrame(geometry.items['__tabBar']) &&
                items.size === tabBar.querySelectorAll('ion-tab-button').length
              )
                tabGeometry.set(tabBar, alignVerticalTabBar(tabBar, geometry.items['__tabBar'], items));
            }
            for (const [id, element] of actions) {
              const frame = geometry.items[element.matches('ion-back-button') ? 'BackButton' : id];
              if (frame) rememberVerticalBarFrame(element, frame);
            }
          }
        } catch {
          /* Older native binaries can still use the CSS fallback. */
        }
      }
      if (removed.length) {
        // Restore the source and let WebKit paint before removing its native cover.
        removed.forEach(restore);
        if (removed.some(isVerticalBarsSource))
          win.dispatchEvent(new CustomEvent('nativeUIShellVerticalBarsRelease', { detail: { instant: handoffInstant } }));
        // The outgoing tab is no longer visible, so waiting two frames only leaves its
        // native snapshot over the destination. Stack transitions still need the paint.
        if (!handoffInstant) {
          await painted();
          if (stopped || dirty) return;
        }
      }
      const root = doc.querySelector('ion-app.ios-theme-vertical-bars');
      const verticalBarEdge: 'left' | 'right' | undefined = options.nativeState?.edge
        ? options.nativeState.edge
        : options.rail
          ? options.rail.edge
          : root
            ? root.classList.contains('ios-theme-vertical-bars-left')
              ? 'left'
              : 'right'
            : undefined;
      const modal = topModal(doc);
      const verticalBarFrame = modal && modalUsesVerticalBars(modal) ? modalVerticalBarFrame(modal) : undefined;
      const data = {
        verticalBarFrame,
        viewportWidth: win.innerWidth,
        verticalBarEdge,
        controls: candidates.map((candidate) => candidate.control),
      };
      const serialized = JSON.stringify(data);
      if (serialized === lastSnapshot && !forceRefresh) return;
      const snapshot: ShellSnapshot = { ...data, revision: ++revision, transitionDuration: crossfade.duration(handoffInstant) };
      // A native visibility notification during this update must survive its ack.
      forceRefresh = false;
      updates++;
      updatingRevision = snapshot.revision;
      const result = await bounded(plugin.update(snapshot));
      if (stopped || (retentions.size && !manualSuspensions.size)) return;
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
      const acceptedVerticalBarsOwners = new Set(
        accepted.filter((candidate) => candidate.control.placement === 'vertical-bars').map((candidate) => candidate.element),
      );
      const acceptedVerticalBarsMembers = new Set(
        accepted
          .filter((candidate) => candidate.control.placement === 'vertical-bars')
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
      for (const element of verticalBarsOwners) {
        if (acceptedVerticalBarsOwners.has(element)) continue;
        element.removeAttribute(verticalBarsMarker);
        verticalBarsOwners.delete(element);
      }
      if (acceptedVerticalBarsOwners.size)
        win.dispatchEvent(new CustomEvent('nativeUIShellVerticalBarsAcquire', { detail: { instant: handoffInstant } }));
      for (const element of acceptedVerticalBarsOwners) {
        element.setAttribute(verticalBarsMarker, '');
        verticalBarsOwners.add(element);
      }
      for (const element of verticalBarsMembers) {
        if (acceptedVerticalBarsMembers.has(element)) continue;
        element.removeAttribute(verticalBarsMemberMarker);
        verticalBarsMembers.delete(element);
      }
      for (const element of acceptedVerticalBarsMembers) {
        element.setAttribute(verticalBarsMemberMarker, '');
        verticalBarsMembers.add(element);
      }
      for (const element of accepted.flatMap(candidateSources)) {
        const newlyProjected = !sources.has(element) || !element.hasAttribute(marker);
        if (!sources.has(element)) {
          sources.set(element, element.getAttribute('aria-hidden'));
          crossfade.play(element, true, handoffInstant || (isVerticalBarsSource(element) && !element.matches('ion-tab-bar')));
        }
        element.setAttribute(marker, '');
        element.setAttribute('aria-hidden', 'true');
        if (newlyProjected) element.dispatchEvent(new CustomEvent('nativeUIShellChange'));
      }
      const received = pendingActivations;
      pendingActivations = [];
      received.forEach(activate);
      await crossfade.settled();
      // Geometry belongs to the outgoing tab visual, not to other rail owners.
      // Keep it until that visual has completely faded back to native.
      for (const [tabBar, restore] of tabGeometry) {
        if (!tabBar.isConnected || acceptedVerticalBarsOwners.has(tabBar)) {
          restore();
          tabGeometry.delete(tabBar);
        }
      }
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
          record.attributeName !== 'data-native-ui-web-source' &&
          record.attributeName !== toolbarTextMarker &&
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
    verticalBarsPages.lifecycle(event);
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
    verticalBarsPages.lifecycle(event);
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
    if (!target.matches?.(`${motionSelector}, ${discovery}`) && !(options.source !== 'ionic' && target.querySelector?.(discovery))) return;
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
  on(doc, VERTICAL_BARS_TRANSITION_CANCELED, (event) => {
    const leaving = event.target as HTMLElement;
    const entering = (event as CustomEvent<{ entering?: HTMLElement }>).detail?.entering;
    verticalBarsPages.cancel(entering, leaving);
    pages.delete(leaving);
    if (entering) pages.delete(entering);
    schedule();
  });
  on(doc, 'ionTabsWillChange', () => {
    // Vanilla ion-tabs dispatches DOM events; @ionic/angular uses EventEmitters instead.
    armTabSwitchHandoff();
    schedule();
  });
  on(doc, 'ionTabsDidChange', endTabSwitchHandoff);
  const overlayPresenting = (element: HTMLElement) => {
    presented.add(element);
    if (element.matches('ion-popover')) {
      const trigger = popoverTrigger(element as HTMLIonPopoverElement);
      // Remember the source before native ownership changes. A successful native
      // popover retains projection; a Web fallback must retire the rail instead.
      if (trigger?.matches('ion-button') && isVerticalBarsSource(trigger as HTMLElement)) railPopovers.add(element);
      else railPopovers.delete(element);
    }
    if (element.matches('ion-modal')) {
      modalPresentHandoff = true;
      // A pending bridge update must retire the old controls immediately too.
      if (pending) handoffInstant = true;
    }
    schedule();
  };
  // Adoption changes the document, but not the in-flight Ionic event path.
  // Do not replay WillPresent: application handlers must run exactly once.
  on(doc, 'nativeUIShellOverlayAdopted', (event) => overlayPresenting((event as CustomEvent<HTMLElement>).detail));
  for (const name of overlayNames) {
    on(doc, `ion${name}WillPresent`, (event) => overlayPresenting(event.target as HTMLElement));
    on(doc, `ion${name}DidDismiss`, (event) => {
      presented.delete(event.target as HTMLElement);
      railPopovers.delete(event.target as HTMLElement);
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
  const refreshLayout = () => {
    rejected = new WeakMap();
    forceRefresh = true;
    schedule();
  };
  on(doc, 'visibilitychange', () => {
    if (doc.hidden) {
      getNativeSearchBindings(doc).forEach((binding) => search.retire(binding));
      schedule();
    } else refreshLayout();
  });
  on(win, 'resize', refreshLayout);
  on(win, 'keyboardWillShow', () => search.keyboard(true));
  on(win, 'keyboardWillHide', () => search.keyboard(false));
  on(win, 'scroll');
  on(win.matchMedia('(prefers-color-scheme: dark)'), 'change');
  on(win, 'nativeUIShellRefresh', (event) => {
    if ((event as Event & { retireSearch?: boolean }).retireSearch)
      getNativeSearchBindings(doc).forEach((binding) => search.retire(binding));
    refreshLayout();
  });
  if (win.visualViewport) {
    on(win.visualViewport, 'resize', refreshLayout);
    on(win.visualViewport, 'scroll');
  }
  const handle: NativeUIShellRuntimeHandle & { retain: (deferActivation?: (id: string) => boolean) => () => void } = {
    // A native overlay covers this surface; keep its controls and Web ownership intact.
    retain(deferActivation) {
      const retention: { accepts?: (id: string) => boolean; activation?: ShellActivation } = { accepts: deferActivation };
      retentions.add(retention);
      return () => {
        if (!retentions.delete(retention)) return;
        // UIKit may already expose the anchor while Ionic is still dismissing.
        // Replay at most one validated input after the live content is restored.
        const activation = retention.activation;
        if (activation && retention.accepts?.(activation.id)) win.queueMicrotask(() => activate(activation));
        schedule();
      };
    },
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
    destroy() {
      if (destruction) return destruction;
      stopped = true;
      destruction = Promise.resolve().then(async () => {
        tabGeometry.forEach((restore) => restore());
        tabGeometry.clear();
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
        if (listener) await bounded(listener.remove()).catch(() => {});
        if (searchListener) await bounded(searchListener.remove()).catch(() => {});
        finishWaiters();
      });
      return destruction;
    },
  };
  const activate = (event: ShellActivation) => {
    const accepted = dispatchActivation(event);
    if (event.requestId && accepted !== undefined) {
      void bounded(plugin.completeExtensionAction({ requestId: event.requestId, accepted })).catch(() => {});
    }
  };
  const dispatchActivation = (event: ShellActivation): boolean | undefined => {
    if (stopped || doc.hidden || event.revision < acceptedRevision || event.revision > revision || event.sequence <= lastSequence)
      return false;
    const element = actions.get(event.id);
    const owner = element && Array.from(sources.keys()).find((source) => source === element || source.contains(element));
    const ignored = owner && isVerticalBarsSource(owner) ? (retentions.size ? 'ion-toast, ion-picker' : railPreservingOverlays) : undefined;
    if (overlayOpen(false, true, ignored)) {
      if (!manualSuspensions.size) {
        for (const retention of retentions) {
          if (retention.accepts?.(event.id) && (!retention.activation || event.sequence > retention.activation.sequence))
            retention.activation = event;
        }
      }
      return false;
    }
    // Native may send input before update() resolves on the JS bridge.
    // Revalidate it after ownership is accepted, using the same action path.
    if (event.revision > acceptedRevision && event.revision === updatingRevision) {
      pendingActivations.push(event);
      return;
    }
    lastSequence = event.sequence;
    if (!element) return false;
    if (!owner || !inVerticalBarsSurface(owner)) return false;
    const direct = !blocked(owner) && unprojected(sources.keys(), () => readEnabledCandidate(owner));
    const candidate = direct || read().find((candidate) => candidate.actions.has(event.id));
    const item = candidate?.control.items.find((item) => item.id === event.id);
    const searchAction =
      candidate?.control.search && [candidate.control.search.trigger.id, candidate.control.search.closeId].includes(event.id);
    const extensionAction = candidate?.control.kind === 'extension' && candidate.actions.get(event.id) === element;
    if (!extensionAction && !searchAction && (!item || item.disabled || item.visible === false)) return false;
    // The original Ionic host owns form submission, routerLink and selection events.
    activateProjectedElement(element);
    lastSnapshot = ''; // Reconcile even if Ionic rejects the proposed native selection.
    schedule();
    return true;
  };
  try {
    listener = await boundedListener(plugin.addListener('activate', activate));
    searchListener = await boundedListener(
      plugin.addListener('search', (event) => {
        if (
          stopped ||
          doc.hidden ||
          event.revision < acceptedRevision ||
          event.revision > revision ||
          overlayOpen(true, false, nativeVerticalBars() ? (retentions.size ? 'ion-toast, ion-picker' : railPreservingOverlays) : undefined)
        )
          return;
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
          if (canceled || !scopes.some((scope) => scope.closest('ion-app.ios-theme-vertical-bars'))) {
            scopes.forEach((scope) => pages.delete(scope)); // Preserve ordinary iPhone handoff; cancellation has no DidLeave.
            if (canceled) {
              verticalBarsPages.cancel(scopes[0], scopes[1]); // The entering page is abandoned; the leaving page stays active.
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
