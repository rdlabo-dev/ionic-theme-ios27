import { enableSupportIonicOverlays, ionicModalStack } from '@webview-native-ui/engine/ionic';
import type { Frame } from '../definitions';
import { prepareSheetLayout, readModalAnimation, type ModalAnimation } from './modal-animation';

/** Modal hosts cover the viewport even when their visible dialog is centered. */
export const modalRailClass = 'ios-theme-vertical-bars-modal';
const presentations = new WeakMap<Element, { animation: ModalAnimation; frame: Frame } | null>();
export const modalPresentation = (modal: Element) => presentations.get(modal);
export const modalPreparing = (modal: Element) => presentations.has(modal) && presentations.get(modal) === null;

const dismissing = new WeakSet<Element>();
export const modalDismissing = (modal: Element) => dismissing.has(modal);
interface ModalState {
  top?: HTMLIonModalElement;
  moving?: HTMLIonModalElement;
  stack: HTMLIonModalElement[];
}
const states = new WeakMap<Document, ModalState>();
export const modalStack = (doc: Document): readonly HTMLIonModalElement[] => states.get(doc)?.stack ?? [];
export const movingModal = (doc: Document) => states.get(doc)?.moving;
export const modalMotionEvent = 'nativeUIModalMotion';

export const topModal = (doc: Document): HTMLIonModalElement | undefined => states.get(doc)?.top;
export const modalUsesVerticalBars = (element: Element): boolean => {
  const modal = element.closest('ion-modal');
  return !modal || modal.classList.contains(modalRailClass);
};

/** Only the foreground modal may contribute controls; never the covered page. */
export const inVerticalBarsSurface = (element: Element): boolean => {
  const modal = topModal(element.ownerDocument);
  return modal ? element.closest('ion-modal') === modal && modalUsesVerticalBars(element) : !element.closest('ion-modal');
};

/** Release Ionic's dormant sheet gesture effect before the leave animation owns opacity.
 * WillDismiss is emitted only after canDismiss succeeds. A gesture dismissal already
 * owns its animation and must not be interrupted. Match only Ionic's standard
 * opacity-only keyframes; leave running and nonmatching effects alone.
 */
export const releaseSheetBackdropGesture = (modal: HTMLElement, role?: string): void => {
  if (role === 'gesture' || !modal.matches('.modal-sheet.ios-theme-vertical-bars-modal')) return;
  const backdrop = modal.shadowRoot?.querySelector('ion-backdrop');
  const breakpoint = (modal as HTMLIonModalElement).backdropBreakpoint ?? 0;
  const expected =
    breakpoint === 0
      ? [
          { offset: 0, opacity: 'var(--backdrop-opacity)' },
          { offset: 1, opacity: '0.01' },
        ]
      : [
          { offset: 0, opacity: 'var(--backdrop-opacity)' },
          { offset: 1 - breakpoint, opacity: '0' },
          { offset: 1, opacity: '0' },
        ];
  for (const animation of backdrop?.getAnimations() ?? []) {
    const effect = animation.effect;
    if (animation.playState !== 'paused' || !(effect instanceof KeyframeEffect)) continue;
    const frames = effect.getKeyframes();
    if (
      effect.target !== backdrop ||
      frames.length !== expected.length ||
      !frames.every(
        (frame, index) =>
          frame.offset === expected[index].offset &&
          frame['opacity'] === expected[index].opacity &&
          frame.easing === 'linear' &&
          (frame.composite === 'auto' || frame.composite === 'replace') &&
          Object.keys(frame).every((key) => ['offset', 'computedOffset', 'easing', 'composite', 'opacity'].includes(key)),
      )
    )
      continue;
    animation.cancel();
  }
};

