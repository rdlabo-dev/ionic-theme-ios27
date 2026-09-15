import type { registeredEffect } from '../sheets-of-glass/interfaces';
import { appendDragStep, dragDeformation, dragPosition, dragReleaseDelay, dragReleaseExpansion, type DragStep } from './drag';
import { platterRelease, release, sample, selectedPress, shortTransfer, shortTransferLeft, transfer } from './motion';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Surface extends Box {
  platter: number;
}

/** Optional visual enhancement. Ionic owns tab-selected, routing and click events. */
export const registerTabBarEffect = (bar: HTMLElement): registeredEffect | undefined => {
  const doc = bar.ownerDocument;
  const win = doc.defaultView;
  if (!win || !bar.classList.contains('ios') || bar.matches('.ios26-enable-gesture, .ios-theme-disabled, .ios26-disabled')) return;
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches) return;
  const lens = doc.createElement('ion-tab-button');
  lens.mode = 'ios';
  lens.className = 'ios ion-cloned-element ios26-tab-lens';
  lens.setAttribute('aria-hidden', 'true');
  lens.tabIndex = -1;
  lens.inert = true;
  lens.style.display = 'none';
  doc.body.append(lens);
  bar.classList.add('ios26-enable-gesture');
  const listeners = new AbortController();
  let animations: Animation[] = [];
  let destroyed = false;
  let pending = 0;
  let finishPending: (() => void) | undefined;
  let sequence = 0;
  let lateClick: { target: HTMLElement; until: number } | undefined;
  const touchClicks = new Map<number, number>();
  let base = { x: 0, y: 0, width: 1, height: 1 };
  let baseTransform = 'none';
  let viewport = { x: 0, y: 0, sx: 1, sy: 1 };
  let color = 'transparent';
  let pointer:
    | {
        id: number;
        type: string;
        time: number;
        x: number;
        y: number;
        from: Box;
        to: Box;
        target: HTMLIonTabButtonElement;
        dragged: boolean;
        clicked: boolean;
        steps: DragStep[];
        delta: number;
        spacing: number;
        origin: Box;
      }
    | undefined;
  const buttons = () => Array.from(bar.querySelectorAll<HTMLIonTabButtonElement>('ion-tab-button'));
  const allowed = (button: HTMLIonTabButtonElement | null): button is HTMLIonTabButtonElement =>
    !!button &&
    button.closest('ion-tab-bar') === bar &&
    !button.disabled &&
    !button.matches('.tab-disabled, .ios-theme-disabled, .ios26-disabled');
  const enabled = () =>
    !destroyed && bar.isConnected && !reduced.matches && !bar.matches('[data-native-ui-shell], .ios-theme-disabled, .ios26-disabled');
  const selected = () =>
    buttons().find((button) => button.tab === (bar as HTMLIonTabBarElement).selectedTab) ??
    buttons().find((button) => button.classList.contains('tab-selected'));
  const box = (element: HTMLElement): Box => {
    const rect = (element.shadowRoot?.querySelector<HTMLElement>('[part="native"]') ?? element).getBoundingClientRect();
    const outer = bar.getBoundingClientRect();
    const scale = outer.width / base.width;
    return {
      x: (rect.x + rect.width / 2 - outer.x) / scale,
      y: (rect.y + rect.height / 2 - outer.y) / scale,
      width: rect.width / scale,
      height: rect.height / scale,
    };
  };
  const current = (): Surface => {
    const rect = lens.getBoundingClientRect();
    const outer = bar.getBoundingClientRect();
    const scale = outer.width / base.width;
    return {
      x: (rect.x + rect.width / 2 - outer.x) / scale,
      y: (rect.y + rect.height / 2 - outer.y) / scale,
      width: rect.width / scale,
      height: rect.height / scale,
      platter: outer.width - base.width,
    };
  };
  const cancelAnimations = () => {
    animations.forEach((animation) => animation.cancel());
    animations = [];
  };
  const hide = () => {
    cancelAnimations();
    lens.style.display = 'none';
    bar.classList.remove('ios26-animated');
    buttons().forEach((button) => button.classList.remove('ios26-tab-preview', 'ion-activated'));
  };
  const abort = () => {
    if (pointer?.type === 'touch') touchClicks.set(pointer.id, win.performance.now() + 1000);
    sequence++;
    win.clearTimeout(pending);
    pending = 0;
    finishPending = undefined;
    pointer = undefined;
    hide();
  };
  const play = (states: Surface[], duration: number, start: number, finish = false) => {
    cancelAnimations();
    lens.style.display = 'block';
    bar.classList.add('ios26-animated');
    const frames = states.map((state) => {
      const scale = 1 + state.platter / base.width;
      const width = state.width * scale;
      const height = state.height * scale;
      return {
        transform: `translate3d(${(base.x + base.width / 2 + (state.x - base.width / 2) * scale - width / 2 - viewport.x) / viewport.sx}px, ${(base.y + base.height / 2 + (state.y - base.height / 2) * scale - height / 2 - viewport.y) / viewport.sy}px, 0)`,
        width: `${width / viewport.sx}px`,
        height: `${height / viewport.sy}px`,
      };
    });
    // performance.now() can be slightly ahead of document.timeline.currentTime.
    // Backwards fill prevents a zero-sized lens before that first paint (also
    // important when replacing a drag animation several times in one frame).
    const options: KeyframeAnimationOptions = { duration, fill: 'both', easing: 'linear' };
    animations = [
      lens.animate(frames, options),
      bar.animate(
        states.map((state) => ({
          transform: `${baseTransform === 'none' ? '' : baseTransform} scale(${1 + state.platter / base.width})`,
        })),
        options,
      ),
    ];
    if (finish) {
      // Blend into the actual selected surface, without modifying Ionic's state.
      const native = selected()?.shadowRoot?.querySelector<HTMLElement>('[part="native"]');
      const offset = Math.max(0, 1 - 120 / duration);
      animations.push(lens.animate([{ opacity: 1 }, { opacity: 1, offset }, { opacity: 0 }], options));
      if (native)
        animations.push(
          native.animate(
            [{ backgroundColor: 'transparent' }, { backgroundColor: 'transparent', offset }, { backgroundColor: color }],
            options,
          ),
        );
    }
    animations.forEach((animation) => (animation.startTime = start));
    if (finish) {
      const running = animations[0];
      void running.finished.then(
        () => {
          if (animations[0] === running) hide();
        },
        () => {},
      );
    }
  };
  const states = (duration: number, at: (seconds: number) => Surface) => {
    const count = Math.max(1, Math.ceil(duration / (1000 / 120)));
    return Array.from({ length: count + 1 }, (_, index) => at((duration * index) / count / 1000));
  };
  const measured = (from: Box, to: Box, values: number[], source: 'left' | 'right' = 'left'): Surface => {
    let [progress, width, height, platter] = values;
    // UIKit26's left/right transfer deformation is asymmetric. These are
    // physical directions, so RTL needs no logical-direction inversion.
    if ((to.x > from.x && source === 'left') || (to.x < from.x && source === 'right')) [width, height] = [height, width];
    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      width: from.width + (to.width - from.width) * progress + width,
      height: from.height + (to.height - from.height) * progress + height,
      platter,
    };
  };
  const preview = (button: HTMLIonTabButtonElement) => {
    buttons().forEach((candidate) => candidate.classList.toggle('ios26-tab-preview', candidate === button));
  };
  const down = (event: PointerEvent) => {
    // A queued second input can precede setTimeout(0), especially when the UI
    // thread was busy. Finish the released session before testing pointer ownership.
    if (finishPending) {
      win.clearTimeout(pending);
      finishPending();
    }
    if (!enabled() || pointer || event.button !== 0 || !event.isPrimary) return;
    const target = (event.target as Element).closest<HTMLIonTabButtonElement>('ion-tab-button');
    if (!allowed(target)) return;
    const time = win.performance.now();
    for (const [id, until] of touchClicks) if (until < time) touchClicks.delete(id);
    if (event.pointerType === 'touch') touchClicks.set(event.pointerId, Infinity);
    lateClick = undefined;
    // Capture an interrupted animation before clearing it; do not jump back to
    // the previous tab when a second press arrives during release.
    const interrupted = bar.classList.contains('ios26-animated') ? current() : undefined;
    abort();
    const rect = bar.getBoundingClientRect();
    base = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    baseTransform = win.getComputedStyle(bar).transform;
    // Ionic may transform body, making it the fixed-position containing block.
    // Measure that coordinate system rather than assuming it is the viewport.
    Object.assign(lens.style, { display: 'block', width: '1px', height: '1px', transform: 'none' });
    const origin = lens.getBoundingClientRect();
    viewport = { x: origin.x, y: origin.y, sx: origin.width || 1, sy: origin.height || 1 };
    const from = box(selected() ?? target);
    const to = box(target);
    const native = (selected() ?? target).shadowRoot?.querySelector<HTMLElement>('[part="native"]');
    color = native ? win.getComputedStyle(native).backgroundColor : 'transparent';
    lens.style.background = color;
    pointer = {
      id: event.pointerId,
      type: event.pointerType,
      time,
      x: event.clientX,
      y: event.clientY,
      from,
      to,
      target,
      dragged: false,
      clicked: false,
      steps: [],
      delta: 0,
      spacing: Math.abs(box(buttons()[1] ?? target).x - box(buttons()[0] ?? target).x) || to.width,
      origin: to,
    };
    preview(target);
    const table = selected() === target ? selectedPress : transfer;
    const initial = measured(from, to, sample(table, 0));
    play(
      states(1100, (t) => {
        const state = measured(from, to, sample(table, t));
        if (interrupted) {
          const remaining = Math.exp(-24 * t) * Math.max(0, 1 - t / 0.3);
          for (const key of ['x', 'y', 'width', 'height', 'platter'] as const) state[key] += (interrupted[key] - initial[key]) * remaining;
        }
        return state;
      }),
      1100,
      time,
    );
  };
  const move = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!enabled()) return abort();
    const target = doc.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLIonTabButtonElement>('ion-tab-button') ?? null;
    if (!allowed(target)) return;
    const time = win.performance.now();
    const delta = event.clientX - pointer.x;
    if (delta !== pointer.delta) {
      appendDragStep(pointer.steps, (time - pointer.time) / 1000, delta - pointer.delta);
      pointer.delta = delta;
    }
    if (!pointer.dragged && Math.hypot(delta, event.clientY - pointer.y) < 3) return;
    // Vertical scrolling is not a tab selection gesture.
    if (!pointer.dragged && Math.abs(event.clientY - pointer.y) > Math.abs(event.clientX - pointer.x)) return abort();
    pointer.dragged = true;
    pointer.target = target;
    pointer.to = box(target);
    preview(target);
    const available = buttons()
      .filter(allowed)
      .map(box)
      .map((item) => item.x);
    const session = pointer;
    const elapsed = (time - session.time) / 1000;
    const at = (t: number): Surface => {
      const seconds = elapsed + t;
      const [, width, height, platter] = sample(selectedPress, seconds);
      const deformation = dragDeformation(session.steps, seconds, session.spacing);
      return {
        ...session.to,
        x: Math.max(Math.min(...available), Math.min(Math.max(...available), session.origin.x + dragPosition(session.steps, seconds))),
        width: session.to.width + (width + height) / 2 + deformation,
        height: session.to.height + (width + height) / 2 - deformation,
        platter,
      };
    };
    // Evaluate the same input-clock trajectory on replacement. Correcting to
    // the last painted frame on every move would add a second, frame-rate-
    // dependent lag to the measured spring.
    play(states(1100, at), 1100, time);
  };
  const up = (event: PointerEvent) => {
    const ended = pointer;
    if (!ended || ended.id !== event.pointerId) return;
    if (!enabled()) return abort();
    const endTime = win.performance.now();
    const token = sequence;
    // Let the real browser click run first. Only drag-to-another-tab needs a
    // synthetic click when the browser retargets its click to the common bar.
    if (ended.type === 'touch') touchClicks.set(ended.id, endTime + 1000);
    finishPending = () => {
      pending = 0;
      finishPending = undefined;
      if (sequence !== token || pointer !== ended || !enabled()) return;
      const hit = doc.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLIonTabButtonElement>('ion-tab-button') ?? null;
      if (!allowed(hit)) return abort();
      // WKWebView can suppress its compatibility click after a touch mutates
      // the rendered surface, including a long press. Retain Ionic's handler,
      // but deliver one click if none arrived; swallow only its late duplicate.
      if (!ended.clicked) {
        lateClick = { target: hit, until: win.performance.now() + 1000 };
        hit.click();
      }
      const actual = selected();
      if (!actual) return abort();
      const from = current();
      const to = box(actual);
      pointer = undefined;
      buttons().forEach((button) => button.classList.remove('ios26-tab-preview', 'ion-activated'));
      const elapsed = (endTime - ended.time) / 1000;
      if (!ended.dragged && ended.from.x !== ended.to.x && elapsed < 0.18 && actual === ended.target) {
        const duration = Math.max(1, (1.12 - elapsed) * 1000);
        const direction = to.x > ended.from.x ? 'right' : 'left';
        const table = direction === 'right' ? shortTransfer : shortTransferLeft;
        const initial = measured(ended.from, to, sample(table, elapsed), direction);
        initial.platter = platterRelease(elapsed, 0);
        play(
          states(duration, (t) => {
            const state = measured(ended.from, to, sample(table, elapsed + t), direction);
            state.platter = platterRelease(elapsed, t);
            const remaining = Math.exp(-24 * t) * Math.max(0, 1 - t / 0.3);
            for (const key of ['x', 'y', 'width', 'height', 'platter'] as const) state[key] += (from[key] - initial[key]) * remaining;
            return state;
          }),
          duration,
          endTime,
          true,
        );
      } else if (ended.dragged) {
        const delay = dragReleaseDelay(ended.steps, elapsed);
        const restExpansion = (from.width - to.width + from.height - to.height) / 2;
        const position0 = ended.origin.x + dragPosition(ended.steps, elapsed);
        const deformation0 = dragDeformation(ended.steps, elapsed, ended.spacing);
        const actualDeformation = (from.width - to.width - (from.height - to.height)) / 2;
        ended.steps.push({ time: elapsed, delta: to.x - ended.origin.x - ended.delta });
        play(
          states(1100, (t) => {
            const common = dragReleaseExpansion(restExpansion, delay, t);
            const correction = Math.exp(-30 * t);
            const deformation = dragDeformation(ended.steps, elapsed + t, ended.spacing) + (actualDeformation - deformation0) * correction;
            return {
              x: ended.origin.x + dragPosition(ended.steps, elapsed + t) + (from.x - position0) * correction,
              y: to.y + (from.y - to.y) * correction,
              width: to.width + common + deformation,
              height: to.height + common - deformation,
              platter: (from.platter * platterRelease(elapsed, t)) / (sample(transfer, elapsed)[3] || 1),
            };
          }),
          1100,
          endTime,
          true,
        );
      } else {
        play(
          states(550, (t) => {
            const [width, height] = sample(release, t);
            const center = Math.exp(-20 * t) * (1 + 20 * t);
            return {
              x: to.x + (from.x - to.x) * center,
              y: to.y + (from.y - to.y) * center,
              width: to.width + (from.width - to.width) * width,
              height: to.height + (from.height - to.height) * height,
              platter: (from.platter * platterRelease(elapsed, t)) / (sample(transfer, elapsed)[3] || 1),
            };
          }),
          550,
          endTime,
          true,
        );
      }
    };
    pending = win.setTimeout(finishPending, 0);
  };
  bar.addEventListener('pointerdown', down, { signal: listeners.signal });
  bar.addEventListener(
    'click',
    (event) => {
      // Touch always uses the single post-pointerup Ionic click above. Native
      // compatibility clicks may be delayed until after another gesture has
      // started, so retain each touch identity across intervening pointerdowns.
      const touchUntil = touchClicks.get((event as PointerEvent).pointerId) ?? 0;
      if (event.isTrusted && event.detail > 0 && (event as PointerEvent).pointerType === 'touch' && touchUntil > win.performance.now()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (
        lateClick &&
        event.isTrusted &&
        event.detail > 0 &&
        win.performance.now() < lateClick.until &&
        (event.target as Element).closest('ion-tab-button') === lateClick.target
      ) {
        lateClick = undefined;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (pointer?.dragged && (event.target as Element).closest('ion-tab-button') !== pointer.target) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (pointer && (event.target as Element).closest('ion-tab-button')) pointer.clicked = true;
    },
    { capture: true, signal: listeners.signal },
  );
  doc.addEventListener('pointermove', move, { signal: listeners.signal });
  doc.addEventListener('pointerup', up, { signal: listeners.signal });
  doc.addEventListener(
    'pointercancel',
    (event) => {
      if (pointer?.id === event.pointerId) abort();
    },
    { signal: listeners.signal },
  );
  win.addEventListener('blur', abort, { signal: listeners.signal });
  // Scrolling/resize invalidates viewport geometry; ordinary Ionic selection is
  // unaffected. Never leave a body-owned lens behind on a detached page.
  doc.addEventListener('scroll', abort, { capture: true, passive: true, signal: listeners.signal });
  win.addEventListener('resize', abort, { signal: listeners.signal });
  reduced.addEventListener('change', abort, { signal: listeners.signal });
  const observer = new MutationObserver(() => {
    if (!enabled() && (pointer || bar.classList.contains('ios26-animated'))) abort();
  });
  observer.observe(bar, { attributes: true, attributeFilter: ['data-native-ui-shell', 'class'] });
  return {
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      listeners.abort();
      abort();
      touchClicks.clear();
      lens.remove();
      bar.classList.remove('ios26-enable-gesture');
    },
  };
};
