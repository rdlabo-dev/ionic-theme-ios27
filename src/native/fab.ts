import type { Candidate } from './dom';
import { excluded, iconSource, isDark, text } from './dom';
import type { ShellItem } from './definitions';

const hasHostMotion = (style: CSSStyleDeclaration): boolean =>
  style.animationName !== 'none' || style.transitionDuration.split(',').some((value) => parseFloat(value) > 0);

// FAB owns the batch; only its buttons draw glass. Closed lists keep their IDs
// and resolved artwork, without inventing layout for display:none descendants.
export const readFab = (fab: HTMLIonFabElement, id: (element: HTMLElement) => string): Candidate | undefined => {
  if (fab.slot !== 'fixed' || !fab.parentElement?.matches('ion-content') || fab.contains(fab.ownerDocument.activeElement)) return;
  const children = Array.from(fab.children);
  const main = children.filter((child) => child.matches('ion-fab-button'));
  const lists = children.filter((child) => child.matches('ion-fab-list'));
  if (main.length !== 1 || main.length + lists.length !== children.length) return;
  if (lists.some((list) => list.closest(excluded) || Array.from(list.children).some((child) => !child.matches('ion-fab-button')))) return;
  const buttons = [main[0], ...lists.flatMap((list) => Array.from(list.children))] as HTMLIonFabButtonElement[];
  const style = getComputedStyle(fab);
  if (hasHostMotion(style)) return;
  const transform = new DOMMatrixReadOnly(style.transform);
  if (!transform.is2D || transform.a !== 1 || transform.d !== 1 || transform.b || transform.c) return;
  const candidate: Candidate = {
    element: fab,
    control: {
      id: id(fab),
      kind: 'ion-fab',
      x: 0,
      y: 0,
      width: innerWidth,
      height: innerHeight,
      dark: isDark(style),
      rtl: style.direction === 'rtl',
      items: [],
    },
    actions: new Map(),
    icons: [],
  };
  for (const button of buttons) {
    if (!button.classList.contains('ios') || button.closest(excluded) || button.color || button.type !== 'button' || button.href) return;
    if (button.querySelector('input, button, a, img, canvas, video, ion-spinner, ion-avatar, ion-badge')) return;
    const native = button.shadowRoot?.querySelector<HTMLElement>('[part=native]');
    if (!native) return;
    const s = getComputedStyle(button),
      n = getComputedStyle(native);
    // An opaque custom host/background or custom shape cannot be discarded.
    const alpha = n.backgroundColor.startsWith('rgba(') ? Number(n.backgroundColor.slice(5, -1).split(',')[3]) : 1;
    if (
      s.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
      s.backgroundImage !== 'none' ||
      n.backgroundImage.includes('url(') ||
      !n.backdropFilter.includes('blur') ||
      !(alpha > 0 && alpha < 1)
    )
      return;
    const width = parseFloat(s.width),
      height = parseFloat(s.height);
    if (!(width > 0 && height > 0) || Math.abs(width - height) > 0.5 || !n.borderRadius.includes('50%')) return;
    const list = button.parentElement?.matches('ion-fab-list') ? (button.parentElement as HTMLIonFabListElement) : undefined;
    const listStyle = list && getComputedStyle(list);
    const laidOut = s.display !== 'none' && (!listStyle || listStyle.display !== 'none');
    const visible =
      laidOut &&
      (!list || (list.activated && button.show && listStyle!.visibility === 'visible' && Number(listStyle!.opacity) > 0)) &&
      s.visibility === 'visible' &&
      Number(s.opacity) > 0;
    // Standard scale is centered: even scale(0) retains its actual layout center.
    // Static list translation is already included in the DOM rect (including RTL).
    const matrix = new DOMMatrixReadOnly(s.transform);
    if (!matrix.is2D || matrix.b || matrix.c || matrix.e || matrix.f || matrix.a !== matrix.d || matrix.a < 0) return;
    // Only Ionic's hidden list child may use scale(0). Custom static scaling
    // changes the actual glass/hit area and must retain its Web rendering.
    // Stencil updates show before rendering its host class. Judge the rendered
    // scale against that class so this normal one-frame gap keeps its cover.
    if (matrix.a !== 1 && (matrix.a !== 0 || !list || button.classList.contains('fab-button-show'))) return;
    if (laidOut && !matrix.isIdentity) {
      const origin = s.transformOrigin.split(' ').map(parseFloat);
      if (Math.abs(origin[0] - width / 2) > 0.5 || Math.abs(origin[1] - height / 2) > 0.5) return;
    }
    // Ionic's list appearance is staggered show changes, without a host CSS
    // transition. Custom host animations keep their complete Web rendering.
    if (hasHostMotion(s)) return;
    if (listStyle) {
      if (hasHostMotion(listStyle)) return;
      const transform = new DOMMatrixReadOnly(listStyle.transform);
      if (!transform.is2D || transform.a !== 1 || transform.d !== 1 || transform.b || transform.c) return;
    }
    const rect = button.getBoundingClientRect();
    const x = laidOut ? rect.x + rect.width / 2 - width / 2 : 0;
    const y = laidOut ? rect.y + rect.height / 2 - height / 2 : 0;
    if (visible && (x < -1 || y < -1 || x + width > innerWidth + 1 || y + height > innerHeight + 1)) return;
    const label = text(button);
    const item: ShellItem = {
      id: id(button),
      x,
      y,
      width,
      height,
      label,
      accessibilityLabel: button.getAttribute('aria-label') ?? native.getAttribute('aria-label') ?? label,
      disabled: button.disabled || s.pointerEvents === 'none',
      selected: button.activated,
      visible,
      fontSize: parseFloat(s.fontSize),
      fontWeight: parseInt(s.fontWeight, 10) || 400,
      color: n.color,
    };
    const normal = Array.from(button.querySelectorAll('ion-icon, svg'));
    if (normal.length > 1) return;
    const close = button.shadowRoot?.querySelector<HTMLElement>('ion-icon[part=close-icon]');
    for (const [index, icon] of [normal[0], close].entries()) {
      if (!icon) {
        if (index === 1 || !label) return;
        else continue;
      }
      const svg = icon.matches('svg') ? (icon as SVGElement) : icon.shadowRoot?.querySelector<SVGElement>('svg');
      if (!svg) return;
      const iconStyle = getComputedStyle(icon);
      const inner = icon.shadowRoot?.querySelector('.icon-inner');
      if (index === 0 && inner && !new DOMMatrixReadOnly(iconStyle.transform).isIdentity) return;
      const transform = new DOMMatrixReadOnly(inner ? getComputedStyle(inner).transform : iconStyle.transform);
      const mirrored =
        transform.is2D && transform.a === -1 && transform.d === 1 && !transform.b && !transform.c && !transform.e && !transform.f;
      if (index === 0 && !transform.isIdentity && !mirrored) return;
      const source = iconSource(svg, index === 0 && mirrored);
      const iconWidth = parseFloat(iconStyle.width),
        iconHeight = parseFloat(iconStyle.height);
      // The internal close-icon fills the button vertically; its glyph uses font-size.
      const size = index === 1 ? parseFloat(iconStyle.fontSize) : iconWidth;
      const h = index === 1 ? size : iconHeight;
      if (!source || !(size > 0 && h > 0)) return;
      if (index === 0) {
        item.iconWidth = size;
        item.iconHeight = h;
      } else {
        item.closeIconWidth = size;
        item.closeIconHeight = h;
        item.iconTransition =
          parseFloat(iconStyle.transitionDuration) * (iconStyle.transitionDuration.split(',')[0].trim().endsWith('ms') ? 0.001 : 1);
      }
      candidate.icons.push({ item, source, ...(index === 1 ? { field: 'closeIcon' as const } : {}) });
    }
    if (!visible && !list) return;
    candidate.control.items.push(item);
    if (visible) candidate.actions.set(item.id, button);
  }
  return candidate;
};
