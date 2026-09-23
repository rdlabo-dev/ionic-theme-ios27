import { fadeMarker } from './crossfade';

import type { Frame } from '../definitions';

export const marker = 'data-native-ui-shell';
export const prehiddenClass = 'ios-theme-native-ui-shell-prehidden';
export const isDark = (style: CSSStyleDeclaration): boolean => style.getPropertyValue('--ios27-color-scheme').trim() === 'dark';
export const excluded =
  '.ionic-theme-disabled, .ios-theme-disabled, .ios26-disabled, .ion-page-hidden, .ion-page-invisible, .ion-cloned-element, [hidden], [inert]';
const disabledButtonGroup = 'ion-buttons:is(.ionic-theme-disabled, .ios-theme-disabled, .ios26-disabled)';
const shellDisabledSelector = '.ios-theme-shell-disabled';

export const isDisabledButtonGroupChild = (element: HTMLElement): boolean =>
  element.matches('ion-button.ios') && element.parentElement?.matches(disabledButtonGroup) === true;

const foldableRailTags = new Set(['ion-button', 'ion-back-button', 'ion-buttons', 'ion-menu-button', 'ion-tab-bar']);

export const isFoldableRailSource = (element: HTMLElement): boolean =>
  foldableRailTags.has(element.localName) &&
  (!element.matches('ion-button') ||
    !element.parentElement?.matches('ion-buttons') ||
    element.parentElement.children.length === 1 ||
    isFoldableToolbarAction(element) ||
    isDisabledButtonGroupChild(element)) &&
  !element.closest('ion-menu, ion-modal, ion-popover') &&
  !!element.closest(':is(ion-app, body).ios-theme-enable-foldable');

export const isExcluded = (element: HTMLElement): boolean => {
  const owner = element.closest<HTMLElement>(excluded);
  return !!owner && !(element.parentElement === owner && isDisabledButtonGroupChild(element));
};

// A shared native surface must not cover an opted-out descendant either.
export const isShellDisabled = (element: Element): boolean =>
  !!element.closest(shellDisabledSelector) || !!element.querySelector(shellDisabledSelector);

export const isFoldableToolbarAction = (element: HTMLElement): boolean =>
  !isExcluded(element) &&
  !isShellDisabled(element) &&
  (element.matches('ion-menu-button.ios') ||
    (element.matches('ion-button.ios') &&
      !!element.querySelector('ion-icon, svg') &&
      !element.matches('.ion-color, [color]') &&
      ['default', 'clear'].includes((element as HTMLIonButtonElement).fill ?? element.getAttribute('fill') ?? 'default')));

export const foldableToolbarActions = (element: HTMLElement): HTMLElement[] =>
  Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement && isFoldableToolbarAction(child));

export const isFoldableToolbarGroup = (element: HTMLElement): boolean => {
  return (
    element.matches('ion-buttons.ios') &&
    foldableToolbarActions(element).length > 1 &&
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
  if (!element.isConnected || isExcluded(element) || isShellDisabled(element)) return false;
  const prehidden = element.closest<HTMLElement>(`.${prehiddenClass}`);
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    const hiddenForProjection = !!prehidden?.contains(current);
    if (
      style.display === 'none' ||
      (!hiddenForProjection && style.visibility !== 'visible') ||
      (Number(style.opacity) === 0 && !current.hasAttribute(fadeMarker))
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
