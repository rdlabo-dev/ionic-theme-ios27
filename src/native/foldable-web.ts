import type { NativeUIShellHandle, NativeUIShellOptions, NativeUIShellStatus } from './definitions';
import { excluded, isShellDisabled, marker, unprojected } from './shared/dom';

const backProjectionClass = 'ios-theme-foldable-back-button-projection';
const toolbarProjectionClass = 'ios-theme-foldable-toolbar-projection';
const readyClass = 'ios-theme-foldable-toolbar-ready';
const toolbarControlSize = 68;
const toolbarControlGap = 16;

interface ToolbarProjection {
  source: HTMLIonButtonsElement;
  projection: HTMLIonButtonsElement;
  actions: { source: HTMLElement; projection: HTMLElement; previousAriaHidden: string | null }[];
}

export const createFoldableWebProjection = (doc: Document, options: NativeUIShellOptions): NativeUIShellHandle => {
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
  let observingFoldable = false;
  let sourceObserver: MutationObserver | undefined;
  let waiters: (() => void)[] = [];
  const listeners = new AbortController();
  const foldableRoot = () => doc.querySelector<HTMLElement>(':is(ion-app, body).ios-theme-enable-foldable');
  const projectedSources = () =>
    [backSource, ...toolbarProjections.flatMap(({ actions }) => actions.map(({ source }) => source))].filter(
      (source): source is HTMLElement => !!source,
    );
  const isRendered = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return element.isConnected && style.display !== 'none' && style.visibility === 'visible' && rect.width > 0 && rect.height > 0;
  };
  const inEligibleToolbar = (element: HTMLElement) => {
    const currentRoot = foldableRoot();
    const toolbar = element.closest('ion-toolbar');
    const edge = toolbar?.parentElement;
    return (
      !!currentRoot?.contains(element) &&
      element.matches('.ios') &&
      !!toolbar?.matches('.ios') &&
      !!edge?.matches('ion-header, ion-footer') &&
      !element.closest('ion-content') &&
      !edge.hasAttribute('collapse') &&
      !element.closest(excluded) &&
      !isShellDisabled(element) &&
      !element.closest('ion-menu, ion-modal, ion-popover, .ion-page-hidden, .ion-page-invisible')
    );
  };
  const isEligibleBack = (element: HTMLIonBackButtonElement) =>
    inEligibleToolbar(element) && unprojected(projectedSources(), () => isRendered(element));
  const isToolbarAction = (element: HTMLElement) => {
    if (!element.matches('ion-button.ios, ion-menu-button.ios') || element.closest(excluded) || isShellDisabled(element)) return false;
    if (element.matches('ion-menu-button')) return true;
    return !!element.querySelector('ion-icon, svg');
  };
  const toolbarActions = (element: HTMLIonButtonsElement) =>
    Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement && isToolbarAction(child));
  const pageOrder = (element: Element) => Array.from(doc.querySelectorAll('.ion-page')).indexOf(element.closest('.ion-page')!);
  const findBack = () => {
    const candidates = Array.from(doc.querySelectorAll<HTMLIonBackButtonElement>(`ion-back-button:not(.${backProjectionClass})`)).filter(
      isEligibleBack,
    );
    return candidates.sort((a, b) => {
      const order = pageOrder(b) - pageOrder(a);
      if (order) return order;
      return Number(!!b.closest('ion-header')) - Number(!!a.closest('ion-header'));
    })[0];
  };
  const findToolbarGroups = () => {
    const candidates = Array.from(doc.querySelectorAll<HTMLIonButtonsElement>(`ion-buttons.ios:not(.${toolbarProjectionClass})`)).filter(
      (group) =>
        inEligibleToolbar(group) &&
        unprojected(projectedSources(), () => isRendered(group) && toolbarActions(group).some((action) => isRendered(action))),
    );
    const highestPage = Math.max(...candidates.map(pageOrder));
    return candidates.filter((candidate) => pageOrder(candidate) === highestPage);
  };
  const isCurrentToolbarAction = (source: HTMLElement) => findToolbarGroups().some((group) => toolbarActions(group).includes(source));
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
    target.classList.add('ios-theme-foldable-toolbar-action', 'ion-cloned-element');
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
  const sameSources = (back: HTMLIonBackButtonElement | undefined, groups: HTMLIonButtonsElement[]) =>
    back === backSource &&
    groups.length === toolbarProjections.length &&
    groups.every((group, index) => {
      const current = toolbarProjections[index];
      const actions = toolbarActions(group);
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
      copyAttributes(projection, source);
      projection.classList.add(toolbarProjectionClass, 'ion-cloned-element');
      projection.style.setProperty('--ios-theme-foldable-toolbar-offset', `${topOffset}px`);
      actions.forEach(({ source: action, projection: clone }) => syncAction(clone, action));
      topOffset += actions.length * toolbarControlSize + toolbarControlGap;
    }
  };
  const project = (nextBack: HTMLIonBackButtonElement | undefined, groups: HTMLIonButtonsElement[]) => {
    root = foldableRoot()!;
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
          if (backSource && backSource === findBack()) backSource.click();
        },
        { capture: true },
      );
      root.append(backProjection);
      nextBack.setAttribute(marker, '');
      nextBack.setAttribute('aria-hidden', 'true');
      nextBack.dispatchEvent(new CustomEvent('nativeUIShellChange'));
      topOffset = toolbarControlSize + toolbarControlGap;
    }
    for (const group of groups) {
      const projection = group.cloneNode(false) as HTMLIonButtonsElement;
      copyAttributes(projection, group);
      projection.classList.add(toolbarProjectionClass, 'ion-cloned-element');
      projection.style.setProperty('--ios-theme-foldable-toolbar-offset', `${topOffset}px`);
      const actions = toolbarActions(group).map((source) => {
        const clone = source.cloneNode(false) as HTMLElement;
        syncAction(clone, source);
        clone.addEventListener(
          'click',
          (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (isCurrentToolbarAction(source)) source.click();
          },
          { capture: true },
        );
        projection.append(clone);
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
    sourceObserver = new MutationObserver(schedule);
    if (nextBack?.shadowRoot) sourceObserver.observe(nextBack.shadowRoot, { subtree: true, childList: true, attributes: true });
    for (const group of groups) sourceObserver.observe(group, { subtree: true, childList: true, attributes: true });
  };
  const performUpdate = () => {
    frame = 0;
    const currentRoot = foldableRoot();
    if (observingFoldable !== !!currentRoot) {
      observingFoldable = !!currentRoot;
      observer.disconnect();
      observer.observe(doc.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: observingFoldable ? undefined : ['class'],
      });
    }
    if (stopped || suspended || !currentRoot) return restore();
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
    const foldableChanged = records.some(
      (record) =>
        (record.type === 'attributes' && (record.target as Element).matches('ion-app, body')) ||
        (record.type === 'childList' &&
          Array.from(record.addedNodes).some(
            (node) =>
              node instanceof Element &&
              (node.matches(':is(ion-app, body).ios-theme-enable-foldable') ||
                !!node.querySelector(':is(ion-app, body).ios-theme-enable-foldable')),
          )),
    );
    if (
      (observingFoldable && records.some((record) => record.attributeName !== marker && !insideProjection(record.target))) ||
      (!observingFoldable && foldableChanged)
    )
      schedule();
  });
  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  for (const name of ['ionViewDidEnter', 'ionViewDidLeave', 'ionModalWillPresent', 'ionModalDidDismiss'])
    doc.addEventListener(name, schedule, { capture: true, signal: listeners.signal });
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
