import type { Frame } from '../definitions';

/**
 * Where the rendered overlay sits inside the source WebView and where its image
 * lands in the host view, so the native handoff can swap identical pixels.
 */
export const overlaySnapshot = (
  overlay: HTMLIonModalElement | HTMLIonPopoverElement | HTMLIonAlertElement,
): { source: Frame; destination: Frame } | undefined => {
  const rectOf = (selector: string): Frame | undefined => {
    const rect = overlay.shadowRoot?.querySelector(selector)?.getBoundingClientRect();
    return rect && rect.width > 0 ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : undefined;
  };
  if (overlay.localName === 'ion-popover') {
    // The popover host is sized to the content, so the image fills it.
    const content = rectOf('.popover-content');
    return content && { source: content, destination: { x: 0, y: 0, width: content.width, height: content.height } };
  }
  if (overlay.localName === 'ion-alert') {
    const wrapper = rectOf('.alert-wrapper');
    return wrapper && { source: wrapper, destination: wrapper };
  }
  const wrapper = rectOf('.modal-wrapper');
  if (!wrapper) return undefined;
  // The iOS shadow sits beside the wrapper; keep both inside the frozen image.
  const shadow = rectOf('.modal-shadow');
  const source = shadow
    ? {
        x: Math.min(wrapper.x, shadow.x),
        y: Math.min(wrapper.y, shadow.y),
        width: Math.max(wrapper.x + wrapper.width, shadow.x + shadow.width) - Math.min(wrapper.x, shadow.x),
        height: Math.max(wrapper.y + wrapper.height, shadow.y + shadow.height) - Math.min(wrapper.y, shadow.y),
      }
    : wrapper;
  // Sheet and card presentations size the host to the overlay surface itself.
  const fillsViewport =
    (overlay as HTMLIonModalElement).presentingElement !== undefined || (overlay as HTMLIonModalElement).breakpoints !== undefined;
  return { source, destination: fillsViewport ? { x: 0, y: 0, width: source.width, height: source.height } : source };
};
