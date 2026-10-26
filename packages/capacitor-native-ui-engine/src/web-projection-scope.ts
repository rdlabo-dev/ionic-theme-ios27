/** A fixed Web fallback element. A replacement element requires a new scope. */
export const createWebProjectionScope = (element: HTMLElement, namespace: string) => {
  if (element.nodeType !== 1 || element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !element.ownerDocument || !('style' in element))
    throw new TypeError('A Web projection scope requires an HTMLElement fallback');
  if (
    element.matches(
      'img, input, textarea, select, video, audio, canvas, iframe, embed, object, br, hr, area, base, link, meta, source, track, wbr',
    )
  )
    throw new TypeError('A Web projection fallback must support ::before; use its existing container element');
  return Object.freeze({ element, namespace });
};
export type WebProjectionScope = ReturnType<typeof createWebProjectionScope>;
