import type { NativeUIShellOptions, NativeUIShellPlugin, ShellModalPresentation } from '../definitions';
import { isPermanentlyExcluded, isShellDisabled } from '../shared/dom';
import { relayVerticalBars } from './vertical-bars';
import { activeElement, trapFocus } from './focus';
import { relayModal } from './modal';
import { relayPopover, popoverPresentation } from './popover';
import { relayAlert } from './alert';
import { nativeDialogAnimation } from './dialog-animation';
import { relayStyles } from './styles';
import { modalPresentation, syncModalBreakpoint } from './modal-presentation';
import { nativeModalAnimation } from './modal-animation';

type Presentation = ShellModalPresentation | { kind: 'popover'; animated: boolean } | { kind: 'alert'; animated: boolean };
type Overlay = HTMLIonModalElement | HTMLIonPopoverElement | HTMLIonAlertElement;
const lifecycle = (overlay: Overlay, phase: string) =>
  `ion${overlay.localName.slice(4, 5).toUpperCase()}${overlay.localName.slice(5)}${phase}`;

interface Connection {
  id: string;
  overlay: Overlay;
  dismissed: boolean;
  win?: Window;
  focus: Element | null;
  stopStyles?: () => void;
  releaseProjection?: () => void;
  stopVerticalBars?: () => Promise<void>;
  stopContent?: () => void;
  stopFocus?: () => void;
  stopEvents?: () => void;
  stopChildEvents?: () => void;
  stopExclusions?: () => void;
  closing?: Promise<void>;
  nativeClosing?: Promise<void>;
  stopAnimation?: () => void;
  stopLifecycle?: () => void;
}

