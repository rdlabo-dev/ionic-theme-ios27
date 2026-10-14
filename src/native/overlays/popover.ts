import type { ShellPopoverPresentation } from '../definitions';
import { projectionIds } from '../shared/projection-id';
import { isDark } from '../shared/dom';
import { moveContent } from './content';

export const popoverTrigger = (overlay: HTMLIonPopoverElement): Element | undefined => {
  const event = overlay.event as MouseEvent | undefined;
  const target = (overlay.trigger ? overlay.ownerDocument.getElementById(overlay.trigger) : event?.target) as Element | undefined;
  return target?.closest?.('ion-button,ion-fab-button,ion-item') ?? target;
};

/** Only accepted native rail buttons can retain the page projection. */
export const verticalBarsPopoverAnchor = (overlay: HTMLIonPopoverElement): string | undefined => {
  const trigger = popoverTrigger(overlay);
  if (
    !trigger?.matches('ion-button[data-native-ui-shell-vertical-bars-member]') ||
    !trigger.closest('[data-native-ui-shell]') ||
    (trigger as HTMLIonButtonElement).disabled
  )
    return undefined;
  return projectionIds.get(trigger);
};

export const popoverPresentation = (overlay: HTMLIonPopoverElement): ShellPopoverPresentation => {
  const content = overlay.shadowRoot!.querySelector<HTMLElement>('.popover-content')!;
  const rect = content.getBoundingClientRect();
  const anchorId = verticalBarsPopoverAnchor(overlay);
  if (!anchorId) throw new Error('Native Vertical Bars anchor unavailable');
  return {
    kind: 'popover',
    animated: overlay.animated,
    dark: isDark(overlay.ownerDocument.defaultView!.getComputedStyle(overlay)),
    anchorId,
    width: rect.width,
    height: rect.height,
    backgroundColor: overlay.ownerDocument.defaultView!.getComputedStyle(content).backgroundColor,
    backdropDismiss: overlay.backdropDismiss,
  };
};

export const relayPopover = (overlay: HTMLIonPopoverElement, destination: HTMLElement) => {
  const doc = destination.ownerDocument;
  const source = overlay.shadowRoot!.querySelector<HTMLElement>('.popover-content')!;
  const root = doc.createElement('ion-popover');
  for (const attribute of Array.from(overlay.attributes)) root.setAttribute(attribute.name, attribute.value);
  Object.assign(root.style, {
    position: 'absolute',
    inset: '0',
    display: 'block',
    visibility: 'visible',
    opacity: '1',
    pointerEvents: 'auto',
  });
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const shadow = root.attachShadow({ mode: 'open' });
  const shell = doc.createElement('div');
  const css = overlay.ownerDocument.defaultView!.getComputedStyle(source);
  Object.assign(shell.style, { height: '100%', overflow: css.overflow, background: css.backgroundColor });
  shell.append(doc.createElement('slot'));
  shadow.append(shell);
  destination.append(root);
  // Components such as ion-select-popover dismiss their closest ion-popover.
  root.dismiss = (...args) => overlay.dismiss(...args);
  const restore = moveContent(Array.from(source.querySelector('slot')!.assignedElements()) as HTMLElement[], root);
  const select = (event: MouseEvent) => {
    if (!event.composedPath().includes(shell)) {
      if (overlay.backdropDismiss) void overlay.dismiss(undefined, 'backdrop');
    } else if (overlay.dismissOnSelect) void overlay.dismiss();
  };
  root.addEventListener('click', select);
  return {
    root,
    stop() {
      root.removeEventListener('click', select);
      restore();
      root.remove();
    },
  };
};
