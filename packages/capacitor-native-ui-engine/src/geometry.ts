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
