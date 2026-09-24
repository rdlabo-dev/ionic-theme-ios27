import { LIFECYCLE_DID_LEAVE, LIFECYCLE_WILL_ENTER } from '@ionic/core';
import {
  clearVerticalBarsPlacement,
  verticalBarsBackWebClass,
  verticalBarsOwned,
  inFixedToolbar,
  isVerticalBarsToolbarActionShape,
  isPermanentlyExcluded,
  isShellDisabled,
  prehiddenClass,
  prehideRootClass,
  rejectedClass,
  setVerticalBarsPlacement,
} from './shared/dom';

const overlays = 'ion-menu, ion-modal, ion-popover';
const sourceSelector = 'ion-back-button, ion-menu-button, ion-buttons, ion-button';
const backSupported = (element: HTMLElement): boolean => {
  const back = element as HTMLIonBackButtonElement;
  return back.icon === undefined && back.color === undefined && !!back.shadowRoot;
};
const eligibleBack = (element: HTMLElement): boolean =>
  !element.closest('ion-buttons.ios-theme-horizontal-only') &&
  !isPermanentlyExcluded(element) &&
  !isShellDisabled(element) &&
  !element.closest(overlays);
const eligible = (element: HTMLElement): boolean =>
  inFixedToolbar(element) &&
  !element.closest('ion-buttons.ios-theme-horizontal-only, ion-button.ios-theme-horizontal-only') &&
  !isPermanentlyExcluded(element) &&
  !isShellDisabled(element) &&
  !element.closest(overlays);

