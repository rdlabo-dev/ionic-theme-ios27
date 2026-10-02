import type { NativeUIShellPlugin } from '../definitions';
import { activeElement, trapFocus } from './focus';
import { relayModal } from './modal';
import { relayStyles } from './styles';

type Modal = HTMLIonModalElement;

interface Connection {
  id: string;
  overlay: Modal;
  win?: Window;
  focus: Element | null;
  stopStyles?: () => void;
  stopContent?: () => void;
  stopFocus?: () => void;
  stopEvents?: () => void;
  closing?: Promise<void>;
}

/** Ionic owns lifecycle and dismissal; the controller owns the relay resources. */
export const createOverlayController = (doc: Document, plugin: NativeUIShellPlugin) => {
  const stack: Connection[] = [];
  let opening = Promise.resolve();
  let sequence = 0;
  let stopped = false;
  const suspensions = new Set<symbol>();
  const events = ['Modal', 'Popover', 'Alert', 'ActionSheet', 'Loading', 'Picker', 'Toast'].map((name) => `ion${name}WillPresent`);
  events.push('ionMenuWillOpen');
  const release = (connection: Connection): Promise<void> => (connection.closing ??= cleanup(connection));
  const cleanup = async (connection: Connection) => {
    connection.stopEvents?.();
    connection.stopFocus?.();
    connection.stopContent?.();
    connection.stopStyles?.();
    await plugin.closeOverlay({ id: connection.id });
    connection.win?.close();
    const index = stack.indexOf(connection);
    if (index >= 0) stack.splice(index, 1);
    const focus = connection.focus as HTMLElement | null;
    if (focus?.isConnected && focus.tabIndex >= 0) focus.focus({ preventScroll: true });
  };
  const connect = async (overlay: Modal, presented: () => boolean, dismissed: () => boolean) => {
    if (stopped || suspensions.size || dismissed() || !overlay.isConnected) return;
    const opener = stack[stack.length - 1]?.win ?? doc.defaultView!;
    const connection: Connection = { id: `ios-theme-overlay-${++sequence}`, overlay, focus: activeElement(opener.document) };
    stack.push(connection);
    try {
      await plugin.prepareOverlay({ id: connection.id });
      const win = opener.open('about:blank', '_blank');
      if (!win) throw new Error('Native overlay window unavailable');
      connection.win = win;
      const environment = relayStyles(doc, win.document, overlay);
      connection.stopStyles = environment.stop;
      await plugin.presentOverlay({ id: connection.id });
      if (stopped || suspensions.size || dismissed() || !overlay.isConnected) {
        await release(connection);
        return;
      }
      const content = relayModal(overlay, environment.destination, !presented());
      connection.stopContent = content.stop;
      connection.stopFocus = trapFocus(
        content.root,
        () =>
          stack[stack.length - 1] === connection &&
          !dismissed() &&
          overlay.focusTrap !== false &&
          !overlay.classList.contains('ion-disable-focus-trap'),
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
    const overlay = event.target as Modal;
    const autoHeight =
      overlay.localName === 'ion-modal' && doc.defaultView!.getComputedStyle(overlay).getPropertyValue('--height').trim() === 'auto';
    if (overlay.localName !== 'ion-modal' || overlay.breakpoints?.length || autoHeight) {
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
        connect(
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
  const restoreWeb = async () => {
    for (const connection of [...stack].reverse()) await release(connection);
  };
  for (const name of events) doc.addEventListener(name, present);
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
      for (const name of events) doc.removeEventListener(name, present);
      await opening;
      await restoreWeb();
      await plugin.stopOverlays();
    },
  };
};
