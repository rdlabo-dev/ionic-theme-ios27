import type { NativeUIShellOptions, NativeUIShellPlugin, ShellModalPresentation } from '../definitions';
import { isPermanentlyExcluded, isShellDisabled } from '../shared/dom';
import { relayVerticalBars } from './vertical-bars';
import { activeElement, trapFocus } from './focus';
import { relayModal } from './modal';
import { relayStyles } from './styles';
import { modalPresentation, syncModalBreakpoint } from './modal-presentation';
import { nativeModalAnimation } from './modal-animation';

interface Connection {
  id: string;
  overlay: HTMLIonModalElement;
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
  const connect = async (connection: Connection, ready: Promise<void>, presentation: ShellModalPresentation) => {
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
      await plugin.prepareOverlay({ id: connection.id, presentation });
      if (current !== connection || stopped || suspensions.size || connection.dismissed || excluded(overlay)) {
        await release(connection);
        return;
      }
      const win = doc.defaultView!.open(`about:blank#${connection.id}`, '_blank');
      if (!win) throw new Error('Native overlay window unavailable');
      connection.win = win;
      connection.stopChildEvents = observe(win.document);
      const verticalBars = nativeVerticalBars() && overlay.classList.contains('ios-theme-vertical-bars-modal');
      const environment = relayStyles(doc, win.document, overlay, verticalBars);
      connection.stopStyles = environment.stop;
      if (current !== connection || stopped || suspensions.size || connection.dismissed || !overlay.isConnected || excluded(overlay)) {
        await release(connection);
        return;
      }
      const content = relayModal(overlay, environment.destination, presentation.kind);
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
        () => !connection.dismissed && overlay.focusTrap !== false && !overlay.classList.contains('ion-disable-focus-trap'),
      );
      const close = () => {
        void release(connection).catch(console.error);
      };
      overlay.addEventListener('ionModalDidDismiss', close, { once: true });
      const stopBreakpoint = presentation.kind === 'sheet' ? syncModalBreakpoint(overlay, plugin, connection.id) : undefined;
      connection.stopEvents = () => {
        overlay.removeEventListener('ionModalDidDismiss', close);
        stopBreakpoint?.();
      };
      await plugin.presentOverlay({ id: connection.id });
    } catch (error) {
      await release(connection);
      console.error('Native overlay projection failed; keeping Ionic content in the source WebView.', error);
    }
  };
  const present = (event: Event) => {
    const overlay = event.target as HTMLIonModalElement;
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
    if (stopped || suspensions.size || overlay.localName !== 'ion-modal' || autoHeight || excluded(overlay)) {
      opening = opening.then(restoreWeb).catch(console.error);
      return;
    }
    const connection: Connection = { id: `ios-theme-overlay-${++sequence}`, overlay, dismissed: false, focus: activeElement(doc) };
    const presentation = modalPresentation(overlay);
    current = connection;
    connection.releaseProjection = retainProjection();
    const closed = () => {
      connection.dismissed = true;
    };
    overlay.addEventListener('ionModalDidDismiss', closed, { once: true });
    let resolveReady!: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const ready = () => {
      resolveReady();
    };
    const animation = nativeModalAnimation(
      overlay,
      connection.id,
      presentation.kind,
      (gesture) => (connection.nativeClosing ??= plugin.dismissOverlay({ id: connection.id, animated: presentation.animated, gesture })),
    );
    connection.stopAnimation = () => animation.stop(connection.dismissed);
    overlay.addEventListener('ionModalDidPresent', ready, { once: true });
    connection.stopLifecycle = () => overlay.removeEventListener('ionModalDidDismiss', closed);
    opening = opening
      .then(() => connect(connection, readyPromise, presentation))
      .catch(console.error)
      .finally(() => {
        overlay.removeEventListener('ionModalDidPresent', ready);
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
    if (event.action === 'dismiss') void current.overlay.dismiss(undefined, 'gesture').catch(console.error);
    else if (event.breakpoint !== undefined) void current.overlay.setCurrentBreakpoint(event.breakpoint).catch(console.error);
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
