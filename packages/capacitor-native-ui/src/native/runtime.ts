import { type OverlayChange } from '@webview-native-ui/engine';
import { enableSupportIonicOverlays, coveredIonicSurface } from '@webview-native-ui/engine/ionic';
import { createScrollBindings } from '@webview-native-ui/engine';
import { movingModal, modalMotionEvent } from './shared/modal';
import { coverOverlayBackground, usesCoveredBackground } from './overlays/covered-overlay';
import { getProjectionState } from './shared/covered-source';
import { createCoveredSnapshots, type CoveredSnapshots } from './shared/covered-snapshot';
import { createTabBarWidths } from './shared/tab-bar-width';
import { createVerticalNavigation } from './shared/vertical-navigation';
import { createHorizontalNavigation, horizontalToolbar, navigationMarker } from './shared/horizontal-navigation';
import { assignToolbarTransitionIds } from './shared/transition-identity';
import { controlSelected } from './shared/control-options';
import { createDiagnostics } from './shared/diagnostics';
import { htmlSelector, readHTMLControl } from './html';
import { extensionAncestors, readExtension } from './extensions';
import { bounded, boundedListener } from './shared/bridge';
import type { NativeUIConnection } from './shared/connection';
import {
  alignVerticalTabBar,
  forgetVerticalBarFrame,
  rememberVerticalBarFrame,
  validVerticalBarFrame,
} from './shared/vertical-bars-geometry';
import { projectionIds } from './shared/projection-id';
import {
  inVerticalBarsSurface,
  topModal,
  modalStack,
  modalUsesVerticalBars,
  modalVerticalBarFrame,
  modalPreparing,
  modalDismissing,
  modalPresentation,
} from './shared/modal';
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

// Only these Web overlays leave the rail's display and interaction intact.
const railPreservingOverlays = 'ion-toast, ion-popover, ion-picker';
const verticalBarsMarker = 'data-native-ui-vertical-bars';
const verticalBarsMemberMarker = 'data-native-ui-vertical-bars-member';

