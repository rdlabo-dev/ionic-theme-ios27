import { foldableToolbarActions, inFixedToolbar, isExcluded, isFoldableToolbarAction, isShellDisabled, prehiddenClass } from './shared/dom';
const overlays = 'ion-menu, ion-modal, ion-popover';

const eligibleContainer = (element: HTMLElement): boolean =>
  element.matches('.ios') && inFixedToolbar(element) && !isExcluded(element) && !isShellDisabled(element) && !element.closest(overlays);

export const prehideFoldableToolbarSources = (doc: Document): (() => void) => {
  const prehidden = new Set<HTMLElement>();
  const scan = () => {
    const next = new Set<HTMLElement>();
    const root = doc.querySelector<HTMLElement>(':is(ion-app, body).ios-theme-enable-foldable');
    if (root) {
      root.querySelectorAll<HTMLElement>('ion-back-button').forEach((back) => {
        if (eligibleContainer(back)) next.add(back);
      });
      root.querySelectorAll<HTMLElement>('ion-buttons').forEach((group) => {
        if (eligibleContainer(group)) {
          const actions = foldableToolbarActions(group);
          if (actions.length > 0 && actions.length === group.children.length) next.add(group);
          else actions.filter(eligibleContainer).forEach((action) => next.add(action));
        }
      });
      root.querySelectorAll<HTMLElement>('ion-button').forEach((button) => {
        if (!button.parentElement?.matches('ion-buttons') && isFoldableToolbarAction(button) && eligibleContainer(button)) next.add(button);
      });
    }
    prehidden.forEach((element) => {
      if (!next.has(element)) element.classList.remove(prehiddenClass);
    });
    next.forEach((element) => {
      if (!element.classList.contains(prehiddenClass)) element.classList.add(prehiddenClass);
    });
    prehidden.clear();
    next.forEach((element) => prehidden.add(element));
  };
  scan();
  const observer = new (doc.defaultView?.MutationObserver ?? MutationObserver)(scan);
  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true });
  return () => {
    observer.disconnect();
    prehidden.forEach((element) => element.classList.remove(prehiddenClass));
    prehidden.clear();
  };
};
