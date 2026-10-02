import { moveContent } from './styles';

/** Keep Ionic's host and animation wrapper in the source document. */
export const relayModal = (
  overlay: HTMLIonModalElement,
  destination: HTMLElement,
  presenting = true,
): { root: HTMLElement; stop: () => void } => {
  const doc = overlay.ownerDocument;
  const win = doc.defaultView!;
  const target = destination.ownerDocument;
  const wrapper = overlay.shadowRoot?.querySelector<HTMLElement>('.modal-wrapper');
  const slot = wrapper?.querySelector('slot');
  if (!wrapper || !slot) throw new Error('Modal content is not mounted');
  const content = slot.assignedElements().filter((element): element is HTMLElement => element.nodeType === 1);
  const shell = target.createElement('div');
  shell.style.position = 'absolute';
  shell.style.overflow = 'hidden';
  destination.append(shell);
  const sync = () => {
    const rect = wrapper.getBoundingClientRect();
    const css = win.getComputedStyle(wrapper);
    for (const name of Array.from(css)) if (name.startsWith('--')) shell.style.setProperty(name, css.getPropertyValue(name));
    Object.assign(shell.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      borderRadius: css.borderRadius,
      background: css.backgroundColor,
    });
  };
  sync();
  const restore = moveContent(content, shell);
  const visibility = wrapper.style.visibility;
  wrapper.style.visibility = 'hidden';
  let frame = 0;
  const tick = () => {
    sync();
    frame = win.requestAnimationFrame(tick);
  };
  const track = () => {
    win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(tick);
  };
  const settle = () => {
    win.cancelAnimationFrame(frame);
    sync();
  };
  // Follow Ionic's transitions rather than guessing their duration.
  overlay.addEventListener('ionModalWillDismiss', track);
  overlay.addEventListener('ionModalDidPresent', settle);
  overlay.addEventListener('ionModalDidDismiss', settle);
  const backdrop = (event: MouseEvent) => {
    if (!event.composedPath().includes(shell) && overlay.backdropDismiss) void overlay.dismiss(undefined, 'backdrop');
  };
  target.addEventListener('click', backdrop);
  const resize = new ResizeObserver(sync);
  resize.observe(wrapper);
  const theme = new MutationObserver(sync);
  for (let node: HTMLElement | null = overlay; node; node = node.parentElement) theme.observe(node, { attributes: true });
  theme.observe(doc.head, { subtree: true, childList: true, characterData: true, attributes: true });
  const palette = win.matchMedia('(prefers-color-scheme: dark)');
  palette.addEventListener('change', sync);
  target.defaultView!.addEventListener('resize', sync);
  if (presenting) track();
  return {
    root: shell,
    stop() {
      target.removeEventListener('click', backdrop);
      win.cancelAnimationFrame(frame);
      resize.disconnect();
      theme.disconnect();
      palette.removeEventListener('change', sync);
      target.defaultView!.removeEventListener('resize', sync);
      overlay.removeEventListener('ionModalWillDismiss', track);
      overlay.removeEventListener('ionModalDidPresent', settle);
      overlay.removeEventListener('ionModalDidDismiss', settle);
      wrapper.style.visibility = visibility;
      restore();
      shell.remove();
    },
  };
};