export const createRuntime = async (
  doc: Document,
  plugin: NativeUIPlugin,
  options: NativeUIRuntimeOptions = {},
  nativeVerticalBars: () => boolean = () => true,
  onStop?: (cause: 'failure' | 'pagehide') => void,
  connection?: NativeUIConnection,
): Promise<NativeUIRuntimeHandle & { retain: (deferActivation?: (id: string) => boolean) => () => void }> => {
  const projectionState = getProjectionState(doc);
  const { isProjectionMutation, sourcesChangedEvent } = projectionState;
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
  let snapshots: CoveredSnapshots | undefined;
  const modalSnapshots = new Map<HTMLIonModalElement, CoveredSnapshots>();
  const imageSurfaces = () => [...(snapshots ? [snapshots] : []), ...modalSnapshots.values()];
  const imagesFor = (modal?: HTMLIonModalElement) => (modal ? modalSnapshots.get(modal) : snapshots);
  const coveredSurface = (overlay: HTMLElement) => coveredIonicSurface(overlay) as HTMLIonModalElement | undefined;
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
  let nativeScrollOwners = new Set<HTMLElement>();
  const scrollBindings = createScrollBindings();
  const reusesScroll = (candidate: Candidate) => scrollBindings.reuse(candidate, win.innerWidth);
  const scrollControl = (candidate: Candidate) =>
    candidate.control.scroll
      ? { ...candidate.control, scroll: { ...candidate.control.scroll, reuse: reusesScroll(candidate) } }
      : candidate.control;
  const pages = new Set<HTMLElement>();
  const tabActivationPages = new Map<HTMLElement, number>();
  const verticalBarsPages = createVerticalBarsPageState();
  const overlayMonitor = enableSupportIonicOverlays(undefined, doc)!;
  const presented = overlayMonitor.active;
  const blockingRailOverlays = new WeakSet<HTMLElement>();
  const manualSuspensions = new Map<symbol, boolean>();
  const moving = new Map<HTMLElement, Set<string>>();
  const observed = new Set<Element | ShadowRoot>();
  const listeners = new AbortController();
  let actions = new Map<string, HTMLElement>();
  let nextId = 0;
  let revision = 0;
  const tabGeometry = new Map<HTMLElement, () => void>();
  const tabWidths = createTabBarWidths(doc);
  let acceptedRevision = 0;
  let updatingRevision: number | undefined;
  let pendingActivations: NativeUIActivation[] = [];
  let lastSequence = 0;
  let lastTabSequence = 0;
  let lastSnapshot = '';
  let playingModalAnimation: number | undefined;
  let renderedSnapshot: NativeUISnapshot | undefined;
  let interruptAssets: (() => void) | undefined;
  let viewport = `${win.innerWidth}:${win.innerHeight}`;
  let forceRefresh = false;
  let dirty = false;
  let pending = false;
  let retryingUpdate = false;
  let awaitingConnection = false;
  let reconciledUpdate = false;
  let lastUpdateStarted = 0;
  let connectionSession: string | undefined;
  let stopConnectionCheck: (() => void) | undefined;
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
  let modalHandoff = false;
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
    /* Hide the entire clone layer, including its shadow parts, until handoff. */
    .ion-cloned-element:is([${verticalBarsMarker}], [${verticalBarsMemberMarker}]):not([${fadeMarker}]):not([data-native-ui-snapshot-visible]),
    .ion-cloned-element:is([data-native-ui-snapshot-source], [data-native-ui-proxy-prepared]):not([data-native-ui-snapshot-visible]) { opacity: 0 !important; content-visibility: hidden !important; }
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
      crossfade.play(
        element,
        false,
        instant ||
          handoffInstant ||
          projectionState.isVisible(element) ||
          (isVerticalBarsSource(element) && !element.matches('ion-tab-bar')),
      );
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
    if (projectionState.owns(element)) return;
    if (snapshots && movingModal(doc) && element.closest('ion-modal') === movingModal(doc) && isVerticalBarsSource(element)) return;
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
      const candidate = readExtension(
        element,
        extensions,
        id,
        (reason) => diagnose(`${extension.name}: ${reason}`, element),
        options.nativeScroll,
      );
      if (candidate && !scrollBindings.eligible(candidate, win.innerWidth)) return undefined; // New bindings are acquired at rest; established bindings keep following.
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
      overlayMonitor.isExcluded(element as HTMLElement) ||
      (!!ignoredSelector && element.matches(ignoredSelector) && !blockingRailOverlays.has(element as HTMLElement)) ||
      (allowModal && !!modal && modalUsesVerticalBars(modal) && element.matches('ion-modal'));
    const presentedOverlayOpen = Array.from(presented).some(
      (element) => !ignored(element) && (includeMenu || !element.matches('ion-menu')),
    );
    return manualSuspensions.size > 0 || presentedOverlayOpen;
  };
  // Compare source data before PNG rendering mutates each item's payload.
  const signature = (candidate: Candidate, includeTransitionIds = true) => {
    const modal = candidate.element.closest('ion-modal');
    // Native owns placement during modal entry. Translation must not invalidate
    // its acknowledgement, while label, disabled and artwork changes still do.
    const animatedRail = modal && modalPresentation(modal) && candidate.control.placement === 'vertical-bars';
    const control = animatedRail
      ? { ...candidate.control, x: 0, y: 0, items: candidate.control.items.map((item) => ({ ...item, x: 0, y: 0 })) }
      : candidate.control;
    return JSON.stringify(
      { control, icons: candidate.icons.map(({ source }) => source), assets: candidate.assets?.signature },
      (key, value) => {
        if (!includeTransitionIds && key === 'transitionId') return undefined;
        // Translated DOMRects contain floating-point noise even when the control
        // has not resized. Keep subpixel changes, not numerical round-off.
        return animatedRail && typeof value === 'number' ? Math.round(value * 1000) / 1000 : value;
      },
    );
  };
  const readSources = (): Candidate[] => {
    // Ionic owns the closing animation. Keep the covered page on Web until
    // DidDismiss instead of repeatedly projecting the moving modal controls.
    const modal = topModal(doc);
    if (modal && modalDismissing(modal)) return [];
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
      ...Array.from(scope.querySelectorAll<HTMLElement>('[data-native-ui-snapshot-source]')),
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
                  !(topModal(doc) && modalPreparing(topModal(doc)!)) &&
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
  const read = (): Candidate[] => tabWidths.measure(readSources);
  const scrollChanged = (event: Event) => {
    const target = event.composedPath()[0];
    if (options.nativeScroll && target instanceof HTMLElement) scrollBindings.changed(target);
    imageSurfaces().forEach((surface) => surface.changed(target));
    // Only an acknowledged native binding can own motion. Other sources in the
    // same container still need the regular reader (including rejected sources).
    if (
      target instanceof HTMLElement &&
      nativeScrollOwners.has(target) &&
      !dirty &&
      !imageSurfaces().some((surface) => surface.restoring) &&
      !overlayOpen()
    )
      return;
    schedule();
  };
  const scrollSettled = (event: Event) => {
    if (!options.nativeScroll) return;
    const owner = event.composedPath()[0];
    if (owner instanceof HTMLElement) {
      scrollBindings.settled(owner);
    }
    let found = false;
    for (const extension of extensions) {
      if (!extension.scrollElement) continue;
      for (const element of Array.from(scope.querySelectorAll<HTMLElement>(extension.selector))) {
        try {
          if (extension.scrollElement(element) !== owner) continue;
        } catch {
          continue; // A reader failure keeps the existing Web fallback.
        }
        rejected.delete(element);
        found = true;
      }
    }
    // One settled reconciliation retries temporary binding refusals and notices
    // replaced WebKit scrollers. Reuse normal update/ACK/fallback ownership.
    if (found) {
      lastSnapshot = '';
      schedule();
    }
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
    for (const element of observed)
      if (element instanceof ShadowRoot) {
        element.removeEventListener('scroll', scrollChanged, true);
        element.removeEventListener('scrollend', scrollSettled, true);
      }
    observed.clear();
    observer.observe(doc.documentElement, observation);
    for (const element of wanted) {
      observed.add(element);
      if (element instanceof ShadowRoot) {
        observer.observe(element, observation);
        on(element, 'scroll', scrollChanged);
        on(element, 'scrollend', scrollSettled);
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
  const updateNative = async (snapshot: NativeUISnapshot) => {
    // Native can apply this update even if retention or viewport changes prevent
    // accepting its response. Only a fully accepted snapshot is safe to deduplicate.
    lastSnapshot = '';
    // A handoff can start while an older asynchronous collection is still running.
    if (snapshot.coveredSnapshotToken !== snapshots?.token) {
      dirty = true;
      return;
    }
    lastUpdateStarted = win.performance.now();
    let result;
    try {
      result = await bounded(plugin.update(snapshot));
    } catch (error) {
      if (stopped) return;
      if (retryingUpdate) {
        if (!connection || reconciledUpdate) throw error;
        // The common handshake will retry current state once the bridge responds.
        // Keep subscriptions and identities; never replay the triggering action.
        awaitingConnection = true;
        dirty = false;
        return;
      }
      // Keep the existing connection. A fresh read on the next frame retries
      // only state synchronization, never the action that triggered it.
      retryingUpdate = true;
      forceRefresh = true;
      dirty = true;
      diagnose('sync-retry: refreshing current state after an update failure.');
      return;
    }
    if (result.revision !== snapshot.revision) {
      if (!connection || reconciledUpdate) throw new Error('Native UI revision mismatch');
      awaitingConnection = true;
      dirty = false;
      return;
    }
    retryingUpdate = false;
    awaitingConnection = false;
    reconciledUpdate = false;
    return result;
  };
  const coverWebOverlay = () => {
    if (stopped || retentions.size || manualSuspensions.size) return;
    if (
      ![...presented].some(
        (overlay) =>
          overlay.isConnected && !overlayMonitor.isExcluded(overlay) && !overlay.matches('ion-modal') && usesCoveredBackground(overlay),
      )
    )
      return;
    // Native popovers retain their controls synchronously. Only the Web route reaches here.
    imagesFor(topModal(doc))?.begin();
  };
  const sync = async () => {
    followImageMotion();
    for (const [modal, surface] of modalSnapshots) {
      if (modal.isConnected) continue;
      modalSnapshots.delete(modal);
      void surface.destroy();
      imageSurfaces().forEach((remaining) => remaining.end());
    }
    coverWebOverlay();
    if (imageSurfaces().some((surface) => surface.handoffPending)) {
      frame = 0;
      return;
    }
    frame = 0;
    dirty = false;
    pending = true;
    handoffInstant = tabSwitchHandoff || handoffAcrossPending || modalHandoff || win.performance.now() < handoffUntil;
    try {
      // A retained sync performs no update; keep the modal handoff armed so the
      // deferred retirement still runs instantly after the overlay releases.
      if (awaitingConnection || (retentions.size && !manualSuspensions.size)) return;
      const enteringModal = topModal(doc);
      // Geometry refreshes continue for the Web rail during the Ionic animation.
      // Once native has acknowledged retirement, they must not publish it again.
      if (enteringModal && modalDismissing(enteringModal) && renderedSnapshot?.controls.length === 0) return;
      if (enteringModal && modalPresentation(enteringModal)?.animation.id === playingModalAnimation && playingModalAnimation !== undefined)
        return;
      modalHandoff = false;
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
          const retainedSources = new Set(retained.flatMap(candidateSources));
          for (const element of sources.keys()) if (!retainedSources.has(element)) restore(element, true);
          const retirement: NativeUISnapshot = {
            ...renderedSnapshot,
            revision: ++revision,
            transitionDuration: 0,
            toolbarTransition: undefined,
            verticalBarNavigation: undefined,
            controls: retained.map(scrollControl),
          };
          updatingRevision = retirement.revision;
          updates++;
          const result = await updateNative(retirement);
          if (stopped || !result) return;
          renderedSnapshot = retirement;
          acceptedRevision = result.revision;
          acknowledged = retained.filter((candidate) => !result.rejectedControls?.includes(candidate.control.id));
          scrollBindings.acknowledge(acknowledged, retirement.viewportWidth);
          for (const candidate of retained) {
            if (acknowledged.includes(candidate)) continue;
            candidateSources(candidate).forEach((source) => restore(source, true));
            if (candidate.scrollElement) nativeScrollOwners.delete(candidate.scrollElement);
            dirty = true;
          }
          actions = new Map(acknowledged.flatMap((candidate) => Array.from(candidate.actions)));
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
      const verticalBarFrame =
        modal && !(snapshots && movingModal(doc)) && !modalPreparing(modal) && !modalDismissing(modal) && modalUsesVerticalBars(modal)
          ? modalVerticalBarFrame(modal)
          : undefined;
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
        coveredSnapshotToken: snapshots?.token,
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
        modalAnimation: modal && verticalBarFrame ? modalPresentation(modal)?.animation : undefined,
        viewportWidth: win.innerWidth,
        verticalBarEdge,
        controls: candidates.map((candidate) => candidate.control),
      };
      const serialized = JSON.stringify(data);
      if (serialized === lastSnapshot && !forceRefresh) {
        search.settle((element) => Array.from(pages).some((page) => page.contains(element)));
        return;
      }
      const acquiringScroll = scrollBindings.acquiring(candidates, win.innerWidth);
      const snapshot: NativeUISnapshot = {
        ...data,
        controls: candidates.map(scrollControl),
        revision: ++revision,
        transitionDuration: crossfade.duration(
          handoffInstant || committingNavigation || preparingNavigation || imageSurfaces().some((surface) => surface.restoring),
        ),
      };
      // A native visibility notification during this update must survive its ack.
      forceRefresh = false;
      updates++;
      updatingRevision = snapshot.revision;
      const result = await updateNative(snapshot);
      // A provisional binding measured before motion is not an acknowledged
      // coordinate mapping. Keep Web and acquire it again after settling.
      const unconfirmedScroll = scrollBindings.unconfirmed(candidates, acquiringScroll);
      if (unconfirmedScroll.size) dirty = true;
      if (stopped || !result || (retentions.size && !manualSuspensions.size)) return;
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
          // An established WebKit scroller may be replaced when Web projection
          // styles change. Drop its ACK and reacquire once through the same path;
          // a failed fresh acquisition is cached normally to stop repeated retries.
          if (!snapshot.controls.find((control) => control.id === candidate.control.id)?.scroll?.reuse)
            rejected.set(candidate.element, rejectionSignatures.get(candidate.element)!);
          else candidateSources(candidate).forEach((source) => restore(source, true));
          setRejected(candidate.element, true);
          dirty = true;
        }
      }
      // A page mutation must not tear down unchanged shared controls such as tabs.
      const currentCandidates = dirty ? read() : candidates;
      const current = dirty ? new Map(currentCandidates.map((candidate) => [candidate.element, signature(candidate)])) : signatures;
      const currentSources = new Set([...currentCandidates.flatMap(candidateSources), ...(verticalGesture?.sources ?? [])]);
      const accepted = candidates.filter(
        (candidate) =>
          !result.rejectedControls?.includes(candidate.control.id) &&
          current.get(candidate.element) === signatures.get(candidate.element) &&
          (!candidate.scrollElement || !unconfirmedScroll.has(candidate.scrollElement)),
      );
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
      if (acceptedVerticalBarsOwners.size)
        win.dispatchEvent(new CustomEvent('nativeUIVerticalBarsAcquire', { detail: { instant: handoffInstant } }));
      for (const candidate of accepted) {
        const width = result.tabBarWidths?.[candidate.control.id];
        if (candidate.control.kind === 'tab-bar' && candidate.control.placement !== 'vertical-bars' && width !== undefined)
          tabWidths.apply(candidate.element, width);
        const instant =
          handoffInstant ||
          candidateSources(candidate).some(projectionState.isVisible) ||
          (committingNavigation && horizontalToolbar(candidate));
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
      // Transfer DOM ownership before retiring the image; partial/rejected acknowledgements keep it.
      const restoredIDs = accepted
        .filter((candidate) => !result.rejectedControls?.includes(candidate.control.id))
        .map((candidate) => candidate.control.id);
      for (const manager of imageSurfaces()) manager.updated(snapshot.coveredSnapshotToken, restoredIDs, snapshot.revision);
      if (!dirty && !invalidated) search.settle((element) => Array.from(pages).some((page) => page.contains(element)));
      // Native has acknowledged this rendered snapshot even when a concurrent DOM
      // mutation invalidates its signature. An existing cover is still visible;
      // keep that snapshot available if navigation starts before the next update.
      acknowledged = candidates.filter(
        (candidate) =>
          !result.rejectedControls?.includes(candidate.control.id) &&
          (!candidate.scrollElement || !unconfirmedScroll.has(candidate.scrollElement)) &&
          candidateSources(candidate).some((source) => sources.has(source)),
      );
      scrollBindings.acknowledge(acknowledged, snapshot.viewportWidth);
      const discovered = Array.from(scope.querySelectorAll<HTMLElement>(discovery));
      nativeScrollOwners = new Set(
        acknowledged
          .flatMap((candidate) => (candidate.scrollElement ? [candidate.scrollElement] : []))
          .filter((owner) =>
            discovered.every(
              (element) =>
                !Array.from(extensionAncestors(element)).includes(owner) ||
                extensions.some((extension) => extension.placement === 'tab-accessory' && element.matches(extension.selector)) ||
                acknowledged.some(
                  (candidate) =>
                    candidate.element === element &&
                    (candidate.scrollElement === owner ||
                      candidate.control.extension?.tabBarId ||
                      candidate.control.placement === 'vertical-bars'),
                ),
            ),
          ),
      );
      if (snapshot.modalAnimation && !invalidated && !result.rejectedControls?.length && !result.rejectedSearches?.length)
        playingModalAnimation = snapshot.modalAnimation.id;
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
      if (!stopped && !dirty && acceptedRevision === revision && !navigation.current && !verticalGesture) {
        imageSurfaces().forEach((surface) => surface.consider(acceptedRevision, acknowledged));
      }
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
          !isProjectionMutation(record) &&
          !(
            record.attributeName === 'style' &&
            snapshots &&
            movingModal(doc) &&
            (record.target === movingModal(doc) || record.target === movingModal(doc)?.shadowRoot?.querySelector('[part~="content"]'))
          ) &&
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
    ) {
      imageSurfaces().forEach((surface) => surface.changed());
      schedule();
    }
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
    // Popover content has Ionic page lifecycle too; it is not a page navigation.
    if (page.closest('ion-popover')) return;
    if (!page.closest('ion-modal')) snapshots?.invalidate();
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
    if (page.closest('ion-popover')) return;
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
    snapshots?.invalidate();
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
  let imageMotionFrame = 0;
  const followImageMotion = () => {
    if (imageMotionFrame || stopped) return;
    if (!moving.size) return;
    // Ancestor transforms already move the image with its host. Only an animated
    // projection host needs its local offset corrected (for example, a changing border).
    const surfaces = imageSurfaces().filter(
      (surface) =>
        (surface.token || surface.restoring) && surface.owners.some((owner) => moving.has(projectionState.getTarget(owner) ?? owner)),
    );
    if (!surfaces.length) return;
    imageMotionFrame = win.requestAnimationFrame(() => {
      imageMotionFrame = 0;
      surfaces.forEach((surface) => surface.moved());
      followImageMotion();
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
    followImageMotion();
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
    if (overlayMonitor.isExcluded(element)) return;
    imagesFor(coveredSurface(element))?.retireRestoration();
    if (element.matches('ion-popover')) {
      // Retention is chosen synchronously by the native overlay controller.
      // Otherwise a blocking Web popover must sit above the entire rail.
      if (usesCoveredBackground(element)) blockingRailOverlays.add(element);
      else blockingRailOverlays.delete(element);
    }
    if (element.matches('ion-picker') && usesCoveredBackground(element)) blockingRailOverlays.add(element);
    if (element.matches('ion-modal')) {
      const background = imagesFor(coveredSurface(element));
      if (background) coverOverlayBackground(element, background);
      modalHandoff = true;
      // A pending bridge update must retire the old controls immediately too.
      if (pending) handoffInstant = true;
    }
    // Let the overlay controller choose Native before the optional Web handoff.
    if (!element.matches('ion-modal')) win.queueMicrotask(coverWebOverlay);
    schedule();
  };
  const onOverlay = (callback: (change: OverlayChange) => void) => {
    const remove = overlayMonitor.subscribe(callback);
    listeners.signal.addEventListener('abort', remove, { once: true });
  };
  onOverlay(({ element, phase, event }) => {
    if (phase === 'change') imageSurfaces().forEach((surface) => surface.end());
    if (!element) {
      schedule();
      return;
    }
    if (element.matches('ion-menu')) {
      if (phase === 'willPresent') snapshots?.retireRestoration();
      schedule();
      return;
    }
    if (phase === 'willPresent') overlayPresenting(element);
    if (event?.type === 'ionBreakpointDidChange') {
      const modal = element as HTMLIonModalElement;
      const breakpoint = (event as CustomEvent<{ breakpoint?: number }>).detail?.breakpoint;
      if (breakpoint !== undefined && breakpoint > 0 && breakpoint <= (modal.backdropBreakpoint ?? 0))
        imagesFor(coveredSurface(modal))?.invalidate();
    }
    if (phase === 'willDismiss' && element.matches('ion-modal')) {
      modalSnapshots.get(element as HTMLIonModalElement)?.begin();
      modalHandoff = true;
      if (pending) handoffInstant = true;
      schedule();
    }
    if (phase === 'didDismiss') {
      blockingRailOverlays.delete(element);
      if (element.matches('ion-modal')) {
        modalHandoff = true;
        if (pending) handoffInstant = true;
        const modal = element as HTMLIonModalElement;
        void modalSnapshots.get(modal)?.destroy();
        modalSnapshots.delete(modal);
      }
      imageSurfaces().forEach((surface) => surface.end());
      schedule();
    }
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
  on(win, 'scroll', scrollChanged);
  on(win, 'scrollend', scrollSettled);
  on(win.matchMedia('(prefers-color-scheme: dark)'), 'change');
  on(win, 'nativeUIRefresh', (event) => {
    if (snapshots && (event as CustomEvent<{ modalMotion?: boolean }>).detail?.modalMotion) return;
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
    async suspend(suspensionOptions) {
      const token = Symbol();
      let resumed = false;
      if (!stopped) {
        navigation.clear();
        verticalGesture = undefined;
        manualSuspensions.set(token, suspensionOptions?.covered === true);
        if ([...manualSuspensions.values()].every(Boolean)) imagesFor(topModal(doc))?.begin();
        else
          imageSurfaces().forEach((surface) => {
            if (surface.token || surface.restoring) surface.invalidate();
          });
        getNativeSearchBindings(doc).forEach((binding) => search.retire(binding));
        await flush();
      }
      return {
        async resume() {
          if (resumed) return;
          resumed = true;
          if (stopped || !manualSuspensions.delete(token)) return;
          imageSurfaces().forEach((surface) => surface.end());
          await flush();
        },
      };
    },
    destroy() {
      if (destruction) return destruction;
      stopped = true;
      stopConnectionCheck?.();
      destruction = Promise.resolve().then(async () => {
        tabGeometry.forEach((restore) => restore());
        tabGeometry.clear();
        tabWidths.clear();
        setNativeUIIntegration(doc);
        win.cancelAnimationFrame(frame);
        win.cancelAnimationFrame(imageMotionFrame);
        listeners.abort();
        observer.disconnect();
        resize.disconnect();
        observed.clear();
        actions.clear();
        pendingActivations = [];
        navigation.clear();
        acknowledged = [];
        scrollBindings.acknowledge([], 0);
        verticalGesture = undefined;
        search.destroy();
        crossfade.destroy();
        await Promise.all([...modalSnapshots.values()].map((surface) => surface.destroy()));
        modalSnapshots.clear();
        await snapshots?.destroy();
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
    // A failed update may have reached native without acknowledging its actions.
    if (event.revision > acceptedRevision) return false;
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
  if (options.coveredSnapshots && plugin.coveredSnapshot) {
    try {
      const shared = {
        wake: () => {
          schedule();
          win.dispatchEvent(new Event(sourcesChangedEvent));
        },
        revision: () => revision,
      };
      snapshots = await createCoveredSnapshots(doc, plugin, connection?.listen ?? plugin.addListener.bind(plugin), {
        ...shared,
        blocked: () => overlayOpen() || !!navigation.current || !!verticalGesture || stopped,
      });
      const preparing = new Set<HTMLIonModalElement>();
      const prepareSurface = async (modal: HTMLIonModalElement) => {
        if (modalSnapshots.has(modal) || preparing.has(modal)) return;
        preparing.add(modal);
        try {
          const surface = await createCoveredSnapshots(doc, plugin, connection?.listen ?? plugin.addListener.bind(plugin), {
            ...shared,
            // The source surface is immutable; foreground ownership may change.
            modal: () => modal,
            blocked: () =>
              topModal(doc) !== modal ||
              modalPreparing(modal) ||
              !!modalPresentation(modal) ||
              movingModal(doc) === modal ||
              !!navigation.current ||
              stopped ||
              overlayOpen(true, true),
          });
          if (stopped || !modal.isConnected || !modalStack(doc).includes(modal)) await surface.destroy();
          else {
            modalSnapshots.set(modal, surface);
            schedule();
          }
        } catch {
          // This surface keeps the existing Web fallback if the optional listener fails.
        } finally {
          preparing.delete(modal);
        }
      };
      onOverlay(({ element, phase }) => {
        if (element?.matches('ion-modal') && (phase === 'willPresent' || phase === 'didPresent'))
          void prepareSurface(element as HTMLIonModalElement);
      });
      await Promise.all(modalStack(doc).map(prepareSurface));
      on(win, modalMotionEvent, (event) => {
        const { modal, moving } = (event as CustomEvent<{ modal: HTMLIonModalElement; moving: boolean }>).detail;
        const surface = modalSnapshots.get(modal);
        if (moving) surface?.begin();
        else if (!modalDismissing(modal)) {
          lastSnapshot = '';
          surface?.end();
        }
        schedule();
      });
      on(win, 'resize', () => {
        imageSurfaces().forEach((surface) => surface.invalidate());
      });
      on(win, 'orientationchange', () => {
        imageSurfaces().forEach((surface) => surface.invalidate());
      });
      for (const name of [
        'load',
        'transitionrun',
        'transitionend',
        'transitioncancel',
        'animationstart',
        'animationend',
        'animationcancel',
      ])
        on(doc, name, (event) => {
          const target = event.target instanceof Element ? event.target : undefined;
          if (target?.closest('style[data-native-ui-snapshot], [data-native-ui-projection-node]')) return;
          if (target?.hasAttribute('data-native-ui-snapshot') && (event as TransitionEvent).pseudoElement) return;
          imageSurfaces().forEach((surface) => surface.changed());
        });
      on(doc, 'visibilitychange', () => {
        if (doc.hidden) {
          imageSurfaces().forEach((surface) => surface.invalidate());
        }
      });
    } catch {
      /* Optional capability: older/mismatched Web bundles keep the existing fallback. */
    }
  }
  try {
    const listen = connection?.listen ?? plugin.addListener.bind(plugin);
    listener = await boundedListener(listen('activate', activate));
    searchListener = await boundedListener(
      listen('search', (event) => {
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
    stopConnectionCheck = connection?.observe(
      (state, restored, requestedAt) => {
        if (stopped || pending || lastUpdateStarted > requestedAt) return;
        const restarted =
          (connectionSession !== undefined && connectionSession !== state.session) ||
          (state.revision < acceptedRevision && state.sequence < lastSequence);
        connectionSession = state.session;
        if (restarted || restored) {
          imageSurfaces().forEach((surface) => surface.invalidate());
        }
        const missingSurface = acknowledged.some(
          ({ control }) =>
            !control.extension?.tabBarId && !(control.placement === 'vertical-bars' ? state.surfaces.vertical : state.surfaces.horizontal),
        );
        if (!restored && !awaitingConnection && !missingSurface && state.revision === acceptedRevision) return;
        // Native may have restarted or advanced while an acknowledgement was lost.
        // Advance the revision gate before refreshing, rejecting stale action events.
        revision = Math.max(revision, state.revision);
        acceptedRevision = revision + 1;
        lastSequence = restarted ? state.sequence : Math.max(lastSequence, state.sequence);
        lastTabSequence = 0;
        pendingActivations = [];
        reconciledUpdate = awaitingConnection;
        awaitingConnection = false;
        retryingUpdate = false;
        forceRefresh = true;
        lastSnapshot = '';
        schedule();
      },
      async (error) => {
        if (!stopped) await fail(error);
      },
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
