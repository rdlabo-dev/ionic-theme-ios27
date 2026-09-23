import { fadeMarker } from './crossfade';

import type { Frame } from '../definitions';

export const marker = 'data-native-ui-shell';
export const prehiddenClass = 'ios-theme-native-ui-shell-prehidden';
export const prehideRootClass = 'ios-theme-native-ui-shell-prehide';
export const rejectedClass = 'ios-theme-native-ui-shell-rejected';
export const foldableBackWebClass = 'ios-theme-foldable-back-web-owned';
export const isDark = (style: CSSStyleDeclaration): boolean => style.getPropertyValue('--ios27-color-scheme').trim() === 'dark';
const permanentlyExcluded = '.ionic-theme-disabled, .ios-theme-disabled, .ios26-disabled, .ion-cloned-element, [hidden], [inert]';
export const excluded = `${permanentlyExcluded}, .ion-page-hidden, .ion-page-invisible`;
const enteringPages = new WeakSet<HTMLElement>();
export const setFoldableEnteringPage = (page: HTMLElement, entering: boolean): void => {
  if (entering) enteringPages.add(page);
  else enteringPages.delete(page);
};
export const foldableEnteringPage = (element: HTMLElement): HTMLElement | undefined => {
  const page = element.closest<HTMLElement>('.ion-page-invisible');
  return page && enteringPages.has(page) && page.closest(':is(ion-app, body).ios-theme-enable-foldable') ? page : undefined;
};
const disabledButtonGroup = 'ion-buttons:is(.ionic-theme-disabled, .ios-theme-disabled, .ios26-disabled)';
const shellDisabledSelector = '.ios-theme-shell-disabled';

export const isDisabledButtonGroupChild = (element: HTMLElement): boolean =>
  element.matches('ion-button.ios') && element.parentElement?.matches(disabledButtonGroup) === true;

const foldableRailTags = new Set(['ion-button', 'ion-back-button', 'ion-buttons', 'ion-menu-button', 'ion-tab-bar']);

export const isFoldableRailSource = (element: HTMLElement): boolean =>
  foldableRailTags.has(element.localName) &&
  (element.matches('ion-tab-bar') || foldableRailOwned(element)) &&
  !element.closest('ion-menu, ion-modal, ion-popover') &&
  !!element.closest(':is(ion-app, body).ios-theme-enable-foldable');

const excludedBy = (element: HTMLElement, selector: string): boolean => {
  const owner = element.closest<HTMLElement>(selector);
  return !!owner && !(element.parentElement === owner && isDisabledButtonGroupChild(element));
};

export const isPermanentlyExcluded = (element: HTMLElement): boolean => excludedBy(element, permanentlyExcluded);
export const isExcluded = (element: HTMLElement, enteringPage?: HTMLElement): boolean =>
  excludedBy(element, `${permanentlyExcluded}, .ion-page-hidden`) || (!!element.closest('.ion-page-invisible') && !enteringPage);

// A shared native surface must not cover an opted-out descendant either.
export const isShellDisabled = (element: Element): boolean =>
  !!element.closest(shellDisabledSelector) || !!element.querySelector(shellDisabledSelector);

export const isFoldableToolbarActionShape = (element: HTMLElement): boolean =>
  element.matches('ion-menu-button') ||
  (element.matches('ion-button') &&
    !!element.querySelector('ion-icon, svg') &&
    !Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim()) &&
    !element.matches('.ion-color, [color]') &&
    ['default', 'clear'].includes((element as HTMLIonButtonElement).fill ?? element.getAttribute('fill') ?? 'default'));

// Placement belongs to the DOM identity for one routed-page epoch. Changes to
// content/disabled state affect rendering, never its chosen surface.
const foldablePlacement = new WeakMap<HTMLElement, boolean>();
export const setFoldablePlacement = (element: HTMLElement, rail: boolean): void => {
  foldablePlacement.set(element, rail);
};
export const clearFoldablePlacement = (element: HTMLElement): void => {
  foldablePlacement.delete(element);
};
export const foldableRailOwned = (element: HTMLElement): boolean => foldablePlacement.get(element) === true;