/** Ionic owns lifecycle and dismissal; only one overlay is relayed at a time. */
export const createOverlayController = async (
  doc: Document,
  plugin: NativeUIShellPlugin,
  options: NativeUIShellOptions,
  retainProjection: () => () => void,
  nativeVerticalBars: () => boolean,
) => {
  let current: Connection | undefined;
  let opening = Promise.resolve();
  let sequence = 0;
  let stopped = false;
  const suspensions = new Set<symbol>();
  const events = ['Modal', 'Popover', 'Alert', 'ActionSheet', 'Loading', 'Picker', 'Toast'].map((name) => `ion${name}WillPresent`);
  const cleanup = async (connection: Connection) => {
    connection.stopEvents?.();
    connection.stopLifecycle?.();
    connection.stopChildEvents?.();
    connection.stopExclusions?.();
    connection.stopFocus?.();
    await connection.nativeClosing;
    await connection.stopVerticalBars?.();
    connection.stopContent?.();
    connection.stopAnimation?.();
    connection.stopStyles?.();
    try {
      await plugin.closeOverlay({ id: connection.id });
    } finally {
      connection.win?.close();
      connection.releaseProjection?.();
      if (current === connection) current = undefined;
      const focus = connection.focus as HTMLElement | null;
      if (focus?.isConnected && focus.tabIndex >= 0) focus.focus({ preventScroll: true });
    }
  };
  const release = (connection: Connection): Promise<void> => (connection.closing ??= cleanup(connection));
  const restoreWeb = async () => {
    if (current) await release(current);
  };
  const excluded = (overlay: HTMLElement) => isPermanentlyExcluded(overlay) || isShellDisabled(overlay);
  const connect = async (connection: Connection, ready: Promise<void>, presentation: Presentation) => {
    const { overlay } = connection;
    // Ionic initializes its gestures after didPresent. Let that turn finish before adopting their content.
    await ready;
    // Placement is captured after Ionic has laid out the modal, including normal modals.
    await new Promise<void>((resolve) => doc.defaultView!.requestAnimationFrame(() => resolve()));
    if (current !== connection || stopped || suspensions.size || connection.dismissed || !overlay.isConnected || excluded(overlay)) {
      await release(connection);
      return;
    }
    try {
      const nativePresentation =
        presentation.kind === 'popover'
          ? { ...popoverPresentation(overlay as HTMLIonPopoverElement), animated: presentation.animated }
          : presentation;
      await plugin.prepareOverlay({ id: connection.id, presentation: nativePresentation });
      if (current !== connection || stopped || suspensions.size || connection.dismissed || excluded(overlay)) {
        await release(connection);
        return;
      }
      const win = doc.defaultView!.open(`about:blank#${connection.id}`, '_blank');
      if (!win) throw new Error('Native overlay window unavailable');
      connection.win = win;
      // The requested blank page replaces the initial document created by window.open.
      // Adopt nodes only after that navigation; otherwise WebKit discards the relay.
      if (win.document.URL !== `about:blank#${connection.id}` || win.document.readyState !== 'complete')
        await new Promise<void>((resolve) => win.addEventListener('load', () => resolve(), { once: true }));
      if (current !== connection || stopped || connection.dismissed || !overlay.isConnected) {
        await release(connection);
        return;
      }
      connection.stopChildEvents = observe(win.document);
      const verticalBars = nativeVerticalBars() && overlay.classList.contains('ios-theme-vertical-bars-modal');
      const environment = relayStyles(doc, win.document, overlay, verticalBars);
      connection.stopStyles = environment.stop;
      if (current !== connection || stopped || suspensions.size || connection.dismissed || !overlay.isConnected || excluded(overlay)) {
        await release(connection);
        return;
      }
      const focused = activeElement(doc) as HTMLElement | null;
      const content =
        presentation.kind === 'popover'
          ? relayPopover(overlay as HTMLIonPopoverElement, environment.destination)
          : presentation.kind === 'alert'
            ? relayAlert(overlay as HTMLIonAlertElement, environment.destination)
            : relayModal(overlay as HTMLIonModalElement, environment.destination, presentation.kind);
      connection.stopContent = content.stop;
      // Release the source document's captured placement before the relay takes ownership.
      doc.defaultView!.dispatchEvent(new Event('nativeUIShellRefresh'));
      if (verticalBars) connection.stopVerticalBars = await relayVerticalBars(win.document, plugin, options, connection.id);
      if (current !== connection || stopped || suspensions.size || connection.dismissed || !overlay.isConnected || excluded(overlay)) {
        await release(connection);
        return;
      }
      const exclusions = new MutationObserver(() => {
        if (excluded(overlay) || isShellDisabled(content.root)) void release(connection).catch(console.error);
      });
      const attributes = { attributes: true, attributeFilter: ['class', 'data-shell', 'hidden', 'inert'] };
      for (let node: HTMLElement | null = overlay; node; node = node.parentElement) exclusions.observe(node, attributes);
      exclusions.observe(content.root, { ...attributes, subtree: true });
      connection.stopExclusions = () => exclusions.disconnect();
      connection.stopFocus = trapFocus(
        content.root,
        () =>
          !connection.dismissed &&
          (!('focusTrap' in overlay) || overlay.focusTrap !== false) &&
          !overlay.classList.contains('ion-disable-focus-trap'),
      );
      const close = () => {
        void release(connection).catch(console.error);
      };
      const escape = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && overlay.localName !== 'ion-modal' && overlay.backdropDismiss)
          void overlay.dismiss(undefined, 'backdrop');
      };
      win.document.addEventListener('keydown', escape);
      overlay.addEventListener(lifecycle(overlay, 'DidDismiss'), close, { once: true });
      const stopBreakpoint =
        presentation.kind === 'sheet' ? syncModalBreakpoint(overlay as HTMLIonModalElement, plugin, connection.id) : undefined;
      connection.stopEvents = () => {
        win.document.removeEventListener('keydown', escape);
        overlay.removeEventListener(lifecycle(overlay, 'DidDismiss'), close);
        stopBreakpoint?.();
      };
      await plugin.presentOverlay({ id: connection.id });
      (focused?.isConnected && focused.ownerDocument === win.document ? focused : content.root).focus({ preventScroll: true });
    } catch (error) {
      await release(connection);
      console.error('Native overlay projection failed; keeping Ionic content in the source WebView.', error);
    }
  };
  const present = (event: Event) => {
    const overlay = event.target as Overlay;
    const autoHeight =
      overlay.localName === 'ion-modal' && doc.defaultView!.getComputedStyle(overlay).getPropertyValue('--height').trim() === 'auto';
    if (current) {
      const connection = current;
      current = undefined;
      opening = opening.then(() => release(connection)).catch(console.error);
      if (!connection.dismissed) return;
      // A didDismiss handler may immediately open the next modal while UIKit is still closing this one.
      connection.stopAnimation?.();
      connection.stopAnimation = undefined;
    }
    const enabled =
      (overlay.localName === 'ion-modal' && options.controls?.modal === true) ||
      (overlay.localName === 'ion-popover' && options.controls?.popover === true) ||
      (overlay.localName === 'ion-alert' && options.controls?.alert === true);
    if (stopped || suspensions.size || !enabled || autoHeight || excluded(overlay)) {
      opening = opening.then(restoreWeb).catch(console.error);
      return;
    }
    const connection: Connection = { id: `ios-theme-overlay-${++sequence}`, overlay, dismissed: false, focus: activeElement(doc) };
    const presentation: Presentation =
      overlay.localName === 'ion-modal'
        ? modalPresentation(overlay as HTMLIonModalElement)
        : overlay.localName === 'ion-alert'
          ? { kind: 'alert', animated: overlay.animated }
          : { kind: 'popover', animated: overlay.animated };
    current = connection;
    connection.releaseProjection = retainProjection();
    const closed = () => {
      connection.dismissed = true;
    };
    overlay.addEventListener(lifecycle(overlay, 'DidDismiss'), closed, { once: true });
    let resolveReady!: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const ready = () => {
      resolveReady();
    };
    const closeNative = (gesture = false) =>
      (connection.nativeClosing ??= plugin.dismissOverlay({ id: connection.id, animated: presentation.animated, gesture }));
    if (presentation.kind === 'popover' || presentation.kind === 'alert') {
      connection.stopAnimation = nativeDialogAnimation(overlay as HTMLIonPopoverElement | HTMLIonAlertElement, closeNative);
    } else {
      const animation = nativeModalAnimation(overlay as HTMLIonModalElement, connection.id, presentation.kind, closeNative);
      connection.stopAnimation = () => animation.stop(connection.dismissed);
    }
    overlay.addEventListener(lifecycle(overlay, 'DidPresent'), ready, { once: true });
    connection.stopLifecycle = () => overlay.removeEventListener(lifecycle(overlay, 'DidDismiss'), closed);
    opening = opening
      .then(() => connect(connection, readyPromise, presentation))
      .catch(console.error)
      .finally(() => {
        overlay.removeEventListener(lifecycle(overlay, 'DidPresent'), ready);
      });
  };
  const observe = (target: Document) => {
    for (const name of events) target.addEventListener(name, present);
    return () => {
      for (const name of events) target.removeEventListener(name, present);
    };
  };
  const listener = await plugin.addListener('overlay', (event) => {
    if (event.id !== current?.id) return;
    if (event.action === 'dismiss') {
      const popover = current.overlay.localName === 'ion-popover';
      if (!popover || current.overlay.backdropDismiss)
        void current.overlay.dismiss(undefined, popover ? 'backdrop' : 'gesture').catch(console.error);
    } else if (event.breakpoint !== undefined && current.overlay.localName === 'ion-modal')
      void (current.overlay as HTMLIonModalElement).setCurrentBreakpoint(event.breakpoint).catch(console.error);
  });
  const stopEvents = observe(doc);
  return {
    async suspend() {
      const lease = Symbol();
      suspensions.add(lease);
      await opening;
      await restoreWeb();
      return () => {
        suspensions.delete(lease);
      };
    },
    async destroy() {
      stopped = true;
      stopEvents();
      try {
        await opening;
        await restoreWeb();
      } finally {
        try {
          await plugin.stopOverlays();
        } finally {
          await listener.remove();
        }
      }
    },
  };
};
