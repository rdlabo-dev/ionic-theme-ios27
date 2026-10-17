import type { ShellControl, ShellItem, NativeUIShellComponent, VerticalControlAreaOptions } from '../definitions';
import { frame, isDark, isVerticalBarsSource, text, visible } from './dom';
import { iconSource } from './icons';

export interface Candidate {
  buttonProjection?: VerticalControlAreaOptions['buttonProjection'];
  buttonDefaultFill?: VerticalControlAreaOptions['buttonDefaultFill'];
  element: HTMLElement;
  sources?: HTMLElement[];
  control: ShellControl;
  actions: Map<string, HTMLElement>;
  icons: { item: ShellItem; source: string; field?: 'closeIcon' }[];
}

export type Identify = (element: HTMLElement) => string;
type ItemElement = HTMLElement & { disabled?: boolean; selected?: boolean };

export const createCandidate = (
  element: HTMLElement,
  kind: NativeUIShellComponent,
  id: Identify,
  options: VerticalControlAreaOptions = {},
): Candidate => {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    element,
    buttonProjection: options.buttonProjection,
    buttonDefaultFill: options.buttonDefaultFill,
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
};

// Shared text, artwork, geometry and action data; component rules stay with their readers.
export const appendItem = (
  candidate: Candidate,
  child: HTMLElement,
  id: Identify,
  content: ParentNode = child,
  label = text(child),
): ShellItem | undefined => {
  if (
    !visible(child, isVerticalBarsSource(candidate.element)) ||
    child.querySelector('input, button, a, img, canvas, video, ion-spinner, ion-avatar')
  )
    return;
  const icons = Array.from(content.querySelectorAll<HTMLElement>('ion-icon'));
  const directSVGs = Array.from(content.querySelectorAll<SVGElement>('svg'));
  if (icons.length + directSVGs.length > 1) return undefined;
  const svg = directSVGs[0] ?? icons[0]?.shadowRoot?.querySelector<SVGElement>('svg');
  if (icons.length && !svg) return undefined; // ion-icon has not finished loading.
  const labelElement = content.querySelector('[part="text"], ion-label') ?? child;
  const native = child.shadowRoot?.querySelector('[part="native"]');
  const labelStyle = getComputedStyle(labelElement);
  const badge = child.querySelector<HTMLElement>('ion-badge');
  const badgeStyle = badge && visible(badge) ? getComputedStyle(badge) : undefined;
  const sourceFill = (child as HTMLIonButtonElement).fill;
  const projectionOwner = [child, child.closest('ion-buttons')].find((element) =>
    element?.matches('[data-projection="source"], [data-projection="system"], .ios-theme-projection-source, .ios-theme-projection-system'),
  );
  const attributeProjection = projectionOwner?.getAttribute('data-projection');
  const projection =
    attributeProjection === 'source' || attributeProjection === 'system'
      ? attributeProjection
      : projectionOwner
        ? projectionOwner.classList.contains('ios-theme-projection-system')
          ? 'system'
          : 'source'
        : candidate.buttonProjection;
  const systemButton = projection !== 'source' && isVerticalBarsSource(child) && child.matches('ion-button, ion-menu-button');
  // Ionic defaults buttons inside ion-buttons to clear, even when the app defaults to solid.
  const defaultFill = child.closest('ion-buttons') ? 'clear' : candidate.buttonDefaultFill;
  const fill = !sourceFill || sourceFill === 'default' ? defaultFill : sourceFill;
  const buttonFill =
    !systemButton &&
    isVerticalBarsSource(child) &&
    child.matches('ion-button') &&
    (fill === 'clear' || fill === 'solid' || fill === 'outline')
      ? fill
      : undefined;
  const outline = buttonFill === 'outline' ? getComputedStyle(native ?? child) : undefined;
  const item: ShellItem = {
    id: id(child),
    ...frame(child.getBoundingClientRect(), candidate.element.getBoundingClientRect()),
    label,
    accessibilityLabel:
      child.getAttribute('aria-label') ??
      native?.getAttribute('aria-label') ??
      (icons[0]?.getAttribute('aria-hidden') === 'true' ? null : icons[0]?.getAttribute('aria-label')) ??
      label,
    disabled:
      !!(child as ItemElement).disabled ||
      !!(candidate.element as ItemElement).disabled ||
      getComputedStyle(child).pointerEvents === 'none',
    selected: !!(child as ItemElement).selected,
    fontSize: parseFloat(labelStyle.fontSize),
    fontWeight: parseInt(labelStyle.fontWeight, 10) || 400,
    color: systemButton ? 'currentColor' : getComputedStyle(native ?? child).color,
    iconTemplate: systemButton ? true : undefined,
    buttonFill,
    backgroundColor: buttonFill === 'solid' ? getComputedStyle(native ?? child).backgroundColor : undefined,
    borderColor: outline?.borderTopColor,
    borderWidth: outline ? parseFloat(outline.borderTopWidth) : undefined,
    badge: badgeStyle
      ? { value: badge!.textContent?.trim() ?? '', color: badgeStyle.backgroundColor, textColor: badgeStyle.color }
      : undefined,
  };
  if (svg) {
    const source = iconSource(svg);
    if (!source) return undefined;
    const size = (icons[0] ?? svg).getBoundingClientRect();
    item.iconWidth = size.width;
    item.iconHeight = size.height;
    if (!size.width || !size.height) return undefined;
    item.iconPosition = (icons[0] ?? svg).getAttribute('slot') === 'end' ? 'trailing' : 'leading';
    candidate.icons.push({ item, source });
  }
  if (native && child.matches('ion-button, ion-back-button')) {
    const style = getComputedStyle(native);
    const icon = icons[0] ?? svg;
    const iconStyle = icon && getComputedStyle(icon);
    const leadingMargin = parseFloat(iconStyle?.marginInlineStart ?? '') || 0;
    const trailingMargin = parseFloat(iconStyle?.marginInlineEnd ?? '') || 0;
    const trailing = item.iconPosition === 'trailing';
    const inner = native.querySelector('.button-inner');
    const gap = inner ? parseFloat(getComputedStyle(inner).columnGap) || 0 : 0;
    // UIKit centers the title/image pair using its insets. Include Ionic's
    // border and negative outer icon margin instead of applying a fixed offset.
    item.contentInsetLeading =
      (parseFloat(style.paddingInlineStart) || 0) +
      (parseFloat(style.borderInlineStartWidth) || 0) +
      (!trailing || !label ? leadingMargin : 0);
    item.contentInsetTrailing =
      (parseFloat(style.paddingInlineEnd) || 0) + (parseFloat(style.borderInlineEndWidth) || 0) + (trailing || !label ? trailingMargin : 0);
    item.imagePadding = label && icon ? gap + (trailing ? leadingMargin : trailingMargin) : 0;
  }
  if (!label && !svg) return undefined;
  candidate.control.items.push(item);
  candidate.actions.set(item.id, child);
  return item;
};
