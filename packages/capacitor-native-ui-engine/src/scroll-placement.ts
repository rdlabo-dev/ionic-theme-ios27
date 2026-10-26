import type { ScrollPlacement as NativeUIScrollPlacement } from './types.js';
type Identify = (element: HTMLElement) => string;
import { projectionAncestors } from './geometry.js';
const frame = ({ x, y, width, height }: DOMRect) => ({ x, y, width, height });

const viewportFrame = (element: HTMLElement) => {
  const bounds = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const left = parseFloat(style.borderLeftWidth) || 0;
  const top = parseFloat(style.borderTopWidth) || 0;
  return {
    x: bounds.left + left,
    y: bounds.top + top,
    width: bounds.width - left - (parseFloat(style.borderRightWidth) || 0),
    height: bounds.height - top - (parseFloat(style.borderBottomWidth) || 0),
  };
};

/** Layout-only measurement. Native owns subsequent scroll offsets. No private Ionic APIs. */
export const readScrollPlacement = (element: HTMLElement, owner: HTMLElement, id: Identify): NativeUIScrollPlacement | undefined => {
  const ancestors = [element, ...projectionAncestors(element)];
  const index = ancestors.indexOf(owner);
  if (index <= 0 || owner === element.ownerDocument.scrollingElement) return;
  const win = element.ownerDocument.defaultView!;
  if (win.visualViewport && (win.visualViewport.scale !== 1 || win.visualViewport.offsetLeft || win.visualViewport.offsetTop)) return;
  let left = 0,
    top = 0,
    right = win.innerWidth,
    bottom = win.innerHeight;
  for (const [i, ancestor] of ancestors.entries()) {
    const style = getComputedStyle(ancestor);
    if (
      (style.transform !== 'none' && !new DOMMatrixReadOnly(style.transform).isIdentity) ||
      (style.zoom && style.zoom !== 'normal' && Number(style.zoom) !== 1) ||
      [style.translate, style.rotate, style.scale, style.perspective].some((value) => value && value !== 'none') ||
      (style.writingMode && style.writingMode !== 'horizontal-tb') ||
      (i < index && /^(fixed|sticky)$/.test(style.position))
    )
      return;
    if (i === 0) continue;
    if (style.scrollbarGutter && style.scrollbarGutter !== 'auto') return;
    const clipsX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
    const clipsY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
    // Nested moving/clipping coordinates require a separate binding; do not guess.
    if (i < index && (clipsX || clipsY)) return;
    const documentScroll = ancestor === element.ownerDocument.scrollingElement;
    if (
      i > index &&
      (((clipsX || documentScroll) && ancestor.scrollWidth > ancestor.clientWidth) ||
        ((clipsY || documentScroll) && ancestor.scrollHeight > ancestor.clientHeight))
    )
      return;
    if (
      (clipsX || clipsY) &&
      [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius].some(
        (radius) => parseFloat(radius) > 0,
      )
    )
      return;
    if ((style.clipPath && style.clipPath !== 'none') || (style.maskImage && style.maskImage !== 'none')) return;
    if (i >= index) {
      const rect = viewportFrame(ancestor);
      if (clipsX) {
        left = Math.max(left, rect.x);
        right = Math.min(right, rect.x + rect.width);
      }
      if (clipsY) {
        top = Math.max(top, rect.y);
        bottom = Math.min(bottom, rect.y + rect.height);
      }
    }
  }
  const style = getComputedStyle(owner);
  if (!/^(auto|scroll)$/.test(style.overflowX) && !/^(auto|scroll)$/.test(style.overflowY)) return;
  const viewport = viewportFrame(owner);
  if (right <= left || bottom <= top || !viewport.width || !viewport.height) return;
  const source = frame(element.getBoundingClientRect());
  return {
    id: id(owner),
    offsetX: owner.scrollLeft,
    offsetY: owner.scrollTop,
    viewport,
    clip: { x: left, y: top, width: right - left, height: bottom - top },
    contentWidth: owner.scrollWidth,
    contentHeight: owner.scrollHeight,
    frame: {
      ...source,
      x: source.x - viewport.x + owner.scrollLeft,
      y: source.y - viewport.y + owner.scrollTop,
    },
  };
};
