import type { ShellPopoverPresentation } from '../definitions';
import { projectionIds } from '../shared/projection-id';
import { isDark } from '../shared/dom';
import { moveContent } from './content';
import { captureRelayAppearance, sheetText } from './styles';

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
  const content = Array.from(source.querySelector('slot')!.assignedElements()) as HTMLElement[];
  const matchesSourceAppearance = captureRelayAppearance(content);
  const size = source.getBoundingClientRect();
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
  const inheritedStyles = doc.createElement('style');
  inheritedStyles.textContent =
    sheetText(overlay.shadowRoot!.adoptedStyleSheets) +
    Array.from(overlay.shadowRoot!.querySelectorAll('style'), (style) => style.textContent).join('\n');
  shadow.append(inheritedStyles);
  const shell = doc.createElement('div');
  shell.className = 'popover-content';
  const css = overlay.ownerDocument.defaultView!.getComputedStyle(source);
  Object.assign(shell.style, {
    position: 'relative',
    // Ionic hides this shell until its Web enter animation runs. SwiftUI owns
    // the relay animation, so its content must already be opaque.
    opacity: '1',
    boxSizing: 'border-box',
    inset: 'auto',
    width: '100%',
    maxWidth: 'none',
    height: '100%',
    maxHeight: 'none',
    transform: 'none',
    boxShadow: 'none',
    border: css.border,
    borderColor: 'transparent',
    borderRadius: '0',
    overflow: css.overflow,
    background: css.backgroundColor,
  });
  shell.append(doc.createElement('slot'));
  shadow.append(shell);
  destination.append(root);
  // Components such as ion-select-popover dismiss their closest ion-popover.
  root.dismiss = (...args) => overlay.dismiss(...args);
  const restore = moveContent(content, root);
  const select = (event: MouseEvent) => {
    if (!event.composedPath().includes(shell)) {
      if (overlay.backdropDismiss) void overlay.dismiss(undefined, 'backdrop');
    } else if (overlay.dismissOnSelect) void overlay.dismiss();
  };
  root.addEventListener('click', select);
  return {
    root,
    matchesSourceAppearance() {
      const previousWidth = root.style.width;
      const previousHeight = root.style.height;
      root.style.width = `${size.width}px`;
      root.style.height = `${size.height}px`;
      try {
        return matchesSourceAppearance();
      } finally {
        root.style.width = previousWidth;
        root.style.height = previousHeight;
      }
    },
    stop() {
      root.removeEventListener('click', select);
      restore();
      root.remove();
    },
  };
};
