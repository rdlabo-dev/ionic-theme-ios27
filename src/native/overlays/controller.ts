import type { NativeUIShellOptions, NativeUIShellPlugin, ShellModalPresentation } from '../definitions';
import { bounded } from '../runtime';
import { isExcluded, isPermanentlyExcluded, isShellDisabled } from '../shared/dom';
import { relayVerticalBars } from './vertical-bars';
import { activeElement, trapFocus } from './focus';
import { relayModal } from './modal';
import { relayPopover, popoverPresentation, popoverAnchorCapsule } from './popover';
import { relayAlert } from './alert';
import { nativeDialogAnimation } from './dialog-animation';
import { overlaySnapshot } from './snapshot';
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
  stopAnchor?: () => void;
  closing?: Promise<void>;
  nativeClosing?: Promise<void>;
  stopAnimation?: () => void;
  hideAnimation?: () => void;
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
    // Every teardown step is isolated and bounded: a throwing or hanging step
    // must not strand the retained page projections or the child window.
    const stage = async (label: string, run?: () => void | Promise<void>) => {
      try {
        await bounded(Promise.resolve(run?.()));
      } catch (error) {
        console.error(`Native overlay teardown failed at ${label}; continuing cleanup anyway.`, error);
      }
    };
    try {
      await stage('events', connection.stopEvents);
      await stage('lifecycle', connection.stopLifecycle);
      await stage('childEvents', connection.stopChildEvents);
      await stage('exclusions', connection.stopExclusions);
      await stage('focus', connection.stopFocus);
      // A timed-out dismissal must not strand the relayed content in the child window.
      await connection.nativeClosing?.catch((error) => {
        console.error('Native overlay dismissal did not complete; restoring the Web content anyway.', error);
      });
      await stage('anchor', connection.stopAnchor);
      await stage('verticalBars', connection.stopVerticalBars);
      await stage('content', connection.stopContent);
      await stage('animation', connection.stopAnimation);
      await stage('styles', connection.stopStyles);
      await stage('close', () => bounded(plugin.closeOverlay({ id: connection.id })));
    } finally {
      // The page projections must be released even if teardown throws above.
      connection.releaseProjection?.();
      connection.releaseProjection = undefined;
      try {
        connection.win?.close();
      } catch (error) {
        console.error('Native overlay window was already gone.', error);
      }
      if (current === connection) current = undefined;
      const focus = connection.focus as HTMLElement | null;
      if (focus?.isConnected && focus.tabIndex >= 0) focus.focus({ preventScroll: true });
    }
  };
  const release = (connection: Connection): Promise<void> => (connection.closing ??= cleanup(connection));
  const restoreWeb = async () => {
    if (current) await release(current);
  };
  const excluded = (overlay: HTMLElement) => isPermanentlyExcluded(overlay) || isExcluded(overlay) || isShellDisabled(overlay);
  const connect = async (connection: Connection, ready: Promise<void>, presentation: Presentation) => {
    const { overlay } = connection;
    const gone = () =>
      current !== connection || stopped || suspensions.size || connection.dismissed || !overlay.isConnected || excluded(overlay);
    // A popover presents exactly once, natively: anchored ones morph out of the
    // projected control and the rest use UIKit's own popover animation. Playing
    // the Web enter underneath would flicker or jump position at the swap.
    if (presentation.kind === 'popover') connection.hideAnimation?.();
    try {
      // Ionic's own enter animation covers the wait; spin up the child window
      // underneath it so the handoff is ready when didPresent lands.
      const staging = (async () => {
        // Full presentation details (post-layout geometry included) are applied
        // natively at snapshot/present time; prepare only needs the modal shape.
        await bounded(
          plugin.prepareOverlay({
            id: connection.id,
            presentation: presentation.kind === 'popover' ? undefined : presentation,
          }),
        );
        if (gone()) return undefined;
        const win = doc.defaultView!.open(`about:blank#${connection.id}`, '_blank');
        if (!win) throw new Error('Native overlay window unavailable');
        connection.win = win;
        // The requested blank page replaces the initial document created by window.open.
        // WebKit percent-encodes the '#' marker in the popup URL; compare decoded.
        // Adopt nodes only after that navigation; otherwise WebKit discards the relay.
        if (decodeURIComponent(win.document.URL) !== `about:blank#${connection.id}` || win.document.readyState !== 'complete')
          await bounded(new Promise<void>((resolve) => win.addEventListener('load', () => resolve(), { once: true })));
        if (gone()) return undefined;
        connection.stopChildEvents = observe(win.document);
        const verticalBars = nativeVerticalBars() && overlay.classList.contains('ios-theme-vertical-bars-modal');
        const environment = relayStyles(doc, win.document, overlay, verticalBars);
        connection.stopStyles = environment.stop;
        return { destination: environment.destination, verticalBars, win };
      })();
      // The staging join is awaited below; settle early rejections quietly.
      staging.catch(() => {});
      // Ionic initializes its gestures after didPresent. Let that turn finish before adopting their content.
      // A stalled presentation must not park the opening queue forever.
      await bounded(ready);
      // Placement is captured after Ionic has laid out the overlay.
      await bounded(new Promise<void>((resolve) => doc.defaultView!.requestAnimationFrame(() => resolve())));
      const staged = await staging;
      if (gone() || !staged) {
        await release(connection);
        return;
      }
      const focused = activeElement(doc) as HTMLElement | null;
      const nativePresentation = presentation.kind === 'popover' ? popoverPresentation(overlay as HTMLIonPopoverElement) : presentation;
      // Freeze the rendered overlay so the native surface can swap identical
      // pixels in instantly instead of replaying an opening animation. Popovers
      // are hidden from the start and animate natively, so there is nothing to
      // freeze.
      const snapshot = presentation.kind === 'popover' ? undefined : overlaySnapshot(overlay);
      if (snapshot) {
        try {
          await bounded(plugin.snapshotOverlay({ id: connection.id, presentation: nativePresentation, ...snapshot }));
        } catch (error) {
          console.warn('Native overlay snapshot unavailable; presenting without it.', error);
        }
      }
      if (gone()) {
        await release(connection);
        return;
      }
      const content =
        presentation.kind === 'popover'
          ? relayPopover(overlay as HTMLIonPopoverElement, staged.destination)
          : presentation.kind === 'alert'
            ? relayAlert(overlay as HTMLIonAlertElement, staged.destination)
            : relayModal(overlay as HTMLIonModalElement, staged.destination, presentation.kind);
      connection.stopContent = content.stop;
      // The morph covers the projected control; also hide its Web capsule —
      // the ion-buttons backdrop-filter pill is a padding ring wider than the
      // projected button and would peek out of the surface's rounded corner.
      if (presentation.kind === 'popover' && (nativePresentation as { anchorId?: string }).anchorId) {
        const capsule = popoverAnchorCapsule(overlay as HTMLIonPopoverElement);
        if (capsule) {
          const visibility = capsule.style.visibility;
          capsule.style.visibility = 'hidden';
          connection.stopAnchor = () => {
            capsule.style.visibility = visibility;
          };
        }
      }
      connection.hideAnimation?.();
      // Release the source document's captured placement before the relay takes ownership.
      doc.defaultView!.dispatchEvent(new Event('nativeUIShellRefresh'));
      if (staged.verticalBars)
        connection.stopVerticalBars = await bounded(relayVerticalBars(staged.win.document, plugin, options, connection.id));
      if (gone()) {
        await release(connection);
        return;
      }
      // Ionic does not dismiss a presented overlay when its page is hidden or
      // destroyed; without this a popover could retain the page projections
      // forever and freeze every later control update.
      const exclusions = new MutationObserver(() => {
        if (!overlay.isConnected || excluded(overlay) || isShellDisabled(content.root)) void release(connection).catch(console.error);
      });
      const attributes = { attributes: true, attributeFilter: ['class', 'data-shell', 'hidden', 'inert'] };
      for (let node: HTMLElement | null = overlay; node; node = node.parentElement) {
        exclusions.observe(node, attributes);
        exclusions.observe(node, { childList: true });
      }
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
      staged.win.document.addEventListener('keydown', escape);
      overlay.addEventListener(lifecycle(overlay, 'DidDismiss'), close, { once: true });
      const stopBreakpoint =
        presentation.kind === 'sheet' ? syncModalBreakpoint(overlay as HTMLIonModalElement, plugin, connection.id) : undefined;
      connection.stopEvents = () => {
        staged.win.document.removeEventListener('keydown', escape);
        overlay.removeEventListener(lifecycle(overlay, 'DidDismiss'), close);
        stopBreakpoint?.();
      };
      // The Web enter animation already played; swap to the hosted window instantly.
      // Popovers never played a Web enter; they animate on the native side
      // instead (anchored morph or UIKit's own popover presentation).
      await bounded(
        plugin.presentOverlay({
          id: connection.id,
          presentation: { ...nativePresentation, animated: presentation.kind === 'popover' ? presentation.animated : false },
        }),
      );
      // Let the hosted document paint one frame before uncovering the frozen image.
      await bounded(new Promise<void>((resolve) => staged.win.document.defaultView!.requestAnimationFrame(() => resolve()))).catch(
        () => {},
      );
      await bounded(plugin.revealOverlay({ id: connection.id })).catch(() => {});
      (focused?.isConnected && focused.ownerDocument === staged.win.document ? focused : content.root).focus({ preventScroll: true });
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
    // A covering overlay lets the page projections retire at willPresent as
    // usual; only a popover keeps them — its page stays visible and the morph
    // needs the projected anchor alive.
    if (presentation.kind === 'popover') connection.releaseProjection = retainProjection();
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
      (connection.nativeClosing ??= bounded(plugin.dismissOverlay({ id: connection.id, animated: presentation.animated, gesture })));
    if (presentation.kind === 'popover' || presentation.kind === 'alert') {
      const animation = nativeDialogAnimation(overlay as HTMLIonPopoverElement | HTMLIonAlertElement, closeNative);
      connection.stopAnimation = animation.stop;
      connection.hideAnimation = animation.hide;
    } else {
      const animation = nativeModalAnimation(overlay as HTMLIonModalElement, connection.id, presentation.kind, closeNative);
      connection.stopAnimation = () => animation.stop(connection.dismissed);
      connection.hideAnimation = animation.hide;
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
  const menuOpen = (event: Event) => {
    if (!event.composedPath().some((node): node is HTMLElement => node instanceof HTMLElement && node.matches('ion-menu'))) return;
    // Menus render in the source document below the native overlay; release the relay.
    const connection = current;
    current = undefined;
    if (connection) opening = opening.then(() => release(connection)).catch(console.error);
  };
  const observe = (target: Document) => {
    for (const name of events) target.addEventListener(name, present);
    target.addEventListener('ionWillOpen', menuOpen);
    return () => {
      for (const name of events) target.removeEventListener(name, present);
      target.removeEventListener('ionWillOpen', menuOpen);
    };
  };
  const listener = await bounded(
    plugin.addListener('overlay', (event) => {
      if (event.id !== current?.id) return;
      if (event.action === 'dismiss') {
        const popover = current.overlay.localName === 'ion-popover';
        if (!popover || current.overlay.backdropDismiss)
          void current.overlay.dismiss(undefined, popover ? 'backdrop' : 'gesture').catch(console.error);
      } else if (event.breakpoint !== undefined && current.overlay.localName === 'ion-modal')
        void (current.overlay as HTMLIonModalElement).setCurrentBreakpoint(event.breakpoint).catch(console.error);
    }),
  );
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
          await bounded(plugin.stopOverlays());
        } finally {
          await listener.remove();
        }
      }
    },
  };
};
