import { createVerticalNavigation } from './shared/vertical-navigation';
import { createHorizontalNavigation, horizontalToolbar, navigationMarker } from './shared/horizontal-navigation';
import { assignToolbarTransitionIds } from './shared/transition-identity';
import { controlSelected } from './shared/control-options';
import { createDiagnostics } from './shared/diagnostics';
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
import type { NativeUITransitionRelease } from '../native-integration';
import { VERTICAL_BARS_TRANSITION_CANCELED, getNativeSearchBindings, setNativeUIIntegration } from '../native-integration';
import { createSearchSupport } from './components/searchable-tabs';
import type {
  NativeUIActivation,
  NativeUISnapshot,
  NativeUIRuntimeHandle,
  NativeUIRuntimeOptions,
  NativeUIPlugin,
  NativeUIStatus,
} from './definitions';
import { readCandidate, selector, shadowSelector, motionSelector, isVerticalBarsCandidate } from './components';
import {
  activateProjectedElement,
  inFixedToolbar,
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
const verticalBarsMarker = 'data-native-ui-vertical-bars';
const verticalBarsMemberMarker = 'data-native-ui-vertical-bars-member';

export const createRuntime = async (
  doc: Document,
  plugin: NativeUIPlugin,
  options: NativeUIRuntimeOptions = {},
  nativeVerticalBars: () => boolean = () => true,
  onStop?: (cause: 'failure' | 'pagehide') => void,
): Promise<NativeUIRuntimeHandle & { retain: (deferActivation?: (id: string) => boolean) => () => void }> => {
  const win = doc.defaultView!;
  const extensions = options.extensions ?? [];
  const diagnose = createDiagnostics(options.debug);
  const scope = options.root ?? doc;
  const discovery = [
    options.source === 'extensions'
      ? ':not(*)'
      : options.source === 'html'
        ? htmlSelector
        : options.source === 'auto'
          ? `${selector}, ${htmlSelector}`
          : selector,
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
  const navigation = createHorizontalNavigation();
  const verticalNavigation = createVerticalNavigation();
  let verticalGesture: { pending: boolean; scopes: HTMLElement[]; sources: Set<HTMLElement> } | undefined;
  let acknowledged: Candidate[] = [];
  const pages = new Set<HTMLElement>();
  const tabActivationPages = new Map<HTMLElement, number>();
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
  let pendingActivations: NativeUIActivation[] = [];
  let lastSequence = 0;
  let lastTabSequence = 0;
  let lastSnapshot = '';
  let renderedSnapshot: NativeUISnapshot | undefined;
  let interruptAssets: (() => void) | undefined;
  let viewport = `${win.innerWidth}:${win.innerHeight}`;
  let forceRefresh = false;
  let dirty = false;
  let pending = false;
  let stopped = false;
  let destruction: Promise<void> | undefined;
  const retentions = new Set<{ accepts?: (id: string) => boolean; activation?: NativeUIActivation }>();
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
  let waiters: { resolve: () => void; transition?: NonNullable<typeof navigation.current> }[] = [];
  const controlEnabled = (candidate: Candidate) => {
    const kind = candidate.control.kind;
    // Button readers apply selection/grouping per child; explicit HTML and extensions
    // are independent opt-ins. Only other automatic kinds need this final selection.
    const key = kind === 'tab-bar' ? 'tabs' : kind === 'segment' ? 'segment' : kind === 'floating-action-button' ? 'fab' : undefined;
    return !key || controlSelected(candidate.element, options, key, candidate.control.placement === 'vertical-bars');
  };
  const id = (element: Element) => {
    let value = ids.get(element);
    if (!value) {
      value = `native-ui-${++nextId}`;
      ids.set(element, value);
      projectionIds.set(element, value);
    }
    return value;
  };
  const style = doc.createElement('style');
  const hidden = `:is([${marker}]:not([${fadeMarker}]), [${navigationMarker}])`;
  style.textContent = `${hidden}, ${hidden} *, ${hidden}::before, ${hidden}::after, ${hidden}::part(native) { visibility: hidden !important; }
    [${marker}], [${marker}] *, [${navigationMarker}], [${navigationMarker}] * { pointer-events: none !important; }
    /* The theme's fixed Back clone must not reintroduce a Web button while
       navigation keeps its source under native ownership. */
    :is(ion-nav, ion-router-outlet):has(.ion-page:not(.ion-page-hidden) ion-back-button:is([${marker}], [${navigationMarker}]))
      > ion-back-button.ion-cloned-element { visibility: hidden !important; }
    /* Ionic disables the covered page while a menu is open. VerticalBars rail
       controls remain outside that page; zero specificity preserves any
       pointer-events rule supplied by the application itself. */
    :where(.menu-content-open) :where([${verticalBarsMarker}]) {
      pointer-events: auto;
    }
    :where(.menu-content-open) :where([${verticalBarsMarker}]) > :where(:not([${verticalBarsMemberMarker}])) {
      pointer-events: none;
    }`;

  const restore = (element: HTMLElement, instant = false) => {
    lastSnapshot = '';
    search.release(element);
    element.removeAttribute(marker);
    if (!stopped)
      crossfade.play(element, false, instant || handoffInstant || (isVerticalBarsSource(element) && !element.matches('ion-tab-bar')));
    if (element.getAttribute('aria-hidden') === 'true') {
      const previous = sources.get(element);
      if (previous == null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', previous);
    }
    sources.delete(element);
    element.dispatchEvent(new CustomEvent('nativeUIChange'));
  };
  const restoreAll = () => {
    Array.from(sources.keys()).forEach((element) => restore(element));
    verticalBarsOwners.forEach((element) => element.removeAttribute(verticalBarsMarker));
    verticalBarsOwners.clear();
    verticalBarsMembers.forEach((element) => element.removeAttribute(verticalBarsMemberMarker));
    verticalBarsMembers.clear();
  };
  const finishWaiters = (transition?: NonNullable<typeof navigation.current>) => {
    waiters = waiters.filter((waiter) => {
      if (transition && waiter.transition !== transition) return true;
      waiter.resolve();
      return false;
    });
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
      const extension = extensions.find((definition) => element.matches(definition.selector))!;
      const unavailable = options.unavailableExtensions?.get(extension.name);
      if (unavailable) {
        diagnose(`${extension.name}: ${unavailable}`, element);
        return;
      }
      const candidate = readExtension(element, extensions, id, (reason) => diagnose(`${extension.name}: ${reason}`, element));
      return candidate;
    }
    if (options.source === 'extensions') return;
    if (options.source === 'html' || element.matches(htmlSelector)) {
      const candidate = readHTMLControl(element, id, options);
      if (!candidate) {
        diagnose(
          'unsupported-control: check the source visibility, accessible name, disabled ancestors, and supported HTML markup.',
          element,
        );
        return;
      }
      const rail = candidate.control.placement === 'vertical-bars';
      if (rail && !nativeVerticalBars()) return;
      return candidate;
    }
    if (element.querySelector(htmlSelector)) return; // A shared automatic surface must not cover explicitly selected descendants.
    if (options.ionic?.auto === false) return;
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
    if (!candidate) diagnose('unsupported-control: check the supported Ionic markup, fixed placement, and styling requirements.', element);
    return candidate && controlEnabled(candidate) ? candidate : undefined;
  };
  const flush = async (transition?: NonNullable<typeof navigation.current>) => {
    if (stopped) return;
    schedule();
    try {
      await bounded(new Promise<void>((resolve) => waiters.push({ resolve, transition })));
    } catch (error) {
      await fail(error);
    }
  };
  const blocked = (element: HTMLElement) =>
    Array.from(tabActivationPages.keys()).some((page) => page.contains(element)) ||
    verticalBarsPages.isDeparted(element, true) ||
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
  const signature = (candidate: Candidate, includeTransitionIds = true) =>
    JSON.stringify(
      { control: candidate.control, icons: candidate.icons.map(({ source }) => source), assets: candidate.assets?.signature },
      includeTransitionIds ? undefined : (key, value) => (key === 'transitionId' ? undefined : value),
    );
  const read = (): Candidate[] => {
    if (verticalGesture && (overlayOpen(true, true) || !verticalGesture.scopes.every(inVerticalBarsSurface))) verticalGesture = undefined;
    search.keepSearchTabsVisible();
    for (const page of pages) if (!page.isConnected) pages.delete(page);
    for (const surface of moving.keys()) if (!surface.isConnected) moving.delete(surface);
    if (doc.hidden || overlayOpen(false, true, railPreservingOverlays)) {
      navigation.clear();
      verticalGesture = undefined;
      return [];
    }
    if (win.visualViewport && (win.visualViewport.scale !== 1 || win.visualViewport.offsetTop !== 0) && !search.hasActive()) {
      navigation.clear();
      verticalGesture = undefined;
      return [];
    }
    const overlayVisible = overlayOpen();
    if (overlayVisible) navigation.clear();
    // Web rail projections also hide their originals. Measure those sources
    // without releasing the visible clones before native acknowledges ownership.
    const measurableSources = new Set([
      ...sources.keys(),
      ...Array.from(scope.querySelectorAll<HTMLElement>(`[${marker}], [data-native-ui-web-source]`)).filter(isVerticalBarsSource),
    ]);
    const candidates = navigation.measure(() =>
      unprojected(measurableSources, () =>
        search
          .decorate(
            Array.from(scope.querySelectorAll<HTMLElement>(discovery))
              .filter(
                (element) =>
                  inVerticalBarsSurface(element) &&
                  !verticalBarsPages.isDeparted(element, true) &&
                  (!blocked(element) || (overlayVisible && isVerticalBarsSource(element))),
              )
              .map(readEnabledCandidate)
              .filter((candidate): candidate is Candidate => !!candidate),
            blocked,
          )
          .filter((candidate) => !rejected.has(candidate.element) || rejected.get(candidate.element) !== signature(candidate, false)),
      ),
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
    const result = overlayVisible ? selected.filter((candidate) => isVerticalBarsCandidate(candidate.element)) : selected;
    assignToolbarTransitionIds(result);
    return navigation.retain(result);
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
    console.warn('[Native UI] Returning to Web:', reason);
    const destruction = handle.destroy();
    onStop?.('failure');
    await destruction;
    // The Web fallback re-evaluates eligibility once native projection is stopped.
    win.dispatchEvent(new Event('nativeUIRefresh'));
  };
  const sync = async () => {
    frame = 0;
    dirty = false;
    pending = true;
    handoffInstant = tabSwitchHandoff || handoffAcrossPending || modalPresentHandoff || win.performance.now() < handoffUntil;
    try {
      // A retained sync performs no update; keep the modal handoff armed so the
      // deferred retirement still runs instantly after the overlay releases.
      if (retentions.size && !manualSuspensions.size) return;
      modalPresentHandoff = false;
      // A tab is a separate page, not a stack transition. Retire its covers before
      // rendering destination assets, which may continue changing as the page loads.
      // Keep shared surfaces (especially the tab bar and its accessory) native.
      if ((tabSwitchHandoff || handoffAcrossPending || win.performance.now() < handoffUntil) && renderedSnapshot && !navigation.current) {
        const retained = acknowledged.filter(
          (candidate) =>
            candidate.element.isConnected &&
            !verticalBarsPages.isDeparted(candidate.element, true) &&
            !candidate.element.closest('.ion-page-hidden') &&
            !Array.from(tabActivationPages.keys()).some((page) => page.contains(candidate.element)),
        );
        const retiredSearches = new Set(
          retained
            .filter(
              (candidate) =>
                candidate.control.search?.available &&
                candidateSources(candidate).some(
                  (source) => !source.isConnected || verticalBarsPages.isDeparted(source, true) || !!source.closest('.ion-page-hidden'),
                ),
            )
            .map((candidate) => candidate.control.id),
        );
        if (retained.length !== acknowledged.length || retiredSearches.size) {
          // The tabs are shared, but their Search belongs to the departing page.
          // Retire it before destination assets without returning its FAB to Web.
          for (const candidate of retained) {
            if (!retiredSearches.has(candidate.control.id)) continue;
            const configuration = candidate.control.search!;
            getNativeSearchBindings(doc)
              .filter((binding) => candidateSources(candidate).includes(binding.footer))
              .forEach((binding) => search.retire(binding, true));
            candidate.control = { ...candidate.control, search: { ...configuration, available: false, active: false, focused: false } };
            candidate.actions.delete(configuration.trigger.id);
            candidate.actions.delete(configuration.closeId);
          }
          const retainedIds = new Set(retained.map((candidate) => candidate.control.id));
          const retainedSources = new Set(retained.flatMap(candidateSources));
          for (const element of sources.keys()) if (!retainedSources.has(element)) restore(element, true);
          const retirement: NativeUISnapshot = {
            ...renderedSnapshot,
            revision: ++revision,
            transitionDuration: 0,
            toolbarTransition: undefined,
            verticalBarNavigation: undefined,
            controls: renderedSnapshot.controls
              .filter((control) => retainedIds.has(control.id))
              .map((control) =>
                retiredSearches.has(control.id)
                  ? { ...control, search: { ...control.search!, available: false, active: false, focused: false } }
                  : control,
              ),
          };
          updatingRevision = retirement.revision;
          updates++;
          const result = await bounded(plugin.update(retirement));
          if (stopped) return;
          if (result.revision !== retirement.revision) throw new Error('Native UI revision mismatch');
          renderedSnapshot = retirement;
          acceptedRevision = result.revision;
          acknowledged = retained;
          actions = new Map(retained.flatMap((candidate) => Array.from(candidate.actions)));
          lastSnapshot = '';
          const received = pendingActivations;
          pendingActivations = [];
          received.forEach(activate);
          if (tabActivationPages.size) finishWaiters();
          if (dirty) return;
        }
      }
      if (options.source !== 'extensions') syncToolbarText(doc);
      const size = `${win.innerWidth}:${win.innerHeight}`;
      // WebKit can resize before Ionic's fixed DOM positions catch up.
      // Measure on the next frame instead of retiring a valid native search.
      if (viewport !== size) {
        viewport = size;
        dirty = true;
        return;
      }
      observe();
      let candidates = read();
      const signatures = new Map(candidates.map((candidate) => [candidate.element, signature(candidate)]));
      const rejectionSignatures = new Map(candidates.map((candidate) => [candidate.element, signature(candidate, false)]));
      const failedAssets = new Set<Candidate>();
      const assets = Promise.all(
        candidates.map(async (candidate) => {
          try {
            await candidate.assets?.render(icons);
          } catch {
            failedAssets.add(candidate);
            diagnose('invalid-assets: image conversion or serialized extension props failed.', candidate.element);
          }
          await Promise.all(
            candidate.icons.map(async (icon) => {
              const field = icon.field ?? 'icon';
              icon.item[field] = await icons.render(
                icon.source,
                field === 'icon' ? icon.item.iconWidth! : icon.item.closeIconWidth!,
                field === 'icon' ? icon.item.iconHeight! : icon.item.closeIconHeight!,
              );
            }),
          );
        }),
      );
      // A tab change invalidates this page. Do not let an in-flight image decode
      // postpone retirement of its native covers.
      await Promise.race([assets, new Promise<void>((resolve) => (interruptAssets = resolve))]);
      interruptAssets = undefined;
      candidates = candidates.filter((candidate) => !failedAssets.has(candidate));
      if (stopped || dirty || (retentions.size && !manualSuspensions.size)) return;
      const retained = new Set([...candidates.flatMap(candidateSources), ...(verticalGesture?.sources ?? [])]);
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
      const committingNavigation = navigation.current?.phase === 'committing';
      const preparingNavigation = navigation.current?.leased && navigation.current.phase === 'playing';
      const returningToWeb = removed.filter((element) => !committingNavigation || !navigation.owns(element));
      if (returningToWeb.length) {
        // Restore the source and let WebKit paint before removing its native cover.
        returningToWeb.forEach((element) => restore(element, preparingNavigation));
        if (removed.some(isVerticalBarsSource))
          win.dispatchEvent(new CustomEvent('nativeUIVerticalBarsRelease', { detail: { instant: handoffInstant } }));
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
      const transition = navigation.current;
      const railCandidates = candidates.filter((candidate) => candidate.control.placement === 'vertical-bars');
      const activePage = railCandidates.length
        ? (railCandidates.find((candidate) => candidate.control.kind !== 'tab-bar')?.element.closest<HTMLElement>('.ion-page') ??
          Array.from((modal ?? scope).querySelectorAll<HTMLElement>('.ion-page'))
            .reverse()
            .find((page) => {
              const invisible = page.closest<HTMLElement>('.ion-page-invisible');
              return (
                !page.closest('.ion-page-hidden, ion-menu') &&
                !verticalBarsPages.isDeparted(page) &&
                (modal || !page.closest('ion-modal, ion-popover')) &&
                (!invisible || pages.has(invisible))
              );
            }))
        : undefined;
      const data = {
        verticalBarNavigationPhase: verticalGesture ? (verticalGesture.pending ? ('tracking' as const) : ('settling' as const)) : undefined,
        verticalBarNavigation: activePage ? verticalNavigation.read(activePage).map(id) : undefined,
        toolbarTransition:
          transition?.prepared && transition.phase !== 'committing'
            ? {
                id: transition.id,
                sourceIds: transition.frozen.map((candidate) => candidate.control.id),
                destination: transition.destination.map((candidate) => candidate.control),
              }
            : undefined,
        verticalBarFrame,
        viewportWidth: win.innerWidth,
        verticalBarEdge,
        controls: candidates.map((candidate) => candidate.control),
      };
      const serialized = JSON.stringify(data);
      if (serialized === lastSnapshot && !forceRefresh) {
        search.settle((element) => Array.from(pages).some((page) => page.contains(element)));
        return;
      }
      const snapshot: NativeUISnapshot = {
        ...data,
        revision: ++revision,
        transitionDuration: crossfade.duration(handoffInstant || committingNavigation || preparingNavigation),
      };
      // A native visibility notification during this update must survive its ack.
      forceRefresh = false;
      updates++;
      updatingRevision = snapshot.revision;
      const result = await bounded(plugin.update(snapshot));
      if (stopped || (retentions.size && !manualSuspensions.size)) return;
      if (result.revision !== snapshot.revision) throw new Error('Native UI revision mismatch');
      if (transition && navigation.current === transition && result.toolbarTransition === transition.id) {
        transition.native = true;
        navigation.mask(
          transition.destination.filter((candidate) => !result.rejectedControls?.includes(candidate.control.id)),
          true,
        );
      }
      if (transition && navigation.current === transition)
        navigation.unmask(transition.destination.filter((candidate) => result.rejectedControls?.includes(candidate.control.id)));
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
      if (result.rejectedControls?.some((id) => navigation.current?.frozen.some((candidate) => candidate.control.id === id)))
        navigation.clear();
      for (const candidate of candidates) {
        if (result.rejectedControls?.includes(candidate.control.id)) {
          diagnose(
            'native-rejected: the native renderer rejected this source; check decoded props, placement, and device support.',
            candidate.element,
          );
          rejected.set(candidate.element, rejectionSignatures.get(candidate.element)!);
          setRejected(candidate.element, true);
          dirty = true;
        }
      }
      // A page mutation must not tear down unchanged shared controls such as tabs.
      const currentCandidates = dirty ? read() : candidates;
      const current = dirty ? new Map(currentCandidates.map((candidate) => [candidate.element, signature(candidate)])) : signatures;
      const currentSources = new Set([...currentCandidates.flatMap(candidateSources), ...(verticalGesture?.sources ?? [])]);
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
      renderedSnapshot = snapshot;
      acceptedRevision = result.revision;
      lastSnapshot = invalidated ? '' : serialized;
      actions = new Map(
        candidates.filter((candidate) => current.has(candidate.element)).flatMap((candidate) => Array.from(candidate.actions)),
      );
      // Keep an existing cover while its content catches up. Only an ineligible
      // source needs to return to Web; new sources still require an exact ack.
      for (const element of sources.keys())
        if (!currentSources.has(element)) restore(element, committingNavigation && navigation.owns(element));
      for (const element of verticalBarsOwners) {
        if (acceptedVerticalBarsOwners.has(element)) continue;
        element.removeAttribute(verticalBarsMarker);
        verticalBarsOwners.delete(element);
      }
      if (acceptedVerticalBarsOwners.size)
        win.dispatchEvent(new CustomEvent('nativeUIVerticalBarsAcquire', { detail: { instant: handoffInstant } }));
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
      for (const candidate of accepted) {
        const instant = handoffInstant || (committingNavigation && horizontalToolbar(candidate));
        for (const element of candidateSources(candidate)) {
          const newlyProjected = !sources.has(element) || !element.hasAttribute(marker);
          if (!sources.has(element)) {
            sources.set(element, element.getAttribute('aria-hidden'));
            crossfade.play(element, true, instant || (isVerticalBarsSource(element) && !element.matches('ion-tab-bar')));
          }
          element.setAttribute(marker, '');
          element.setAttribute('aria-hidden', 'true');
          if (newlyProjected) element.dispatchEvent(new CustomEvent('nativeUIChange'));
        }
      }
      if (!dirty && !invalidated) search.settle((element) => Array.from(pages).some((page) => page.contains(element)));
      // Native has acknowledged this rendered snapshot even when a concurrent DOM
      // mutation invalidates its signature. An existing cover is still visible;
      // keep that snapshot available if navigation starts before the next update.
      acknowledged = candidates.filter(
        (candidate) =>
          !result.rejectedControls?.includes(candidate.control.id) && candidateSources(candidate).some((source) => sources.has(source)),
      );
      if (committingNavigation && !invalidated) navigation.clear();
      const received = pendingActivations;
      pendingActivations = [];
      received.forEach(activate);
      // Navigation only needs its acknowledged handoff. Unrelated refreshes and
      // fades may continue without holding the page at its starting position.
      // An earlier lifecycle snapshot may finish after endpoint preparation. It
      // cannot release playback before the prepared transition itself was sent.
      if (
        preparingNavigation &&
        !invalidated &&
        transition === navigation.current &&
        (!transition?.prepared || snapshot.toolbarTransition?.id === transition.id)
      )
        finishWaiters(transition);
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
          record.attributeName !== navigationMarker &&
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
  // Measure only before playback. Restore page attributes synchronously, before WebKit paints.
  const maskNavigationPage = (page: HTMLElement) => {
    if (!navigation.current) return;
    const className = page.getAttribute('class');
    const pageStyle = page.getAttribute('style');
    // Ionic can hide a transitioning header until its collapse state settles. Its fixed buttons
    // still need correspondence before the transition creates its Web back clone.
    const headers = Array.from(page.querySelectorAll<HTMLElement>('ion-header.header-transitioning')).filter(
      (header) => !header.closest('ion-content'),
    );
    const headerStyles = headers.map((header) => header.getAttribute('style'));
    headers.forEach((header) => header.style.setProperty('opacity', '1', 'important'));
    measuringPointerPages.add(page);
    page.classList.remove('ion-page-hidden', 'ion-page-invisible');
    page.style.setProperty('pointer-events', 'auto', 'important');
    try {
      const candidates = navigation.measure(() =>
        unprojected(sources.keys(), () =>
          // Only fixed toolbar controls participate in this handoff. Avoid measuring
          // content controls that will be discarded by horizontalToolbar below.
          Array.from(page.querySelectorAll<HTMLElement>(discovery))
            .filter(inFixedToolbar)
            .map(readEnabledCandidate)
            .filter((candidate): candidate is Candidate => !!candidate && horizontalToolbar(candidate)),
        ),
      );
      assignToolbarTransitionIds(candidates);
      navigation.current.destination = candidates;
      navigation.mask(candidates);
    } finally {
      headers.forEach((header, index) => {
        const style = headerStyles[index];
        if (style === null) header.removeAttribute('style');
        else header.setAttribute('style', style);
      });
      if (className === null) page.removeAttribute('class');
      else page.setAttribute('class', className);
      if (pageStyle === null) page.removeAttribute('style');
      else page.setAttribute('style', pageStyle);
      win.setTimeout(() => measuringPointerPages.delete(page), 0);
    }
  };
  const finishNavigation = (transition = navigation.current) => {
    if (transition !== navigation.current || !transition || transition.phase !== 'playing') return;
    transition.phase = 'settling';
    // Ionic removes page transforms and applies hidden-page classes after onFinish.
    void painted().then(() => {
      if (stopped || navigation.current !== transition) return;
      transition.phase = 'committing';
      forceRefresh = true;
      schedule();
    });
  };
  const pageWill: EventListener = (event) => {
    const page = event.target as HTMLElement;
    verticalBarsPages.lifecycle(event);
    tabActivationPages.delete(page);
    getNativeSearchBindings(doc)
      .filter((binding) => page.contains(binding.footer))
      .forEach((binding) => search.retire(binding));
    // Angular updates the URL before willLeave, but keeps ion-tab-bar.selectedTab on the
    // leaving tab until DidChange. A mismatch means this leave is a tab switch, not a stack push.
    if (event.type === LIFECYCLE_WILL_LEAVE) beginTabSwitchHandoffIfNeeded(page);
    if (event.type === LIFECYCLE_WILL_LEAVE && !tabSwitchHandoff && !manualSuspensions.size && !overlayOpen()) {
      navigation.begin([...pages, page], acknowledged);
      for (const entering of pages) if (entering !== page) maskNavigationPage(entering);
    } else if (event.type === LIFECYCLE_WILL_ENTER && navigation.current) {
      navigation.begin([page], acknowledged);
      maskNavigationPage(page);
    }
    pages.add(page);
    if (event.type === LIFECYCLE_WILL_ENTER && nativeVerticalBars()) search.prepare(page);
    schedule();
  };
  const pageDid: EventListener = (event) => {
    const page = event.target as HTMLElement;
    verticalBarsPages.lifecycle(event);
    tabActivationPages.delete(page);
    pages.delete(page);
    if (navigation.current && !navigation.current.leased && pages.size === 0) finishNavigation();
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
    navigation.clear();
    interruptAssets?.();
    crossfade.finish();
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
    if (!navigation.current?.leased) finishNavigation();
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
  on(doc, 'nativeUIOverlayAdopted', (event) => overlayPresenting((event as CustomEvent<HTMLElement>).detail));
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
  on(win, 'resize', () => {
    navigation.clear();
    refreshLayout();
  });
  on(win, 'keyboardWillShow', () => search.keyboard(true));
  on(win, 'keyboardWillHide', () => search.keyboard(false));
  on(win, 'scroll');
  on(win.matchMedia('(prefers-color-scheme: dark)'), 'change');
  on(win, 'nativeUIRefresh', (event) => {
    if (nativeVerticalBars()) search.prepare();
    if ((event as Event & { retireSearch?: boolean }).retireSearch)
      getNativeSearchBindings(doc).forEach((binding) => search.retire(binding));
    refreshLayout();
  });
  if (win.visualViewport) {
    on(win.visualViewport, 'resize', refreshLayout);
    on(win.visualViewport, 'scroll');
  }
  const handle: NativeUIRuntimeHandle & { retain: (deferActivation?: (id: string) => boolean) => () => void } = {
    // A native overlay covers this surface; keep its controls and Web ownership intact.
    retain(deferActivation) {
      const retention: { accepts?: (id: string) => boolean; activation?: NativeUIActivation } = { accepts: deferActivation };
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
    markForCheck: schedule,
    getStatus: (): NativeUIStatus => ({
      state: stopped ? 'stopped' : sources.size ? 'native' : 'web',
      projected: sources.size,
      updates,
      reason,
    }),
    async suspend() {
      const token = Symbol();
      let resumed = false;
      if (!stopped) {
        navigation.clear();
        verticalGesture = undefined;
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
        setNativeUIIntegration(doc);
        win.cancelAnimationFrame(frame);
        listeners.abort();
        observer.disconnect();
        resize.disconnect();
        observed.clear();
        actions.clear();
        pendingActivations = [];
        navigation.clear();
        acknowledged = [];
        verticalGesture = undefined;
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
  const activate = (event: NativeUIActivation) => {
    const accepted = dispatchActivation(event);
    if (event.requestId && accepted !== undefined) {
      void bounded(plugin.completeExtensionAction({ requestId: event.requestId, accepted })).catch(() => {});
    }
  };
  const dispatchActivation = (event: NativeUIActivation): boolean | undefined => {
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
    if (!element || (verticalGesture && owner && isVerticalBarsSource(owner))) return false;
    if (!owner || !inVerticalBarsSurface(owner)) return false;
    const direct = !blocked(owner) && unprojected(sources.keys(), () => readEnabledCandidate(owner));
    const candidate = direct || read().find((candidate) => candidate.actions.has(event.id));
    // Only retained horizontal controls are locked during navigation. Vertical
    // Bars and other toolbar controls keep their existing activation lifecycle.
    if (candidate && horizontalToolbar(candidate) && navigation.owns(element)) return false;
    const item = candidate?.control.items.find((item) => item.id === event.id);
    const searchAction =
      candidate?.control.search && [candidate.control.search.trigger.id, candidate.control.search.closeId].includes(event.id);
    const extensionAction = candidate?.control.kind === 'extension' && candidate.actions.get(event.id) === element;
    if (!extensionAction && !searchAction && (!item || item.disabled || item.visible === false)) return false;
    // A native tab tap must release the old page's covers before Ionic exposes
    // the destination. Waiting for WillLeave is too late for an unanimated swap.
    if (element.matches('ion-tab-button')) lastTabSequence = event.sequence;
    if (element.matches('ion-tab-button') && !element.classList.contains('tab-selected')) {
      const tabs = element.closest('ion-tabs');
      const leaving = new Set(
        acknowledged
          .map((source) => source.element.closest<HTMLElement>('.ion-page'))
          .filter((page): page is HTMLElement => !!page && !!tabs?.contains(page)),
      );
      leaving.forEach((page) => tabActivationPages.set(page, event.sequence));
      armTabSwitchHandoff();
      void flush().then(() => {
        if (stopped) return;
        if (event.sequence === lastTabSequence && element.isConnected && !(element as HTMLIonTabButtonElement).disabled)
          activateProjectedElement(element);
        // WillLeave/WillEnter release these scopes once Ionic commits the route.
        // If a router guard rejects it, restore native ownership after the handoff window.
        win.setTimeout(
          () => {
            leaving.forEach((page) => {
              if (tabActivationPages.get(page) === event.sequence) tabActivationPages.delete(page);
            });
            // Rejected selection emits no DidChange/pageDid to end the handoff.
            if (!tabActivationPages.size && !pages.size) endTabSwitchHandoff();
            if (!stopped) schedule();
          },
          Math.max(0, handoffUntil - win.performance.now()),
        );
        lastSnapshot = '';
        schedule();
      });
      return true;
    }
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
    setNativeUIIntegration(doc, {
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
      async suspend(scopes, suspensionOptions) {
        verticalGesture = undefined;
        if (!suspensionOptions?.navigation) {
          navigation.clear();
        }
        let transition: typeof navigation.current;
        let finishVertical: ((canceled: boolean) => boolean) | undefined;
        if (
          suspensionOptions?.navigation &&
          !tabSwitchHandoff &&
          !overlayOpen(true, true) &&
          scopes[0]?.closest('ion-app.ios-theme-vertical-bars') &&
          scopes.every(inVerticalBarsSurface)
        ) {
          finishVertical = verticalNavigation.begin(scopes[0], scopes[1], suspensionOptions.direction);
          if (suspensionOptions.interactive) {
            verticalGesture = {
              pending: true,
              scopes,
              sources: new Set(
                acknowledged.filter((candidate) => candidate.control.placement === 'vertical-bars').flatMap(candidateSources),
              ),
            };
          }
        }
        if (suspensionOptions?.navigation && !manualSuspensions.size && !overlayOpen() && !tabSwitchHandoff) {
          transition = navigation.begin(scopes, acknowledged, true);
          maskNavigationPage(scopes[0]);
          // Keep outgoing surfaces native through playback, including those with
          // no destination. Native progress fades them out in place.
          try {
            await Promise.all(
              transition.destination.flatMap((candidate) =>
                candidate.icons.map(async (icon) => {
                  icon.item.icon = await icons.render(icon.source, icon.item.iconWidth!, icon.item.iconHeight!);
                }),
              ),
            );
          } catch (error) {
            await fail(error);
            return () => {};
          }
          transition.prepared = transition.frozen.length > 0 || transition.destination.length > 0;
        }
        const gesture = verticalGesture;
        getNativeSearchBindings(doc)
          .filter((binding) => scopes.some((scope) => scope.contains(binding.footer) || scope.contains(binding.tabBar)))
          .forEach((binding) => search.retire(binding));
        suspended.add(scopes);
        await flush(transition);
        // Moving content has returned to Web; fixed toolbar covers remain native for navigation.
        await new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()));
        const release: NativeUITransitionRelease = (canceled = false) => {
          const currentVertical = finishVertical?.(canceled) !== false;
          suspended.delete(scopes);
          if (!currentVertical) return;
          if (verticalGesture === gesture) verticalGesture = undefined;
          if (canceled || !scopes.some((scope) => scope.closest('ion-app.ios-theme-vertical-bars'))) {
            scopes.forEach((scope) => pages.delete(scope)); // Preserve ordinary iPhone handoff; cancellation has no DidLeave.
            if (canceled) {
              verticalBarsPages.cancel(scopes[0], scopes[1]); // The entering page is abandoned; the leaving page stays active.
            }
          }
          if (transition) finishNavigation(transition);
          schedule();
        };
        if (gesture) {
          release.finishGesture = (complete) => {
            if (!complete || verticalGesture !== gesture) return;
            gesture.pending = false;
            schedule();
          };
        }
        if (transition?.native) {
          let requested = 0;
          let sent = -1;
          let sending = false;
          release.progress = (value) => {
            requested = Math.max(0, Math.min(1, value));
            if (sending || requested === sent || navigation.current !== transition) return;
            sending = true;
            void (async () => {
              try {
                do {
                  sent = requested;
                  await bounded(plugin.setToolbarTransitionProgress({ id: transition.id, progress: sent }));
                } while (requested !== sent && navigation.current === transition);
              } catch (error) {
                await fail(error);
              } finally {
                sending = false;
              }
            })();
          };
        }
        return release;
      },
    });
    on(win, 'pagehide', () => {
      void handle.destroy();
      onStop?.('pagehide');
    });
    schedule();
  } catch (error) {
    await fail(error);
  }
  return handle;
};
