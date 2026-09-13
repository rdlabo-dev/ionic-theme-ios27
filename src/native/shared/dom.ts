import type { Frame } from '../definitions';

export const marker = 'data-native-ui-shell';
export const isDark = (style: CSSStyleDeclaration): boolean => style.getPropertyValue('--ios27-color-scheme').trim() === 'dark';
export const excluded =
  '.ionic-theme-disabled, .ios-theme-disabled, .ios26-disabled, .ion-page-hidden, .ion-page-invisible, .ion-cloned-element, [hidden], [inert]';

export const unprojected = <T>(elements: Iterable<HTMLElement>, read: () => T): T => {
  const hidden = Array.from(elements).filter((element) => element.hasAttribute(marker));
  hidden.forEach((element) => element.removeAttribute(marker));
  try {
    return read();
  } finally {
    hidden.forEach((element) => element.setAttribute(marker, ''));
  }
};

export const visible = (element: HTMLElement): boolean => {
  if (!element.isConnected || element.closest(excluded)) return false;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
    // Moving/collapsing/custom transformed surfaces stay in Web coordinates.
    if (
      style.transform !== 'none' &&
      !new DOMMatrixReadOnly(style.transform).isIdentity &&
      current !== element &&
      !current.matches('ion-tab-bar')
    )
      return false;
  }
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1
  );
};

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
  return (
    !!edge?.matches('ion-header, ion-footer') &&
    !element.closest('ion-content') &&
    !edge.hasAttribute('collapse') &&
    !edge.matches('.header-collapse-main, .header-collapse-condense')
  );
};