export const observeVerticalBarsModals = (doc: Document, animate: () => boolean = () => false): (() => void) => {
  const win = doc.defaultView!;
  const state: ModalState = { stack: [] };
  states.set(doc, state);
  const overlays = enableSupportIonicOverlays(undefined, doc)!;
  const observed = new Set<Element>();
  const listeners = new AbortController();
  let stopped = false;
  let frame = 0;
  let pointerActive = false;
  let touchActive = false;
  let bounds = '';
  const toolbarTop = '--ios-theme-vertical-bars-modal-offset-top';
  const refresh = () => {
    win.cancelAnimationFrame(frame);
    frame = 0;
    if (stopped) return;
    const app = doc.querySelector('ion-app.ios-theme-vertical-bars');
    const modals = Array.from(doc.querySelectorAll<HTMLIonModalElement>('ion-modal'));
    const active = ionicModalStack(doc) as HTMLIonModalElement[];
    state.stack = active;
    const top = state.stack[state.stack.length - 1];
    let changed = state.top !== top;
    state.top = top;
    if (top && modalPreparing(top)) {
      const content = top.shadowRoot?.querySelector<HTMLElement>('[part~="content"]');
      if (content?.getAnimations().some((animation) => animation.playState === 'running')) {
        const presentation = readModalAnimation(content);
        if (presentation) {
          prepareSheetLayout(top);
          presentations.set(top, presentation);
        } else presentations.delete(top); // Unsupported custom animations retain the existing projection path.
        changed = true;
      }
    }
    const nextBounds = top && !modalPreparing(top) ? JSON.stringify(modalVerticalBarFrame(top)) : '';
    const moved = bounds !== '' && nextBounds !== '' && bounds !== nextBounds;
    changed ||= bounds !== nextBounds;
    bounds = nextBounds;
    const wrapper = top?.shadowRoot?.querySelector<HTMLElement>('[part~="content"]');
    const animating = wrapper?.getAnimations().some((animation) => animation.playState === 'running') ?? false;
    const moving =
      top &&
      app &&
      !modalPreparing(top) &&
      !modalDismissing(top) &&
      (state.moving === top ? pointerActive || touchActive || animating || moved : moved && (pointerActive || touchActive || animating))
        ? top
        : undefined;
    const wanted = new Set<Element>();
    for (const modal of modals) {
      const content = modal.shadowRoot?.querySelector<HTMLElement>('[part~="content"]');
      if (content) wanted.add(content);
      // offsetWidth is unaffected by Ionic's presentation transforms.
      const fullWidth = !!content && Math.abs(content.offsetWidth - win.innerWidth) <= 1 && Math.abs(content.offsetLeft) <= 1;
      const enabled = !!app?.contains(modal) && active.includes(modal) && fullWidth;
      if (enabled) {
        const top = modalPreparing(modal) ? 0 : (modalVerticalBarFrame(modal)?.y ?? 0);
        const offset = `${top}px`;
        if (modal.style.getPropertyValue(toolbarTop) !== offset) {
          modal.style.setProperty(toolbarTop, offset);
          changed = true;
        }
      } else modal.style.removeProperty(toolbarTop);
      if (modal.classList.contains(modalRailClass) !== enabled) {
        modal.classList.toggle(modalRailClass, enabled);
        changed = true;
      }
    }
    if (state.moving !== moving) {
      const previous = state.moving;
      state.moving = moving;
      win.dispatchEvent(new CustomEvent(modalMotionEvent, { detail: { modal: moving ?? previous, moving: !!moving } }));
      changed = true;
    }
    if (wanted.size !== observed.size || [...wanted].some((element) => !observed.has(element))) {
      resize?.disconnect();
      observer.disconnect();
      observer.observe(doc.documentElement, observation);
      observed.clear();
      for (const element of wanted) {
        resize?.observe(element);
        observer.observe(element, { attributes: true, attributeFilter: ['style', 'class'] });
        observed.add(element);
      }
    }
    if (changed) win.dispatchEvent(new CustomEvent('nativeUIRefresh', { detail: { modalMotion: !!state.moving } }));
    if (
      top &&
      (modalPreparing(top) ||
        (!modalPresentation(top) &&
          (pointerActive ||
            touchActive ||
            !!state.moving ||
            Array.from(wanted).some((element) => element.getAnimations().some((animation) => animation.playState === 'running')))))
    )
      schedule();
  };
  const schedule = () => {
    if (!stopped && !frame) frame = win.requestAnimationFrame(refresh);
  };
  const resize = win.ResizeObserver ? new win.ResizeObserver(schedule) : undefined;
  const observer = new MutationObserver(schedule);
  const observation = { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] };
  observer.observe(doc.documentElement, observation);
  const stopOverlays = overlays.subscribe(({ element, phase, event }) => {
    if (!element?.matches('ion-modal')) {
      if (phase === 'change') refresh();
      return;
    }
    const modal = element as HTMLIonModalElement;
    if (phase === 'willPresent' && animate() && modal.closest('ion-app.ios-theme-vertical-bars')) presentations.set(modal, null);
    else if (phase === 'didPresent' || phase === 'willDismiss' || phase === 'didDismiss') {
      if (presentations.delete(modal)) bounds = '';
    }
    if (phase === 'willDismiss') {
      dismissing.add(modal);
      if (animate()) releaseSheetBackdropGesture(modal, (event as CustomEvent<{ role?: string }> | undefined)?.detail?.role);
    } else if (phase === 'willPresent' || phase === 'didDismiss') dismissing.delete(modal);
    refresh();
  });
  doc.addEventListener(
    'pointerdown',
    (event) => {
      if ((event.target as Element).closest('ion-modal')) {
        pointerActive = true;
        schedule();
      }
    },
    { capture: true, signal: listeners.signal },
  );
  // WebKit cancels pointer events when Ionic takes over a touch gesture.
  // Touch ownership lasts through dragging, including a stationary hold.
  doc.addEventListener(
    'touchstart',
    (event) => {
      if ((event.target as Element).closest('ion-modal')) {
        touchActive = true;
        schedule();
      }
    },
    { capture: true, passive: true, signal: listeners.signal },
  );
  for (const name of ['touchend', 'touchcancel'])
    doc.addEventListener(
      name,
      (event) => {
        touchActive = (event as TouchEvent).touches.length > 0;
        schedule();
      },
      { capture: true, passive: true, signal: listeners.signal },
    );
  for (const name of ['pointerup', 'pointercancel'])
    doc.addEventListener(
      name,
      () => {
        pointerActive = false;
        schedule();
      },
      { capture: true, signal: listeners.signal },
    );
  win.addEventListener(
    'resize',
    () => {
      if (state.top) presentations.delete(state.top);
      schedule();
    },
    { signal: listeners.signal },
  );
  win.addEventListener('nativeUIRefresh', schedule, { signal: listeners.signal });
  refresh();
  return () => {
    stopped = true;
    stopOverlays();
    win.cancelAnimationFrame(frame);
    observer.disconnect();
    resize?.disconnect();
    listeners.abort();
    if (states.get(doc) !== state) return;
    states.delete(doc);
    doc.querySelectorAll('ion-modal').forEach((modal) => presentations.delete(modal));
    doc.querySelectorAll<HTMLElement>(`.${modalRailClass}`).forEach((modal) => {
      modal.classList.remove(modalRailClass);
      modal.style.removeProperty(toolbarTop);
    });
  };
};

/** Visible modal bounds, clipped at the viewport for Ionic's translated sheets. */
export const modalVerticalBarFrame = (modal: Element): Frame | undefined => {
  const presentation = modalPresentation(modal);
  if (presentation) return presentation.frame;
  const rect = modal.shadowRoot?.querySelector('[part~="content"]')?.getBoundingClientRect();
  const win = modal.ownerDocument.defaultView!;
  if (!rect) return;
  const y = Math.max(0, rect.top);
  const height = Math.min(win.innerHeight, rect.bottom) - y;
  return height > 0 ? { x: 0, y, width: win.innerWidth, height } : undefined;
};