/** Capture toolbar placement once per routed-page epoch, before Ionic paints its transition. */
export const prehideVerticalBarsToolbarSources = (doc: Document): { suspend: () => () => void; stop: () => void } => {
  doc.documentElement.classList.add(prehideRootClass);
  const scopes = new Map<HTMLElement, Set<HTMLElement>>();
  const pendingBacks = new Map<HTMLElement, { scope: HTMLElement; timer: ReturnType<typeof setTimeout> }>();
  const listeners = new AbortController();
  const root = () => doc.querySelector<HTMLElement>(':is(ion-app, body).ios-theme-vertical-bars');
  let suspended = 0;
  let stopped = false;
  const routedPage = (element: HTMLElement) => element.closest<HTMLElement>('.ion-page:not(ion-app, body)');
  const release = (scope: HTMLElement) => {
    for (const [element, pending] of pendingBacks) {
      if (pending.scope !== scope) continue;
      clearTimeout(pending.timer);
      pendingBacks.delete(element);
    }
    const owned = scopes.get(scope);
    if (!owned) return;
    owned.forEach((element) => {
      element.classList.remove(prehiddenClass);
      element.classList.remove(verticalBarsBackWebClass);
      clearVerticalBarsPlacement(element);
    });
    scopes.delete(scope);
  };
  const capture = (scope: HTMLElement) => {
    if (!root()?.contains(scope) || scope.closest(overlays)) return;
    const owned = scopes.get(scope) ?? new Set<HTMLElement>();
    const place = (element: HTMLElement, rail: boolean) => {
      if (owned.has(element)) return;
      setVerticalBarsPlacement(element, rail);
      if (element.matches('ion-back-button')) element.classList.toggle(verticalBarsBackWebClass, !rail);
      owned.add(element);
    };
    scope.querySelectorAll<HTMLElement>(sourceSelector).forEach((element) => {
      if (element.closest(overlays) || (scope.matches('.ion-page') && routedPage(element) !== scope)) return;
      if (element.matches('ion-buttons')) {
        const children = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
        const actions = children.filter((child) => eligible(child) && isVerticalBarsToolbarActionShape(child));
        const group =
          eligible(element) &&
          actions.length === children.length &&
          (actions.length > 1 || (actions.length === 1 && actions[0].matches('ion-menu-button')));
        const freshGroup = !owned.has(element);
        place(element, group);
        children.forEach((child) => {
          if (!child.matches('ion-back-button')) place(child, freshGroup && actions.includes(child));
        });
      } else if (element.matches('ion-back-button') || !element.parentElement?.matches('ion-buttons')) {
        if (owned.has(element)) return;
        if (
          element.matches('ion-back-button') &&
          eligibleBack(element) &&
          (element as HTMLIonBackButtonElement).icon === undefined &&
          (element as HTMLIonBackButtonElement).color === undefined &&
          !element.shadowRoot &&
          !element.classList.contains('hydrated')
        ) {
          if (!pendingBacks.has(element)) {
            const timer = setTimeout(() => {
              if (pendingBacks.get(element)?.scope !== scope) return;
              pendingBacks.delete(element);
              // A custom element that never hydrates must remain usable on Web.
              place(element, false);
              reconcile();
            }, 1500);
            pendingBacks.set(element, { scope, timer });
          }
          return;
        }
        const pending = pendingBacks.get(element);
        if (pending) {
          clearTimeout(pending.timer);
          pendingBacks.delete(element);
        }
        place(
          element,
          element.matches('ion-back-button')
            ? eligibleBack(element) && backSupported(element)
            : eligible(element) && isVerticalBarsToolbarActionShape(element),
        );
      }
    });
    scopes.set(scope, owned);
  };
  const reconcile = () => {
    const verticalBars = root();
    if (!verticalBars) {
      Array.from(scopes.keys()).forEach(release);
      return;
    }
    for (const scope of scopes.keys()) if (!scope.isConnected) release(scope);
    for (const [element, pending] of pendingBacks) if (element.shadowRoot || element.classList.contains('hydrated')) capture(pending.scope);
    // Ionic inserts the destination as invisible before WillEnter. Hide its
    // sources in that same mutation microtask; capture new DOM identities on active pages too.
    verticalBars.querySelectorAll<HTMLElement>('.ion-page:not(ion-app, body, .ion-page-hidden)').forEach(capture);
    // Root toolbars can mount after startup; each new DOM identity is captured once.
    verticalBars.querySelectorAll<HTMLElement>(sourceSelector).forEach((element) => {
      if (routedPage(element) || element.closest(overlays)) return;
      const scope = element.closest<HTMLElement>('ion-toolbar');
      if (scope) capture(scope);
    });
    for (const owned of scopes.values()) {
      for (const element of owned) {
        const groupOwnsChildren =
          element.parentElement?.matches('ion-buttons') &&
          verticalBarsOwned(element.parentElement) &&
          Array.from(element.parentElement.children).every((child) => child instanceof HTMLElement && verticalBarsOwned(child));
        const hide =
          !suspended &&
          verticalBarsOwned(element) &&
          !groupOwnsChildren &&
          element.isConnected &&
          !element.closest(`.${rejectedClass}`) &&
          !isPermanentlyExcluded(element) &&
          !isShellDisabled(element) &&
          (!element.matches('ion-back-button') || backSupported(element) || !element.classList.contains('hydrated')) &&
          (!element.matches('ion-buttons') ||
            Array.from(element.children).every((child) => child instanceof HTMLElement && verticalBarsOwned(child)));
        element.classList.toggle(prehiddenClass, hide);
        if (element.matches('ion-back-button')) element.classList.toggle(verticalBarsBackWebClass, !hide);
      }
    }
  };
  const onWillEnter = (event: Event) => {
    const page = event.target;
    if (page instanceof HTMLElement && page.matches('.ion-page')) {
      release(page); // Cached pages begin a new placement epoch.
      capture(page);
      reconcile();
    }
  };
  const onDidLeave = (event: Event) => {
    const page = event.target;
    if (page instanceof HTMLElement) release(page);
  };
  doc.addEventListener(LIFECYCLE_WILL_ENTER, onWillEnter, { capture: true, signal: listeners.signal });
  doc.addEventListener(LIFECYCLE_DID_LEAVE, onDidLeave, { capture: true, signal: listeners.signal });
  reconcile();
  const mutationRelevant = (record: MutationRecord) => {
    if (record.type === 'childList')
      return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(
        (node) =>
          node instanceof Element &&
          (node.matches(`${sourceSelector}, .ion-page, ion-toolbar`) || !!node.querySelector(`${sourceSelector}, .ion-page, ion-toolbar`)),
      );
    if (record.attributeName !== 'class') return true;
    const current = (record.target as Element).className;
    const previous = record.oldValue ?? '';
    const withoutOwned = (value: string) =>
      value
        .split(/\s+/)
        .filter((name) => name && ![prehiddenClass, prehideRootClass, verticalBarsBackWebClass].includes(name))
        .join(' ');
    return typeof current !== 'string' || withoutOwned(previous) !== withoutOwned(current);
  };
  let scheduled = false;
  const observer = new (doc.defaultView?.MutationObserver ?? MutationObserver)((records) => {
    if (scheduled || !records.some(mutationRelevant)) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      reconcile();
    });
  });
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['class', 'hidden', 'inert', 'icon', 'color'],
  });
  return {
    suspend: () => {
      if (stopped) return () => {};
      suspended++;
      doc.documentElement.classList.remove(prehideRootClass);
      reconcile();
      let resumed = false;
      return () => {
        if (resumed || stopped) return;
        resumed = true;
        if (--suspended === 0) {
          doc.documentElement.classList.add(prehideRootClass);
          reconcile();
        }
      };
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      observer.disconnect();
      listeners.abort();
      doc.documentElement.classList.remove(prehideRootClass);
      Array.from(scopes.keys()).forEach(release);
    },
  };
};
