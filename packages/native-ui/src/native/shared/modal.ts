import type { Frame } from '../definitions';

/** Modal hosts cover the viewport even when their visible dialog is centered. */
export const modalRailClass = 'ios-theme-vertical-bars-modal';
const states = new WeakMap<Document, { top?: HTMLIonModalElement }>();

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

export const observeVerticalBarsModals = (doc: Document): (() => void) => {
  const win = doc.defaultView!;
  const state: { top?: HTMLIonModalElement } = {};
  states.set(doc, state);
  const presenting = new Set<HTMLIonModalElement>();
  const dismissed = new WeakSet<HTMLIonModalElement>();
  const observed = new Set<Element>();
  const listeners = new AbortController();
  let stopped = false;
  let frame = 0;
  let pointerActive = false;
  let bounds = '';
  const toolbarTop = '--ios-theme-vertical-bars-modal-offset-top';
  const refresh = () => {
    win.cancelAnimationFrame(frame);
    frame = 0;
    if (stopped) return;
    const app = doc.querySelector('ion-app.ios-theme-vertical-bars');
    const modals = Array.from(doc.querySelectorAll<HTMLIonModalElement>('ion-modal'));
    const active = modals.filter(
      (modal) => !dismissed.has(modal) && ((modal as HTMLIonModalElement & { presented?: boolean }).presented || presenting.has(modal)),
    );
    for (const modal of presenting) if (!modal.isConnected) presenting.delete(modal);
    const top = active.sort((a, b) => a.overlayIndex - b.overlayIndex).slice(-1)[0];
    let changed = state.top !== top;
    state.top = top;
    const nextBounds = top ? JSON.stringify(modalVerticalBarFrame(top)) : '';
    changed ||= bounds !== nextBounds;
    bounds = nextBounds;
    const wanted = new Set<Element>();
    for (const modal of modals) {
      const content = modal.shadowRoot?.querySelector<HTMLElement>('[part~="content"]');
      if (content) wanted.add(content);
      // offsetWidth is unaffected by Ionic's presentation transforms.
      const fullWidth = !!content && Math.abs(content.offsetWidth - win.innerWidth) <= 1 && Math.abs(content.offsetLeft) <= 1;
      const enabled = !!app?.contains(modal) && active.includes(modal) && fullWidth;
      if (enabled) {
        const top = modalVerticalBarFrame(modal)?.y ?? 0;
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
    if (changed) win.dispatchEvent(new Event('nativeUIShellRefresh'));
    if (
      top &&
      (pointerActive ||
        Array.from(wanted).some((element) => element.getAnimations().some((animation) => animation.playState === 'running')))
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
  for (const name of ['ionModalWillPresent', 'ionModalDidPresent', 'ionModalWillDismiss', 'ionModalDidDismiss', 'ionBreakpointDidChange']) {
    doc.addEventListener(
      name,
      (event) => {
        const modal = event.target as HTMLIonModalElement;
        if (modal.localName !== 'ion-modal') return;
        if (name === 'ionModalDidDismiss') {
          presenting.delete(modal);
          dismissed.add(modal);
        } else {
          presenting.add(modal);
          dismissed.delete(modal);
        }
        refresh();
      },
      { capture: true, signal: listeners.signal },
    );
  }
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
  for (const name of ['pointerup', 'pointercancel'])
    doc.addEventListener(
      name,
      () => {
        pointerActive = false;
        schedule();
      },
      { capture: true, signal: listeners.signal },
    );
  win.addEventListener('resize', schedule, { signal: listeners.signal });
  win.addEventListener('nativeUIShellRefresh', schedule, { signal: listeners.signal });
  refresh();
  return () => {
    stopped = true;
    win.cancelAnimationFrame(frame);
    observer.disconnect();
    resize?.disconnect();
    listeners.abort();
    if (states.get(doc) !== state) return;
    states.delete(doc);
    doc.querySelectorAll<HTMLElement>(`.${modalRailClass}`).forEach((modal) => {
      modal.classList.remove(modalRailClass);
      modal.style.removeProperty(toolbarTop);
    });
  };
};

/** Visible modal bounds, clipped at the viewport for Ionic's translated sheets. */
export const modalVerticalBarFrame = (modal: Element): Frame | undefined => {
  const rect = modal.shadowRoot?.querySelector('[part~="content"]')?.getBoundingClientRect();
  const win = modal.ownerDocument.defaultView!;
  if (!rect) return;
  const y = Math.max(0, rect.top);
  const height = Math.min(win.innerHeight, rect.bottom) - y;
  return height > 0 ? { x: 0, y, width: win.innerWidth, height } : undefined;
};
