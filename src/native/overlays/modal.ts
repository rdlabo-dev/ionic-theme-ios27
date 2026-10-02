import type { ShellModalPresentation } from '../definitions';
import { moveContent } from './content';
import { activeElement } from './focus';

/** Keep Ionic's host and animation wrapper in the source document. */
export const relayModal = (
  overlay: HTMLIonModalElement,
  destination: HTMLElement,
  kind: ShellModalPresentation['kind'],
): { root: HTMLElement; stop: () => void } => {
  const fillsViewport = kind !== 'normal';
  const doc = overlay.ownerDocument;
  const win = doc.defaultView!;
  const target = destination.ownerDocument;
  const wrapper = overlay.shadowRoot?.querySelector<HTMLElement>('.modal-wrapper');
  const shadow = overlay.shadowRoot?.querySelector<HTMLElement>('.modal-shadow');
  const slot = wrapper?.querySelector('slot');
  if (!wrapper || !slot) throw new Error('Modal content is not mounted');
  const content = slot.assignedElements().filter((element): element is HTMLElement => element.nodeType === 1);
  const shell = target.createElement('div');
  const shadowSurface = !fillsViewport && shadow ? target.createElement('div') : null;
  if (shadowSurface) {
    shadowSurface.style.position = 'absolute';
    shadowSurface.style.pointerEvents = 'none';
    shadowSurface.setAttribute('aria-hidden', 'true');
    destination.append(shadowSurface);
  }
  shell.tabIndex = -1;
  shell.style.position = 'absolute';
  shell.style.overflow = 'hidden';
  destination.append(shell);
  const sync = () => {
    for (const name of ['role', 'aria-modal', 'aria-label', 'aria-labelledby', 'aria-describedby']) {
      const value = wrapper.getAttribute(name);
      if (value === null) shell.removeAttribute(name);
      else shell.setAttribute(name, value);
    }
    const rect = wrapper.getBoundingClientRect();
    const css = win.getComputedStyle(wrapper);
    for (const name of Array.from(css))
      if (name.startsWith('--') && !(fillsViewport && name.startsWith('--ion-safe-area-')))
        shell.style.setProperty(name, css.getPropertyValue(name));
    Object.assign(shell.style, {
      left: fillsViewport ? '0' : `${rect.x}px`,
      top: fillsViewport ? '0' : `${rect.y}px`,
      width: fillsViewport ? '100%' : `${rect.width}px`,
      height: fillsViewport ? '100%' : `${rect.height}px`,
      borderRadius: fillsViewport ? '0' : css.borderRadius,
      boxShadow: fillsViewport ? 'none' : css.boxShadow,
      // UIKit owns the sheet outline. Keep Web backdrop filters inside its
      // content viewport so the native outer shadow cannot bleed into headers.
      clipPath: fillsViewport ? 'inset(0)' : css.clipPath,
      background: css.backgroundColor,
    });
    if (shadowSurface) {
      // Keep the shadow outside the clipped surface, as Ionic does. Otherwise
      // translucent headers sample the shadow and acquire a dark inner edge.
      Object.assign(shadowSurface.style, {
        left: shell.style.left,
        top: shell.style.top,
        width: shell.style.width,
        height: shell.style.height,
        borderRadius: shell.style.borderRadius,
        boxShadow: win.getComputedStyle(shadow!).boxShadow,
      });
    }
  };
  sync();
  // Ionic limits the page to the visible Web sheet fraction. UIKit has already
  // sized this viewport to that fraction, so applying it again leaves a gap.
  const sheetPage = kind === 'sheet' && !overlay.expandToScroll ? overlay.querySelector<HTMLElement>('.ion-page') : null;
  const maxHeight = sheetPage?.style.getPropertyValue('max-height') ?? '';
  const maxHeightPriority = sheetPage?.style.getPropertyPriority('max-height') ?? '';
  sheetPage?.style.setProperty('max-height', '100%', 'important');
  const focus = activeElement(doc) as HTMLElement | null;
  const restore = moveContent(content, shell);
  const backdrop = (event: MouseEvent) => {
    if (!event.composedPath().includes(shell) && overlay.backdropDismiss) void overlay.dismiss(undefined, 'backdrop');
  };
  target.addEventListener('click', backdrop);
  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && overlay.backdropDismiss) void overlay.dismiss(undefined, 'backdrop');
  };
  target.addEventListener('keydown', escape);
  const resize = new ResizeObserver(sync);
  resize.observe(wrapper);
  const theme = new MutationObserver(sync);
  for (let node: HTMLElement | null = overlay; node; node = node.parentElement) theme.observe(node, { attributes: true });
  theme.observe(doc.head, { subtree: true, childList: true, characterData: true, attributes: true });
  const palette = win.matchMedia('(prefers-color-scheme: dark)');
  palette.addEventListener('change', sync);
  target.defaultView!.addEventListener('resize', sync);
  (focus?.isConnected && focus.ownerDocument === target ? focus : shell).focus({ preventScroll: true });
  return {
    root: shell,
    stop() {
      target.removeEventListener('click', backdrop);
      target.removeEventListener('keydown', escape);
      resize.disconnect();
      theme.disconnect();
      palette.removeEventListener('change', sync);
      target.defaultView!.removeEventListener('resize', sync);
      sheetPage?.style.setProperty('max-height', maxHeight, maxHeightPriority);
      restore();
      shell.remove();
      shadowSurface?.remove();
    },
  };
};
