import type { Frame, ShellControl, ShellItem, NativeUIShellComponent } from './definitions';
import { readFab } from './fab';

export const selector = 'ion-buttons, ion-button, ion-back-button, ion-tab-bar, ion-segment, ion-fab';
export const marker = 'data-native-ui-shell';
export const isDark = (style: CSSStyleDeclaration): boolean => style.getPropertyValue('--ios27-color-scheme').trim() === 'dark';
export const excluded =
  '.ionic-theme-disabled, .ios-theme-disabled, .ios26-disabled, .ion-page-hidden, .ion-page-invisible, .ion-cloned-element, [hidden], [inert]';

export interface Candidate {
  element: HTMLElement;
  sources?: HTMLElement[];
  control: ShellControl;
  actions: Map<string, HTMLElement>;
  icons: { item: ShellItem; source: string; field?: 'closeIcon' }[];
}

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

const frame = (rect: DOMRect, origin?: DOMRect): Frame => ({
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

export const iconSource = (svg: SVGElement, mirrored?: boolean): string | undefined => {
  // A small, local SVG subset. Never load external content while projecting UI.
  if (
    svg.querySelector('script, foreignObject, image, use, animate, animateTransform, set, style, text') ||
    /url\((?!["']?#)/.test(svg.outerHTML)
  )
    return undefined;
  // Ionicons flips the wrapper, not the SVG, for directional icons in RTL.
  if (mirrored === undefined && svg.parentElement?.matches('.icon-inner')) {
    const transform = new DOMMatrixReadOnly(getComputedStyle(svg.parentElement).transform);
    mirrored = transform.is2D && transform.a === -1 && transform.d === 1 && !transform.b && !transform.c && !transform.e && !transform.f;
  }
  const copy = svg.cloneNode(true) as SVGElement;
  const originals = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const copies = [copy, ...Array.from(copy.querySelectorAll('*'))];
  originals.forEach((node, index) => {
    const style = getComputedStyle(node);
    for (const property of ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'color']) {
      (copies[index] as SVGElement).style.setProperty(property, style.getPropertyValue(property));
    }
  });
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (mirrored) {
    copy.style.transform = 'scaleX(-1)';
    copy.style.transformOrigin = 'center';
  }
  return new XMLSerializer().serializeToString(copy);
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

export const readCandidate = (element: HTMLElement, id: (element: HTMLElement) => string): Candidate | undefined => {
  if (!element.classList.contains('ios') || !visible(element) || element.closest('ion-modal, ion-popover')) return undefined;
  if (
    !getComputedStyle(element).getPropertyValue('--ios-theme-glass-background-rgb').trim() &&
    !getComputedStyle(element).getPropertyValue('--ios26-glass-background-rgb').trim()
  )
    return undefined;
  let kind = element.localName as NativeUIShellComponent;
  if (kind === 'ion-fab') return readFab(element as HTMLIonFabElement, id);
  if (kind !== 'ion-tab-bar') {
    if (!inFixedToolbar(element)) return undefined;
  } else if (element.closest('ion-content')) return undefined;
  if (element.contains(element.ownerDocument.activeElement)) return undefined;
  let children: HTMLElement[];
  if (kind === 'ion-button') {
    const button = element as HTMLIonButtonElement;
    if (button.fill !== 'default' || button.classList.contains('ion-color')) return undefined;
    children = [element];
  } else if (kind === 'ion-buttons') {
    // The theme puts the glass surface on ion-buttons, including a single menu button.
    // Other fills own their own appearance and are projected individually.
    children = Array.from(element.children) as HTMLElement[];
    if (
      !children.length ||
      (children.length === 1 && !children[0].matches('ion-menu-button.ios')) ||
      children.some(
        (child) =>
          !child.matches('ion-menu-button.ios') &&
          (!child.matches('ion-button.ios.button-clear') || (child as HTMLIonButtonElement).fill !== 'clear'),
      )
    )
      return undefined;
    if (children.length === 1) kind = 'ion-menu-button';
  } else if (kind === 'ion-back-button') {
    const button = element as HTMLIonBackButtonElement;
    if (button.icon !== undefined || button.color !== undefined) return undefined;
    children = [element];
  } else if (kind === 'ion-segment') {
    const segment = element as HTMLIonSegmentElement;
    if (segment.scrollable || element.classList.contains('segment-expand') || element.querySelector('ion-segment-button[content-id]'))
      return undefined;
    children = Array.from(element.querySelectorAll(':scope > ion-segment-button'));
  } else children = Array.from(element.querySelectorAll(':scope > ion-tab-button:not(.ion-cloned-element)'));
  if (!children.length || children.some((child) => !visible(child) || child.closest(excluded))) return undefined;
  if (kind === 'ion-tab-bar') {
    // Only equal items with Ionic's default layout map to UIKit's adaptive tabs.
    const width = children[0].getBoundingClientRect().width;
    if (
      children.some(
        (child) =>
          ((child as HTMLIonTabButtonElement).layout ?? 'icon-top') !== 'icon-top' ||
          Math.abs(child.getBoundingClientRect().width - width) > 1,
      )
    )
      return undefined;
  }
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const candidate: Candidate = {
    element,
    control: {
      id: id(element),
      kind,
      ...frame(rect),
      items: [],
      dark: isDark(style),
      rtl: style.direction === 'rtl',
    },
    actions: new Map(),
    icons: [],
  };
  if (kind === 'ion-tab-bar') {
    const rtl = style.direction === 'rtl';
    const position = ['start', 'center', 'end'].find((value) => element.classList.contains(`tab-bar-position-${value}`));
    candidate.control.tabBarAnchor = {
      x: position === 'center' ? 0.5 : position ? ((position === 'start') !== rtl ? 0 : 1) : style.left !== 'auto' ? 0 : 1,
      y: element.slot === 'bottom' ? 1 : 0,
    };
  }
  for (const child of children) {
    // Complex slots are left on the Web instead of silently discarding content.
    if (child.querySelector('input, button, a, img, canvas, video, ion-spinner, ion-avatar')) return undefined;
    const menu = child.matches('ion-menu-button');
    // Host click invokes Ionic's toggle; HTML submit/reset defaults belong to its inner button.
    if (menu && (child as HTMLIonMenuButtonElement).type !== 'button') return undefined;
    const fallbackMenuIcon = menu && !child.shadowRoot?.querySelector('slot')?.assignedNodes().length;
    const content = kind === 'ion-back-button' || fallbackMenuIcon ? child.shadowRoot : child;
    if (!content) return undefined;
    const icons = Array.from(content.querySelectorAll<HTMLElement>('ion-icon'));
    const directSVGs = Array.from(content.querySelectorAll<SVGElement>('svg'));
    if (icons.length + directSVGs.length > 1) return undefined;
    const svg = directSVGs[0] ?? icons[0]?.shadowRoot?.querySelector<SVGElement>('svg');
    if (icons.length && !svg) return undefined; // ion-icon has not finished loading.
    const labelElement = content.querySelector('[part="text"], ion-label') ?? child;
    const label = kind === 'ion-back-button' ? (content.querySelector('[part="text"]')?.textContent?.trim() ?? '') : text(child);
    if (kind === 'ion-segment' && label && svg) return undefined;
    const native = child.shadowRoot?.querySelector('[part="native"]');
    const labelStyle = getComputedStyle(labelElement);
    const item: ShellItem = {
      id: id(child),
      ...frame(child.getBoundingClientRect(), rect),
      label,
      accessibilityLabel: child.getAttribute('aria-label') ?? native?.getAttribute('aria-label') ?? label,
      disabled:
        !!(child as HTMLIonButtonElement).disabled ||
        !!(element as HTMLIonSegmentElement).disabled ||
        getComputedStyle(child).pointerEvents === 'none',
      selected:
        kind === 'ion-segment'
          ? (element as HTMLIonSegmentElement).value === (child as HTMLIonSegmentButtonElement).value
          : !!(child as HTMLIonTabButtonElement).selected,
      fontSize: parseFloat(labelStyle.fontSize),
      fontWeight: parseInt(labelStyle.fontWeight, 10) || 400,
      color: getComputedStyle(native ?? child).color,
      badge: child.querySelector('ion-badge')?.textContent?.trim(),
    };
    if (svg) {
      const source = iconSource(svg);
      if (!source) return undefined;
      const size = (icons[0] ?? svg).getBoundingClientRect();
      item.iconWidth = size.width;
      item.iconHeight = size.height;
      if (!size.width || !size.height) return undefined;
      item.iconPosition = kind === 'ion-tab-bar' ? 'top' : (icons[0] ?? svg).getAttribute('slot') === 'end' ? 'trailing' : 'leading';
      if (kind === 'ion-tab-bar') {
        const color = getComputedStyle(svg).color;
        const shapes = Array.from(svg.querySelectorAll('path, rect, circle, ellipse, line, polygon, polyline'));
        // Only text-colored SVGs follow UIKit selection tint; preserve explicit artwork colors.
        item.iconTemplate =
          shapes.length > 0 &&
          shapes.every((shape) => {
            const paint = getComputedStyle(shape);
            return [paint.fill, paint.stroke].every((value) => value === 'none' || value === color);
          });
      }
      candidate.icons.push({ item, source });
    }
    if (!label && !svg) return undefined;
    candidate.control.items.push(item);
    candidate.actions.set(item.id, child);
  }
  return candidate;
};

export const createIconRenderer = () => {
  const cache = new Map<string, string>();
  return {
    clear: () => cache.clear(),
    async render(source: string, width: number, height: number): Promise<string> {
      const scale = devicePixelRatio || 1;
      const key = `${width}:${height}:${scale}:${source}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/png').split(',')[1];
        if (cache.size >= 128) cache.delete(cache.keys().next().value!);
        cache.set(key, data);
        return data;
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  };
};
