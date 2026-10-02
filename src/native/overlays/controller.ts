import type { NativeUIShellPlugin } from '../definitions';
import { isPermanentlyExcluded, isShellDisabled } from '../shared/dom';
import { activeElement, trapFocus } from './focus';
import { relayModal } from './modal';
import { relayStyles } from './styles';

interface Connection {
  id: string;
  win?: Window;
  focus: Element | null;
  stopStyles?: () => void;
  stopContent?: () => void;
  stopFocus?: () => void;
  stopEvents?: () => void;
  stopChildEvents?: () => void;
  stopExclusions?: () => void;
  closing?: Promise<void>;
}

/** Ionic owns lifecycle and dismissal; only one overlay is relayed at a time. */
export const createOverlayController = (doc: Document, plugin: NativeUIShellPlugin) => {
  let current: Connection | undefined;
  let opening = Promise.resolve();
  let sequence = 0;
  let stopped = false;
  const suspensions = new Set<symbol>();
  const events = ['Modal', 'Popover', 'Alert', 'ActionSheet', 'Loading', 'Picker', 'Toast'].map((name) => `ion${name}WillPresent`);
  const cleanup = async (connection: Connection) => {
    connection.stopEvents?.();
    connection.stopChildEvents?.();
    connection.stopExclusions?.();
    connection.stopFocus?.();
    connection.stopContent?.();
    connection.stopStyles?.();
    try {
      await plugin.closeOverlay({ id: connection.id });
    } finally {
      connection.win?.close();
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
  const connect = async (overlay: HTMLIonModalElement, presented: () => boolean, dismissed: () => boolean) => {
    if (stopped || suspensions.size || dismissed() || !overlay.isConnected || excluded(overlay)) return;
    const connection: Connection = { id: `ios-theme-overlay-${++sequence}`, focus: activeElement(doc) };
    current = connection;
    try {
      await plugin.prepareOverlay({ id: connection.id });
      if (current !== connection || stopped || suspensions.size || dismissed() || excluded(overlay)) {
        await release(connection);
        return;
      }
      const win = doc.defaultView!.open(`about:blank#${connection.id}`, '_blank');
      if (!win) throw new Error('Native overlay window unavailable');
      connection.win = win;
      connection.stopChildEvents = observe(win.document);
      const environment = relayStyles(doc, win.document, overlay);
      connection.stopStyles = environment.stop;
      await plugin.presentOverlay({ id: connection.id });
      if (current !== connection || stopped || suspensions.size || dismissed() || !overlay.isConnected || excluded(overlay)) {
        await release(connection);
        return;
      }
      const content = relayModal(overlay, environment.destination, !presented());
      connection.stopContent = content.stop;
      const exclusions = new MutationObserver(() => {
        if (excluded(overlay) || isShellDisabled(content.root)) void release(connection).catch(console.error);
      });
      const attributes = { attributes: true, attributeFilter: ['class', 'data-shell', 'hidden', 'inert'] };
      for (let node: HTMLElement | null = overlay; node; node = node.parentElement) exclusions.observe(node, attributes);
      exclusions.observe(content.root, { ...attributes, subtree: true });
      connection.stopExclusions = () => exclusions.disconnect();
      connection.stopFocus = trapFocus(
        content.root,
        () => !dismissed() && overlay.focusTrap !== false && !overlay.classList.contains('ion-disable-focus-trap'),
      );
      const close = () => {
        void release(connection).catch(console.error);
      };
      overlay.addEventListener('ionModalDidDismiss', close, { once: true });
      connection.stopEvents = () => overlay.removeEventListener('ionModalDidDismiss', close);
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
      return;
    }
    if (
      overlay.localName !== 'ion-modal' ||
      overlay.presentingElement !== undefined ||
      overlay.breakpoints?.length ||
      autoHeight ||
      excluded(overlay)
    ) {
      opening = opening.then(restoreWeb).catch(console.error);
      return;
    }
    let presented = false;
    let dismissed = false;
    const closed = () => {
      dismissed = true;
    };
    overlay.addEventListener('ionModalDidDismiss', closed, { once: true });
    const ready = () => {
      presented = true;
    };
    overlay.addEventListener('ionModalDidPresent', ready, { once: true });
    opening = opening
      .then(() =>
        current
          ? restoreWeb()
          : connect(
              overlay,
              () => presented,
              () => dismissed,
            ),
      )
      .catch(console.error)
      .finally(() => {
        overlay.removeEventListener('ionModalDidPresent', ready);
        overlay.removeEventListener('ionModalDidDismiss', closed);
      });
  };
  const observe = (target: Document) => {
    for (const name of events) target.addEventListener(name, present);
    return () => {
      for (const name of events) target.removeEventListener(name, present);
    };
  };
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
        await plugin.stopOverlays();
      }
    },
  };
};
