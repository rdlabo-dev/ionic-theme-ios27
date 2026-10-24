import { controlSelected } from './shared/control-options';
import { createCrossfade, fadeMarker } from './shared/crossfade';
import { alignVerticalBarClone, verticalBarFrame } from './shared/vertical-bars-geometry';
import { createVerticalBarsWebSearch, searchProjectionClass } from './vertical-bars-web-search';
import { inVerticalBarsSurface, topModal } from './shared/modal';
import type { NativeUIRuntimeHandle, NativeUIOptions, NativeUIStatus } from './definitions';
import { VERTICAL_BARS_TRANSITION_CANCELED } from '../native-integration';
import {
  activateProjectedElement,
  createVerticalBarsPageState,
  verticalBarsActionCandidate,
  verticalBarsBackCandidate,
  verticalBarsEnteringPage,
  verticalBarsToolbarActions,
  isExcluded,
  isNativeUIDisabled,
  isVerticalBarsToolbarGroup,
  preferredVerticalBarsBack,
  verticalBarsOwned,
  marker,
  syncToolbarText,
  toolbarTextMarker,
  prehideOnlyMutation,
  prehiddenClass,
  unprojected,
  withoutPrehide,
} from './shared/dom';

const backProjectionClass = 'ios-theme-vertical-bars-back-button-projection';
const toolbarProjectionClass = 'ios-theme-vertical-bars-toolbar-projection';
const readyClass = 'ios-theme-vertical-bars-toolbar-ready';
const toolbarControlSize = 48;
const toolbarItemGap = 4;
const toolbarControlGap = 12;
const toolbarGroupHeight = (count: number) => count * toolbarControlSize + Math.max(0, count - 1) * toolbarItemGap;

interface ToolbarProjection {
  source: HTMLElement;
  root: HTMLElement;
  projection: HTMLElement;
  actions: { source: HTMLElement; projection: HTMLElement; previousAriaHidden: string | null }[];
}

interface BackProjection {
  source: HTMLIonBackButtonElement;
  projection: HTMLIonBackButtonElement;
  root: HTMLElement;
  previousAriaHidden: string | null;
}

interface ToolbarSource {
  group: HTMLElement;
  actions: HTMLElement[];
}

