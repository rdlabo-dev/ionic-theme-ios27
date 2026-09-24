import type { NativeUIShellHandle, NativeUIShellOptions, NativeUIShellStatus } from './definitions';
import { VERTICAL_BARS_TRANSITION_CANCELED } from '../native-integration';
import {
  activateProjectedElement,
  createVerticalBarsPageState,
  verticalBarsEnteringPage,
  verticalBarsToolbarActions,
  isExcluded,
  isVerticalBarsToolbarGroup,
  isShellDisabled,
  isVerticalBarsBackPosition,
  preferredVerticalBarsBack,
  verticalBarsOwned,
  marker,
  prehideOnlyMutation,
  prehiddenClass,
  unprojected,
  withoutPrehide,
} from './shared/dom';

const backProjectionClass = 'ios-theme-vertical-bars-back-button-projection';
const toolbarProjectionClass = 'ios-theme-vertical-bars-toolbar-projection';
const readyClass = 'ios-theme-vertical-bars-toolbar-ready';
const toolbarControlSize = 46;
const toolbarControlGap = 10;

interface ToolbarProjection {
  source: HTMLIonButtonsElement;
  projection: HTMLElement;
  actions: { source: HTMLElement; projection: HTMLElement; previousAriaHidden: string | null }[];
}

interface ToolbarSource {
  group: HTMLIonButtonsElement;
  actions: HTMLElement[];
}

