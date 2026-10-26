export function* projectionAncestors(element: HTMLElement): Generator<HTMLElement> {
  let current: HTMLElement | null = element;
  while (current) {
    const root = current.getRootNode();
    current = current.assignedSlot ?? current.parentElement ?? (root instanceof ShadowRoot ? (root.host as HTMLElement) : null);
    if (current) yield current;
  }
}

export const fitsClip = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  for (const ancestor of projectionAncestors(element)) {
    const style = getComputedStyle(ancestor);
    if (style.transform !== 'none' && !new DOMMatrixReadOnly(style.transform).isIdentity) return false;
    const bounds = ancestor.getBoundingClientRect();
    const left = bounds.left + ancestor.clientLeft;
    const top = bounds.top + ancestor.clientTop;
    if (/^(hidden|clip|scroll|auto)$/.test(style.overflowX) && (rect.left < left - 1 || rect.right > left + ancestor.clientWidth + 1))
      return false;
    if (/^(hidden|clip|scroll|auto)$/.test(style.overflowY) && (rect.top < top - 1 || rect.bottom > top + ancestor.clientHeight + 1))
      return false;
  }
  return true;
};

/** Current viewport placement for coordinate-driven backends, including Android. */
export const readPlacement = (element: HTMLElement) => {
  const source = element.getBoundingClientRect();
  if (!element.isConnected || source.width <= 0 || source.height <= 0) return;
  const win = element.ownerDocument.defaultView!;
  let left = 0,
    top = 0,
    right = win.innerWidth,
    bottom = win.innerHeight;
  for (const ancestor of [element, ...projectionAncestors(element)]) {
    const style = win.getComputedStyle(ancestor);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0 ||
      (style.transform !== 'none' && !new DOMMatrixReadOnly(style.transform).isIdentity) ||
      [style.translate, style.rotate, style.scale, style.perspective].some((value) => value && value !== 'none') ||
      (style.clipPath && style.clipPath !== 'none') ||
      (style.maskImage && style.maskImage !== 'none')
    )
      return;
    if (ancestor === element) continue;
    const clipsX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX),
      clipsY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
    if (
      (clipsX || clipsY) &&
      [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius].some(
        (radius) => parseFloat(radius) > 0,
      )
    )
      return;
    const r = ancestor.getBoundingClientRect();
    if (clipsX) {
      left = Math.max(left, r.left + (parseFloat(style.borderLeftWidth) || 0));
      right = Math.min(right, r.right - (parseFloat(style.borderRightWidth) || 0));
    }
    if (clipsY) {
      top = Math.max(top, r.top + (parseFloat(style.borderTopWidth) || 0));
      bottom = Math.min(bottom, r.bottom - (parseFloat(style.borderBottomWidth) || 0));
    }
  }
  left = Math.max(left, source.left);
  top = Math.max(top, source.top);
  right = Math.min(right, source.right);
  bottom = Math.min(bottom, source.bottom);
  if (right <= left || bottom <= top) return;
  return {
    frame: { x: source.x, y: source.y, width: source.width, height: source.height },
    clip: { x: left, y: top, width: right - left, height: bottom - top },
  };
};