export const isFoldableToolbarAction = (element: HTMLElement): boolean =>
  element.matches('.ios') && foldableRailOwned(element) && !isExcluded(element, foldableEnteringPage(element)) && !isShellDisabled(element);

export const foldableToolbarActions = (element: HTMLElement): HTMLElement[] =>
  Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement && isFoldableToolbarAction(child));

export const isFoldableToolbarGroup = (element: HTMLElement): boolean => {
  return (
    element.matches('ion-buttons.ios') &&
    foldableRailOwned(element) &&
    !element.matches('.ionic-theme-disabled, .ios-theme-disabled, .ios26-disabled') &&
    !isShellDisabled(element)
  );
};

export const activateProjectedElement = (element: HTMLElement): void => {
  const target = element.matches('ion-button, ion-back-button, ion-menu-button')
    ? element.shadowRoot?.querySelector<HTMLElement>('[part~="native"]')
    : undefined;
  (target ?? element).click();
};

export const unprojected = <T>(elements: Iterable<HTMLElement>, read: () => T): T => {
  const hidden = Array.from(elements).filter((element) => element.hasAttribute(marker));
  hidden.forEach((element) => element.removeAttribute(marker));
  try {
    return read();
  } finally {
    hidden.forEach((element) => element.setAttribute(marker, ''));
  }
};

const readVisible = (element: HTMLElement, allowOutsideViewport: boolean): boolean => {
  const enteringPage = isFoldableRailSource(element) ? foldableEnteringPage(element) : undefined;
  if (!element.isConnected || isExcluded(element, enteringPage) || isShellDisabled(element)) return false;
  const prehidden = element.closest<HTMLElement>(`.${prehiddenClass}`);
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    const hiddenForProjection = !!prehidden?.contains(current);
    if (
      style.display === 'none' ||
      (!hiddenForProjection && style.visibility !== 'visible') ||
      (Number(style.opacity) === 0 && !current.hasAttribute(fadeMarker) && current !== enteringPage)
    )
      return false;
    // Ordinary controls on moving/collapsing/custom transformed surfaces stay in Web coordinates.
    // Foldable rail controls are placed independently of their Web coordinates and must remain
    // owned while Ionic transforms the content behind an open menu.
    if (
      !allowOutsideViewport &&
      style.transform !== 'none' &&
      !new DOMMatrixReadOnly(style.transform).isIdentity &&
      current !== element &&
      !current.matches('ion-tab-bar')
    )
      return false;
  }
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    (allowOutsideViewport || (rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1))
  );
};

export const visible = (element: HTMLElement, allowOutsideViewport = false): boolean => readVisible(element, allowOutsideViewport);

export const frame = (rect: DOMRect, origin?: DOMRect): Frame => ({
  x: rect.x - (origin?.x ?? 0),
  y: rect.y - (origin?.y ?? 0),
  width: rect.width,
  height: rect.height,
});

export const text = (element: Element): string => {
  if (element.matches('ion-icon, svg, ion-badge, .ios27-segment-lens, .ion-cloned-element')) return '';
  return Array.from(element.childNodes)
    .map((node) => (node.nodeType === Node.TEXT_NODE ? node.textContent : node instanceof Element ? text(node) : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
};

export const inFixedToolbar = (element: Element): boolean => {
  const edge = element.closest('ion-toolbar')?.parentElement;
  const foldable = !!element.closest(':is(ion-app, body).ios-theme-enable-foldable');
  return (
    !!edge?.matches('ion-header, ion-footer') &&
    !element.closest('ion-content') &&
    !edge.hasAttribute('collapse') &&
    (foldable || !edge.matches('.header-collapse-main, .header-collapse-condense'))
  );
};