export const createVerticalBarsWebProjection = (
  doc: Document,
  options: NativeUIShellOptions,
  enabled: () => boolean = () => true,
): NativeUIShellHandle => {
  const win = doc.defaultView!;
  if (options.controls !== undefined && options.controls.toolbar !== true)
    return {
      getStatus: () => ({ state: 'web', projected: 0, updates: 0 }),
      suspend: async () => ({ resume: async () => {} }),
      destroy: async () => {},
    };
  let root: HTMLElement | undefined;
  let backSource: HTMLIonBackButtonElement | undefined;
  let backProjection: HTMLIonBackButtonElement | undefined;
  let previousBackAriaHidden: string | null = null;
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
  const verticalBarsRoot = () => doc.querySelector<HTMLElement>(':is(ion-app, body).ios-theme-vertical-bars');
  const projectedSources = () =>
    [backSource, ...toolbarProjections.flatMap(({ actions }) => actions.map(({ source }) => source))].filter(
      (source): source is HTMLElement => !!source,
    );
  const isRendered = (element: HTMLElement) =>
    withoutPrehide(element, () => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return element.isConnected && style.display !== 'none' && style.visibility === 'visible' && rect.width > 0 && rect.height > 0;
    });
  const inEligibleToolbar = (element: HTMLElement) => {
    const currentRoot = verticalBarsRoot();
    const toolbar = element.closest('ion-toolbar');
    const edge = toolbar?.parentElement;
    return (
      !!currentRoot?.contains(element) &&
      !!toolbar &&
      !!edge?.matches('ion-header, ion-footer') &&
      !element.closest('ion-content') &&
      !edge.hasAttribute('collapse') &&
      !isExcluded(element, verticalBarsEnteringPage(element)) &&
      !isShellDisabled(element) &&
      !verticalBarsPages.isDeparted(element) &&
      !element.closest('ion-menu, ion-modal, ion-popover, .ion-page-hidden')
    );
  };
  const isEligibleBack = (element: HTMLIonBackButtonElement) =>
    !!verticalBarsRoot()?.contains(element) &&
    verticalBarsOwned(element) &&
    isVerticalBarsBackPosition(element) &&
    !element.closest('ion-buttons.ios-theme-horizontal-only') &&
    !isExcluded(element, verticalBarsEnteringPage(element)) &&
    !isShellDisabled(element) &&
    !verticalBarsPages.isDeparted(element) &&
    !element.closest('ion-menu, ion-modal, ion-popover') &&
    unprojected(projectedSources(), () => isRendered(element));
  const pageOrder = (element: Element) => Array.from(doc.querySelectorAll('.ion-page')).indexOf(element.closest('.ion-page')!);
  const findBack = () => {
    const candidates = Array.from(doc.querySelectorAll<HTMLIonBackButtonElement>(`ion-back-button:not(.${backProjectionClass})`)).filter(
      isEligibleBack,
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
    const highestPage = Math.max(...candidates.map(({ group }) => pageOrder(group)));
    return candidates.filter(({ group }) => pageOrder(group) === highestPage);
  };
  const isCurrentToolbarAction = (source: HTMLElement) => findToolbarGroups().some(({ actions }) => actions.includes(source));
  const restore = () => {
    backProjection?.remove();
    backProjection = undefined;
    if (backSource) {
      backSource.removeAttribute(marker);
      if (previousBackAriaHidden === null) backSource.removeAttribute('aria-hidden');
      else backSource.setAttribute('aria-hidden', previousBackAriaHidden);
      backSource.dispatchEvent(new CustomEvent('nativeUIShellChange'));
    }
    backSource = undefined;
    previousBackAriaHidden = null;
    for (const { projection, actions } of toolbarProjections) {
      projection.remove();
      for (const { source, previousAriaHidden } of actions) {
        source.removeAttribute(marker);
        if (previousAriaHidden === null) source.removeAttribute('aria-hidden');
        else source.setAttribute('aria-hidden', previousAriaHidden);
        source.dispatchEvent(new CustomEvent('nativeUIShellChange'));
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
      if (!['class', marker].includes(attribute.name) && !original.hasAttribute(attribute.name)) target.removeAttribute(attribute.name);
    for (const attribute of Array.from(original.attributes))
      if (!['id', 'slot', marker, 'aria-hidden'].includes(attribute.name)) target.setAttribute(attribute.name, attribute.value);
    target.classList.remove(prehiddenClass);
  };
  const syncBack = (target: HTMLIonBackButtonElement, original: HTMLIonBackButtonElement) => {
    copyAttributes(target, original);
    target.classList.add(backProjectionClass, 'ion-cloned-element');
    target.disabled = original.disabled;
    target.defaultHref = original.defaultHref;
    target.icon = original.icon;
    target.color = original.color;
    target.mode = original.mode;
    target.text = '';
  };
  const syncAction = (target: HTMLElement, original: HTMLElement) => {
    copyAttributes(target, original);
    target.classList.add('ios-theme-vertical-bars-toolbar-action', 'ion-cloned-element');
    const label = original.getAttribute('aria-label') ?? original.textContent?.trim();
    if (label) target.setAttribute('aria-label', label);
    if ('disabled' in original) (target as HTMLIonButtonElement).disabled = (original as HTMLIonButtonElement).disabled;
    if (original.matches('ion-button')) {
      const icon = original.querySelector<HTMLElement>('ion-icon, svg');
      const clonedIcon = icon?.cloneNode(true) as HTMLElement | undefined;
      clonedIcon?.setAttribute('slot', 'icon-only');
      target.replaceChildren(...(clonedIcon ? [clonedIcon] : []));
    }
  };
  const sameSources = (back: HTMLIonBackButtonElement | undefined, groups: ToolbarSource[]) =>
    back === backSource &&
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
    if (backSource && backProjection) syncBack(backProjection, backSource);
    let topOffset = backSource ? toolbarControlSize + toolbarControlGap : 0;
    for (const { projection, source, actions } of toolbarProjections) {
      if (actions.length === 1 && !projection.matches('ion-buttons')) syncAction(projection, actions[0].source);
      else copyAttributes(projection, source);
      projection.classList.add(toolbarProjectionClass, 'ion-cloned-element');
      projection.style.setProperty('--ios-theme-vertical-bars-toolbar-offset', `${topOffset}px`);
      if (projection.matches('ion-buttons')) actions.forEach(({ source: action, projection: clone }) => syncAction(clone, action));
      topOffset += actions.length * toolbarControlSize + toolbarControlGap;
    }
  };
  const project = (nextBack: HTMLIonBackButtonElement | undefined, groups: ToolbarSource[]) => {
    root = verticalBarsRoot()!;
    let topOffset = 0;
    if (nextBack) {
      backSource = nextBack;
      previousBackAriaHidden = nextBack.getAttribute('aria-hidden');
      backProjection = nextBack.cloneNode(false) as HTMLIonBackButtonElement;
      syncBack(backProjection, nextBack);
      backProjection.addEventListener(
        'click',
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (backSource && backSource === findBack()) activateProjectedElement(backSource);
        },
        { capture: true },
      );
      root.append(backProjection);
      nextBack.setAttribute(marker, '');
      nextBack.setAttribute('aria-hidden', 'true');
      nextBack.dispatchEvent(new CustomEvent('nativeUIShellChange'));
      topOffset = toolbarControlSize + toolbarControlGap;
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
        source.dispatchEvent(new CustomEvent('nativeUIShellChange'));
        return { source, projection: clone, previousAriaHidden };
      });
      root.append(projection);
      toolbarProjections.push({ source: group, projection, actions });
      topOffset += actions.length * toolbarControlSize + toolbarControlGap;
    }
    if (nextBack || toolbarProjections.length) root.classList.add(readyClass);
    sourceObserver = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            record.type !== 'attributes' || (![marker, 'aria-hidden'].includes(record.attributeName ?? '') && !prehideOnlyMutation(record)),
        )
      )
        schedule();
    });
    if (nextBack?.shadowRoot)
      sourceObserver.observe(nextBack.shadowRoot, { subtree: true, childList: true, attributes: true, attributeOldValue: true });
    for (const { group } of groups)
      sourceObserver.observe(group, { subtree: true, childList: true, attributes: true, attributeOldValue: true });
  };
  const performUpdate = () => {
    frame = 0;
    const currentRoot = verticalBarsRoot();
    if (observingVerticalBars !== !!currentRoot) {
      observingVerticalBars = !!currentRoot;
      observer.disconnect();
      observer.observe(doc.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: observingVerticalBars ? undefined : ['class'],
      });
    }
    if (stopped || suspended || !currentRoot || !enabled()) return restore();
    const nextBack = findBack();
    const groups = findToolbarGroups();
    if (!nextBack && !groups.length) return restore();
    if (sameSources(nextBack, groups)) return syncExisting();
    restore();
    project(nextBack, groups);
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
    const done = new Promise<void>((resolve) => waiters.push(resolve));
    if (!frame) frame = win.requestAnimationFrame(update);
    return done;
  };
  const observer = new MutationObserver((records) => {
    const insideProjection = (target: Node) => {
      const element = target instanceof Element ? target : target.parentNode instanceof Element ? target.parentNode : undefined;
      const rootNode = target.getRootNode();
      const shadowHost = rootNode instanceof ShadowRoot ? rootNode.host : undefined;
      return !![element, shadowHost].some((candidate) => candidate?.closest(`.${backProjectionClass}, .${toolbarProjectionClass}`));
    };
    const verticalBarsChanged = records.some(
      (record) =>
        (record.type === 'attributes' && (record.target as Element).matches('ion-app, body')) ||
        (record.type === 'childList' &&
          Array.from(record.addedNodes).some(
            (node) =>
              node instanceof Element &&
              (node.matches(':is(ion-app, body).ios-theme-vertical-bars') ||
                !!node.querySelector(':is(ion-app, body).ios-theme-vertical-bars')),
          )),
    );
    if (
      (observingVerticalBars &&
        records.some((record) => record.attributeName !== marker && !prehideOnlyMutation(record) && !insideProjection(record.target))) ||
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
  win.addEventListener('nativeUIShellRefresh', schedule, { signal: listeners.signal });
  if (options.controls === undefined || options.controls.toolbar === true) schedule();

  return {
    getStatus: (): NativeUIShellStatus => ({
      state: 'web',
      projected: Number(!!backSource) + toolbarProjections.reduce((count, group) => count + group.actions.length, 0),
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
      restore();
    },
  };
};
