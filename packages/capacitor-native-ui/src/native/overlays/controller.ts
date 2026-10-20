import type { NativeUIOptions, NativeUIPlugin } from '../definitions';
import { bounded, boundedListener } from '../shared/bridge';
import { isExcluded, isPermanentlyExcluded, isNativeUIDisabled } from '../shared/dom';
import { activeElement, trapFocus } from './focus';
import { relayPopover, popoverPresentation, verticalBarsPopoverAnchor } from './popover';
import { nativeDialogAnimation } from './dialog-animation';
import { relayLayoutSupported, relayStyles } from './styles';
import { moveContent } from './content';
import { validVerticalBarFrame } from '../shared/vertical-bars-geometry';

type Presentation = { kind: 'popover'; animated: boolean };
type Overlay = HTMLIonPopoverElement;
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
  stopContent?: () => void;
  stopFocus?: () => void;
  stopEvents?: () => void;
  stopChildEvents?: () => void;
  stopExclusions?: () => void;
  closing?: Promise<void>;
  nativeClosing?: Promise<void>;
  stopAnimation?: () => void;
  hideAnimation?: () => void;
  stopLifecycle?: () => void;
}

/** Ionic owns lifecycle and dismissal; only one overlay is relayed at a time. */
export const createOverlayController = async (
  doc: Document,
  plugin: NativeUIPlugin,
  options: NativeUIOptions,
  retainProjection: (deferActivation?: (id: string) => boolean) => () => void,
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
  const excluded = (overlay: HTMLElement) => isPermanentlyExcluded(overlay) || isExcluded(overlay) || isNativeUIDisabled(overlay);
  const connect = async (connection: Connection, ready: Promise<void>, presentation: Presentation) => {
    const { overlay } = connection;
    const gone = () =>
      current !== connection ||
      stopped ||
      suspensions.size ||
      connection.dismissed ||
      !overlay.isConnected ||
      !nativeVerticalBars() ||
      excluded(overlay);
    // Keep the source invisible while the native toolbar prepares its popover.
    connection.hideAnimation?.();
    try {
      // Prepare the child window concurrently with Ionic's content initialization.
      const staging = (async () => {
        await bounded(
          plugin.prepareOverlay({
            id: connection.id,
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
        // about:blank is a quirks-mode document in WebKit. Initialize standards
        // mode before adopting live content: otherwise percentage button heights
        // can resolve against the entire popover viewport.
        win.document.open();
        win.document.write('<!doctype html><html><head></head><body></body></html>');
        win.document.close();
        connection.stopChildEvents = observe(win.document);
        const environment = relayStyles(doc, win.document, overlay, () => {
          if (connection.stopContent) void release(connection).catch(console.error);
        });
        connection.stopStyles = environment.stop;
        await bounded(environment.ready);
        if (gone()) return undefined;
        return { destination: environment.destination, win };
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
      const nativePresentation = popoverPresentation(overlay);
      const content = relayPopover(overlay, staged.destination);
      connection.stopContent = content.stop;
      if (!relayLayoutSupported(overlay) || !content.matchesSourceAppearance()) {
        await release(connection);
        return;
      }
      connection.hideAnimation?.();
      // Ionic does not dismiss a presented overlay when its page is hidden or
      // destroyed; without this a popover could retain the page projections
      // forever and freeze every later control update.
      const exclusions = new MutationObserver(() => {
        if (!overlay.isConnected || !nativeVerticalBars() || excluded(overlay) || isNativeUIDisabled(content.root))
          void release(connection).catch(console.error);
      });
      const attributes = { attributes: true, attributeFilter: ['class', 'data-native-ui', 'hidden', 'inert'] };
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
        if (event.key === 'Escape' && overlay.backdropDismiss) void overlay.dismiss(undefined, 'backdrop');
      };
      staged.win.document.addEventListener('keydown', escape);
      overlay.addEventListener(lifecycle(overlay, 'DidDismiss'), close, { once: true });
      connection.stopEvents = () => {
        staged.win.document.removeEventListener('keydown', escape);
        overlay.removeEventListener(lifecycle(overlay, 'DidDismiss'), close);
      };
      // SwiftUI owns the only visible presentation animation.
      await bounded(
        plugin.presentOverlay({
          id: connection.id,
          presentation: { ...nativePresentation, animated: presentation.animated },
        }),
      );
      (focused?.isConnected && focused.ownerDocument === staged.win.document ? focused : content.root).focus({ preventScroll: true });
    } catch (error) {
      await release(connection);
      console.error('Native overlay projection failed; keeping Ionic content in the source WebView.', error);
    }
  };
  const present = (event: Event) => {
    const overlay = event.target as Overlay;
    if (current) {
      const connection = current;
      const fromChild = overlay.ownerDocument === connection.win?.document;
      if (fromChild) {
        // A child-document overlay may be a sibling of the relayed content.
        // Move it before cleanup closes that document; keep the live node,
        // component handlers and adopted shadow styles in the source WebView.
        moveContent([overlay], doc.querySelector<HTMLElement>('ion-app') ?? doc.body);
      }
      current = undefined;
      opening = opening.then(() => release(connection)).catch(console.error);
      // The original event path still belongs to the child document. Let the
      // source runtime observe presentation before releasing retained controls.
      if (fromChild) doc.dispatchEvent(new CustomEvent('nativeUIOverlayAdopted', { detail: overlay }));
      if (!connection.dismissed) return;
      // A didDismiss handler may immediately open the next popover while SwiftUI is still closing this one.
      connection.stopAnimation?.();
      connection.stopAnimation = undefined;
    }
    const enabled =
      overlay.localName === 'ion-popover' &&
      overlay.mode !== 'md' &&
      !overlay.classList.contains('md') &&
      options.controls?.popover === true &&
      nativeVerticalBars() &&
      verticalBarsPopoverAnchor(overlay) !== undefined;
    if (stopped || suspensions.size || !enabled || excluded(overlay)) {
      opening = opening.then(restoreWeb).catch(console.error);
      return;
    }
    const connection: Connection = { id: `ios-theme-overlay-${++sequence}`, overlay, dismissed: false, focus: activeElement(doc) };
    const presentation: Presentation = { kind: 'popover', animated: overlay.animated };
    current = connection;
    // Retain synchronously, before the scheduled projection update can retire the rail.
    const anchorId = verticalBarsPopoverAnchor(overlay);
    connection.releaseProjection = retainProjection(
      (id) =>
        id === anchorId &&
        current === connection &&
        !!connection.nativeClosing &&
        !stopped &&
        !suspensions.size &&
        nativeVerticalBars() &&
        !excluded(overlay),
    );
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
    const closeNative = () =>
      (connection.nativeClosing ??= bounded(plugin.dismissOverlay({ id: connection.id, animated: presentation.animated })));
    const viewport = `${win.innerWidth}:${win.innerHeight}`;
    const anchor = bounded(plugin.getVerticalBarsGeometry({ viewportWidth: win.innerWidth, ids: [anchorId!] }))
      .then(({ items }) => {
        const frame = items[anchorId!];
        return frame && validVerticalBarFrame(frame) && viewport === `${win.innerWidth}:${win.innerHeight}` ? frame : undefined;
      })
      .catch(() => undefined);
    const animation = nativeDialogAnimation(overlay, closeNative, anchor);
    connection.stopAnimation = animation.stop;
    connection.hideAnimation = animation.hide;
    animation.hide();
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
  const invalidate = () => {
    const connection = current;
    current = undefined;
    if (connection) opening = opening.then(() => release(connection)).catch(console.error);
  };
  // Retention must not freeze an obsolete layout or a departed page.
  const win = doc.defaultView!;
  const visibility = () => {
    if (doc.hidden) invalidate();
  };
  const listener = await boundedListener(
    plugin.addListener('overlay', (event) => {
      if (event.id !== current?.id) return;
      if (event.action === 'dismiss' && current.overlay.backdropDismiss)
        void current.overlay.dismiss(undefined, 'backdrop').catch(console.error);
    }),
  );
  win.addEventListener('resize', invalidate);
  doc.addEventListener('ionViewWillLeave', invalidate);
  doc.addEventListener('visibilitychange', visibility);
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
      win.removeEventListener('resize', invalidate);
      doc.removeEventListener('ionViewWillLeave', invalidate);
      doc.removeEventListener('visibilitychange', visibility);
      try {
        await opening;
        await restoreWeb();
      } finally {
        try {
          await bounded(plugin.stopOverlays());
        } finally {
          await bounded(listener.remove());
        }
      }
    },
  };
};