export const createVerticalBarsWebProjection = (
  doc: Document,
  options: NativeUIOptions,
  enabled: () => boolean = () => true,
): NativeUIRuntimeHandle => {
  const win = doc.defaultView!;
  const crossfade = createCrossfade(win);
  let incomingInstant: boolean | undefined;
  const toolbarEnabled = options.ionic?.auto !== false;
  let root: HTMLElement | undefined;
  let backProjections: BackProjection[] = [];
  let toolbarProjections: ToolbarProjection[] = [];
  let suspended = 0;
  let stopped = false;
  let frame = 0;
  let updates = 0;
  let observingVerticalBars = false;
  const verticalBarsPages = createVerticalBarsPageState();
  let sourceObserver: MutationObserver | undefined;
  let waiters: (() => void)[] = [];
  const listeners = new AbortController();
  const verticalBarsRoot = () => doc.querySelector<HTMLElement>('ion-app.ios-theme-vertical-bars');
  const surfaceOf = (element: Element) => element.closest<HTMLElement>('ion-modal') ?? verticalBarsRoot()!;
  // Covered toolbar controls keep a Web visual on their own surface, below the modal.
  const isCovered = (element: Element) => !!topModal(doc) && surfaceOf(element) !== topModal(doc);
  const projectedSources = () =>
    [
      ...backProjections.map(({ source }) => source),
      search.source,
      ...toolbarProjections.flatMap(({ actions }) => actions.map(({ source }) => source)),
    ].filter((source): source is HTMLElement => !!source);
  const isRendered = (element: HTMLElement) =>
    withoutPrehide(element, () => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return element.isConnected && style.display !== 'none' && style.visibility === 'visible' && rect.width > 0 && rect.height > 0;
    });
  const search = createVerticalBarsWebSearch(
    doc,
    (element) =>
      options.ionic?.auto !== false &&
      controlSelected(element, options, 'tabs', true) &&
      !!verticalBarsRoot()?.contains(element) &&
      (!options.root || options.root.contains(element)) &&
      !element.closest('[data-native-ui-placement="element"]') &&
      inVerticalBarsSurface(element) &&
      !isExcluded(element, verticalBarsEnteringPage(element)) &&
      !isNativeUIDisabled(element) &&
      !verticalBarsPages.isDeparted(element) &&
      isRendered(element),
    () => {
      void schedule();
    },
  );
  const inEligibleToolbar = (element: HTMLElement) =>
    !!verticalBarsRoot()?.contains(element) &&
    (!options.root || options.root.contains(element)) &&
    !element.closest('[data-native-ui-placement="element"]') &&
    (inVerticalBarsSurface(element) || isCovered(element)) &&
    verticalBarsActionCandidate(element) &&
    !isExcluded(element, verticalBarsEnteringPage(element)) &&
    !verticalBarsPages.isDeparted(element);
  const isEligibleBack = (element: HTMLIonBackButtonElement) =>
    !!verticalBarsRoot()?.contains(element) &&
    (!options.root || options.root.contains(element)) &&
    !element.closest('[data-native-ui-placement="element"]') &&
    verticalBarsOwned(element) &&
    verticalBarsBackCandidate(element) &&
    !isExcluded(element, verticalBarsEnteringPage(element)) &&
    !verticalBarsPages.isDeparted(element) &&
    unprojected(projectedSources(), () => isRendered(element));
  const pageOrder = (element: Element) => Array.from(doc.querySelectorAll('.ion-page')).indexOf(element.closest('.ion-page')!);
  const findBack = (surface = topModal(doc) ?? verticalBarsRoot()) => {
    const candidates = Array.from(doc.querySelectorAll<HTMLIonBackButtonElement>(`ion-back-button:not(.${backProjectionClass})`)).filter(
      (element) => surfaceOf(element) === surface && isEligibleBack(element),
    );
    return preferredVerticalBarsBack(candidates, doc);
  };
  const findToolbarGroups = () => {
    const candidates = Array.from(doc.querySelectorAll<HTMLIonButtonsElement>(`ion-buttons:not(.${toolbarProjectionClass})`)).flatMap(
      (group): ToolbarSource[] => {
        const actions = verticalBarsToolbarActions(group).filter((action) => unprojected(projectedSources(), () => isRendered(action)));
        if (!actions.length) return [];
        if (!isVerticalBarsToolbarGroup(group)) return actions.filter(inEligibleToolbar).map((action) => ({ group, actions: [action] }));
        return inEligibleToolbar(group) && unprojected(projectedSources(), () => isRendered(group)) ? [{ group, actions }] : [];
      },
    );
    for (const action of Array.from(doc.querySelectorAll<HTMLElement>('ion-button, ion-menu-button'))) {
      if (action.closest('ion-buttons') || !verticalBarsOwned(action) || !inEligibleToolbar(action)) continue;
      if (unprojected(projectedSources(), () => isRendered(action))) candidates.push({ group: action, actions: [action] });
    }
    const highestPages = new Map<HTMLElement, number>();
    for (const { group } of candidates) {
      const surface = surfaceOf(group);
      highestPages.set(surface, Math.max(highestPages.get(surface) ?? -1, pageOrder(group)));
    }
    return candidates.filter(({ group }) => (enabled() || isCovered(group)) && pageOrder(group) === highestPages.get(surfaceOf(group)));
  };
  const isCurrentToolbarAction = (source: HTMLElement) =>
    inVerticalBarsSurface(source) && findToolbarGroups().some(({ actions }) => actions.includes(source));
  const restore = (retire?: (surface: HTMLElement) => void) => {
    search.restore(retire);
    for (const { source, projection, root: surface, previousAriaHidden } of backProjections) {
      surface.classList.remove(readyClass);
      if (retire) retire(projection);
      else projection.remove();
      source.removeAttribute(marker);
      if (previousAriaHidden === null) source.removeAttribute('aria-hidden');
      else source.setAttribute('aria-hidden', previousAriaHidden);
      source.dispatchEvent(new CustomEvent('nativeUIChange'));
    }
    backProjections = [];
    for (const { projection, actions, root: surface } of toolbarProjections) {
      surface.classList.remove(readyClass);
      if (retire) retire(projection);
      else projection.remove();
      for (const { source, previousAriaHidden } of actions) {
        source.removeAttribute(marker);
        if (previousAriaHidden === null) source.removeAttribute('aria-hidden');
        else source.setAttribute('aria-hidden', previousAriaHidden);
        source.dispatchEvent(new CustomEvent('nativeUIChange'));
      }
    }
    toolbarProjections = [];
    sourceObserver?.disconnect();
    sourceObserver = undefined;
    root?.classList.remove(readyClass);
    root = undefined;
  };
  const copyAttributes = (target: HTMLElement, original: HTMLElement) => {
    for (const name of ['id', 'slot', marker, 'aria-hidden']) target.removeAttribute(name);
    for (const attribute of Array.from(target.attributes))
      if (!['class', marker, fadeMarker].includes(attribute.name) && !original.hasAttribute(attribute.name))
        target.removeAttribute(attribute.name);
    for (const attribute of Array.from(original.attributes))
      if (!['id', 'slot', marker, 'aria-hidden'].includes(attribute.name)) target.setAttribute(attribute.name, attribute.value);
    target.classList.remove(prehiddenClass);
  };
  const syncBack = (target: HTMLIonBackButtonElement, original: HTMLIonBackButtonElement, surface: HTMLElement) => {
    copyAttributes(target, original);
    target.classList.add(backProjectionClass, 'ion-cloned-element');
    target.disabled = original.disabled;
    target.defaultHref = original.defaultHref;
    target.icon = original.icon;
    target.color = original.color;
    target.mode = original.mode;
    target.text = '';
    alignVerticalBarClone(target, original, surface);
  };
  const syncAction = (target: HTMLElement, original: HTMLElement) => {
    copyAttributes(target, original);
    target.classList.add('ios-theme-vertical-bars-toolbar-action', 'ion-cloned-element');
    const label =
      original.getAttribute('aria-label') ??
      original.shadowRoot?.querySelector('[part~=native]')?.getAttribute('aria-label') ??
      original.textContent?.trim();
    if (label) target.setAttribute('aria-label', label);
    if ('disabled' in original) (target as HTMLIonButtonElement).disabled = (original as HTMLIonButtonElement).disabled;
    if (original.matches('ion-button')) {
      const icon = original.querySelector<HTMLElement>('ion-icon, svg');
      const clonedIcon = icon?.cloneNode(true) as HTMLElement | undefined;
      clonedIcon?.setAttribute('slot', 'icon-only');
      target.replaceChildren(...(clonedIcon ? [clonedIcon] : [document.createTextNode(original.textContent?.trim() || label || '')]));
    }
  };
  const sameSources = (backs: HTMLIonBackButtonElement[], groups: ToolbarSource[]) =>
    backs.length === backProjections.length &&
    backs.every((source, index) => source === backProjections[index].source) &&
    groups.length === toolbarProjections.length &&
    groups.every(({ group, actions }, index) => {
      const current = toolbarProjections[index];
      return (
        group === current.source &&
        actions.length === current.actions.length &&
        actions.every((action, actionIndex) => action === current.actions[actionIndex].source)
      );
    });
  const syncExisting = () => {
    for (const { source, projection, root: surface } of backProjections) {
      syncBack(projection, source, surface);
      projection.inert = isCovered(source);
      if (projection.inert) projection.setAttribute('aria-hidden', 'true');
      surface.classList.add(readyClass);
    }
    const offsets = new Map<HTMLElement, number>();
    for (const { projection, source, actions, root: surface } of toolbarProjections) {
      const topOffset = offsets.get(surface) ?? (findBack(surface) ? toolbarControlSize + toolbarControlGap : 0);
      if (actions.length === 1 && !projection.matches('ion-buttons')) syncAction(projection, actions[0].source);
      else copyAttributes(projection, source);
      projection.classList.add(toolbarProjectionClass, 'ion-cloned-element');
      projection.style.setProperty('--ios-theme-vertical-bars-toolbar-offset', `${topOffset}px`);
      // Preserve appearance without bypassing the modal's input/focus boundary.
      projection.inert = isCovered(source);
      if (projection.inert) projection.setAttribute('aria-hidden', 'true');
      if (!surface.classList.contains(readyClass)) surface.classList.add(readyClass);
      if (projection.matches('ion-buttons')) actions.forEach(({ source: action, projection: clone }) => syncAction(clone, action));
      const frames = actions.map(({ source }) => verticalBarFrame(source));
      if (frames.every((frame) => !!frame)) {
        if (actions.length === 1) alignVerticalBarClone(projection, actions[0].source, surface);
        else {
          const left = Math.min(...frames.map((frame) => frame!.x));
          const top = Math.min(...frames.map((frame) => frame!.y));
          const right = Math.max(...frames.map((frame) => frame!.x + frame!.width));
          const bottom = Math.max(...frames.map((frame) => frame!.y + frame!.height));
          const origin = surface.getBoundingClientRect();
          Object.assign(projection.style, {
            left: `${left - origin.left}px`,
            top: `${top - origin.top}px`,
            right: 'auto',
            bottom: 'auto',
            width: `${right - left}px`,
            height: `${bottom - top}px`,
            padding: '0',
            boxSizing: 'border-box',
          });
          actions.forEach(({ source, projection: clone }) => alignVerticalBarClone(clone, source, projection));
        }
      }
      offsets.set(surface, topOffset + toolbarGroupHeight(actions.length) + toolbarControlGap);
    }
  };
  const project = (nextBacks: HTMLIonBackButtonElement[], groups: ToolbarSource[]) => {
    root = topModal(doc) ?? verticalBarsRoot()!;
    let topOffset = 0;
    for (const source of nextBacks) {
      const surface = surfaceOf(source);
      const previousAriaHidden = source.getAttribute('aria-hidden');
      const projection = source.cloneNode(false) as HTMLIonBackButtonElement;
      syncBack(projection, source, surface);
      projection.addEventListener(
        'click',
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (inVerticalBarsSurface(source) && source === findBack()) activateProjectedElement(source);
        },
        { capture: true },
      );
      surface.append(projection);
      backProjections.push({ source, projection, root: surface, previousAriaHidden });
      source.setAttribute(marker, '');
      source.setAttribute('aria-hidden', 'true');
      source.dispatchEvent(new CustomEvent('nativeUIChange'));
      if (surface === root) topOffset = toolbarControlSize + toolbarControlGap;
    }
    for (const { group, actions: sources } of groups) {
      const projection = (sources.length === 1 ? sources[0] : group).cloneNode(false) as HTMLElement;
      if (sources.length === 1) syncAction(projection, sources[0]);
      else copyAttributes(projection, group);
      projection.classList.add(toolbarProjectionClass, 'ion-cloned-element');
      projection.style.setProperty('--ios-theme-vertical-bars-toolbar-offset', `${topOffset}px`);
      const actions = sources.map((source) => {
        const clone = sources.length === 1 ? projection : (source.cloneNode(false) as HTMLElement);
        if (sources.length > 1) syncAction(clone, source);
        clone.addEventListener(
          'click',
          (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (isCurrentToolbarAction(source)) activateProjectedElement(source);
          },
          { capture: true },
        );
        if (sources.length > 1) projection.append(clone);
        const previousAriaHidden = source.getAttribute('aria-hidden');
        source.setAttribute(marker, '');
        source.setAttribute('aria-hidden', 'true');
        source.dispatchEvent(new CustomEvent('nativeUIChange'));
        return { source, projection: clone, previousAriaHidden };
      });
      const surface = surfaceOf(group);
      surface.append(projection);
      toolbarProjections.push({ source: group, root: surface, projection, actions });
      topOffset += toolbarGroupHeight(actions.length) + toolbarControlGap;
    }
    syncExisting();
    if (nextBacks.length || toolbarProjections.length) root.classList.add(readyClass);
    sourceObserver = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            record.type !== 'attributes' || (![marker, 'aria-hidden'].includes(record.attributeName ?? '') && !prehideOnlyMutation(record)),
        )
      )
        schedule();
    });
    for (const back of nextBacks)
      if (back.shadowRoot)
        sourceObserver.observe(back.shadowRoot, { subtree: true, childList: true, attributes: true, attributeOldValue: true });
    for (const { group } of groups)
      sourceObserver.observe(group, { subtree: true, childList: true, attributes: true, attributeOldValue: true });
  };
  const reveal = () => {
    if (incomingInstant === undefined) return;
    for (const surface of [
      ...backProjections.map(({ projection }) => projection),
      ...toolbarProjections.map(({ projection }) => projection),
      search.surface,
    ])
      if (surface) crossfade.play(surface, false, incomingInstant);
    incomingInstant = undefined;
  };
  const performUpdate = () => {
    frame = 0;
    syncToolbarText(doc);
    const currentRoot = verticalBarsRoot();
    if (observingVerticalBars !== !!currentRoot) {
      observingVerticalBars = !!currentRoot;
      observer.disconnect();
      observer.observe(doc.documentElement, {
        subtree: true,
        childList: true,
        characterData: observingVerticalBars,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: observingVerticalBars ? undefined : ['class'],
      });
    }
    if (stopped || suspended || options.verticalBars?.enabled === false || !currentRoot || (!enabled() && !topModal(doc))) return restore();
    const surfaces = new Set(
      Array.from(doc.querySelectorAll<HTMLIonBackButtonElement>(`ion-back-button:not(.${backProjectionClass})`)).map(surfaceOf),
    );
    const nextBacks = toolbarEnabled
      ? [...surfaces]
          .map((surface) => findBack(surface))
          .filter((back): back is HTMLIonBackButtonElement => !!back && (enabled() || isCovered(back)))
      : [];
    const groups = toolbarEnabled ? findToolbarGroups() : [];
    const projectionRoot = topModal(doc) ?? currentRoot;
    if (enabled()) search.update(projectionRoot);
    else search.restore();
    if (!nextBacks.length && !groups.length && !search.source) return restore();
    if (root === (topModal(doc) ?? currentRoot) && sameSources(nextBacks, groups)) {
      syncExisting();
      reveal();
      return;
    }
    restore();
    project(nextBacks, groups);
    if (enabled()) search.update(projectionRoot);
    else search.restore();
    reveal();
    updates++;
  };
  const update = () => {
    try {
      performUpdate();
    } catch {
      restore();
    } finally {
      const pending = waiters;
      waiters = [];
      pending.forEach((resolve) => resolve());
    }
  };
  const schedule = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    // Release Web ownership before the native runtime can acknowledge its next frame.
    if (!enabled() && !topModal(doc)) restore();
    const done = new Promise<void>((resolve) => waiters.push(resolve));
    if (!frame) frame = win.requestAnimationFrame(update);
    return done;
  };
  const observer = new MutationObserver((records) => {
    const insideProjection = (target: Node) => {
      const element = target instanceof Element ? target : target.parentNode instanceof Element ? target.parentNode : undefined;
      const rootNode = target.getRootNode();
      const shadowHost = rootNode instanceof ShadowRoot ? rootNode.host : undefined;
      return !![element, shadowHost].some((candidate) =>
        candidate?.closest(`.${backProjectionClass}, .${toolbarProjectionClass}, .${searchProjectionClass}`),
      );
    };
    const verticalBarsChanged = records.some(
      (record) =>
        (record.type === 'attributes' && (record.target as Element).matches('ion-app')) ||
        (record.type === 'childList' &&
          Array.from(record.addedNodes).some(
            (node) =>
              node instanceof Element &&
              (node.matches('ion-app.ios-theme-vertical-bars') || !!node.querySelector('ion-app.ios-theme-vertical-bars')),
          )),
    );
    if (
      (observingVerticalBars &&
        records.some(
          (record) =>
            record.attributeName !== marker &&
            record.attributeName !== toolbarTextMarker &&
            !prehideOnlyMutation(record) &&
            !insideProjection(record.target),
        )) ||
      (!observingVerticalBars && verticalBarsChanged && records.some((record) => !prehideOnlyMutation(record)))
    )
      schedule();
  });
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['class'],
  });
  const pageLifecycle = (event: Event) => {
    const page = event.target;
    if (!(page instanceof HTMLElement) || !page.matches('.ion-page')) return;
    if (event.type === VERTICAL_BARS_TRANSITION_CANCELED) {
      const entering = (event as CustomEvent<{ entering?: HTMLElement }>).detail?.entering;
      verticalBarsPages.cancel(entering, page);
    } else verticalBarsPages.lifecycle(event);
    if (verticalBarsRoot()) schedule();
  };
  for (const name of ['ionViewWillEnter', 'ionViewWillLeave', 'ionViewDidEnter', 'ionViewDidLeave'])
    doc.addEventListener(name, pageLifecycle, { capture: true, signal: listeners.signal });
  doc.addEventListener(VERTICAL_BARS_TRANSITION_CANCELED, pageLifecycle, { capture: true, signal: listeners.signal });
  for (const name of ['ionModalWillPresent', 'ionModalDidDismiss'])
    doc.addEventListener(name, schedule, { capture: true, signal: listeners.signal });
  win.addEventListener(
    'nativeUIVerticalBarsAcquire',
    (event) => {
      const instant = (event as CustomEvent<{ instant: boolean }>).detail?.instant ?? true;
      incomingInstant = undefined;
      if (topModal(doc) && toolbarProjections.some(({ source }) => isCovered(source))) {
        void schedule();
        return;
      }
      restore((surface) => {
        // Keep only the outgoing visual at its last rectangle after Web ownership
        // is released. The native acknowledgement transfers input exactly once.
        const box = surface.getBoundingClientRect();
        surface.style.setProperty('position', 'fixed', 'important');
        surface.style.setProperty('display', 'block', 'important');
        surface.style.setProperty('left', `${box.left}px`, 'important');
        surface.style.setProperty('top', `${box.top}px`, 'important');
        surface.style.setProperty('right', 'auto', 'important');
        surface.style.setProperty('bottom', 'auto', 'important');
        surface.style.setProperty('width', `${box.width}px`, 'important');
        surface.style.setProperty('height', `${box.height}px`, 'important');
        crossfade.retire(surface, instant);
      });
    },
    { signal: listeners.signal },
  );
  win.addEventListener(
    'nativeUIVerticalBarsRelease',
    (event) => {
      incomingInstant = (event as CustomEvent<{ instant: boolean }>).detail.instant;
      void schedule();
    },
    { signal: listeners.signal },
  );
  win.addEventListener('resize', schedule, { signal: listeners.signal });
  win.addEventListener('nativeUIRefresh', schedule, { signal: listeners.signal });
  schedule();

  return {
    markForCheck: () => {
      void schedule();
    },
    getStatus: (): NativeUIStatus => ({
      state: stopped ? 'stopped' : 'web',
      projected:
        backProjections.length + Number(!!search.source) + toolbarProjections.reduce((count, group) => count + group.actions.length, 0),
      updates,
    }),
    async suspend() {
      suspended++;
      restore();
      let resumed = false;
      return {
        async resume() {
          if (resumed) return;
          resumed = true;
          suspended = Math.max(0, suspended - 1);
          if (!suspended) await schedule();
        },
      };
    },
    async destroy() {
      if (stopped) return;
      stopped = true;
      win.cancelAnimationFrame(frame);
      frame = 0;
      waiters.forEach((resolve) => resolve());
      waiters = [];
      observer.disconnect();
      sourceObserver?.disconnect();
      listeners.abort();
      crossfade.destroy();
      restore();
    },
  };
};
