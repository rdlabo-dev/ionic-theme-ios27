import type { registeredEffect } from '../sheets-of-glass/interfaces';

/** Local shell gate — no native-integration module on this branch. */
const isNativeUIShell = (element: HTMLElement) => element.hasAttribute('data-native-ui-shell');

interface LensRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// iOS 26.5 ShellSegment, 31pt content control (FSpkxf), relative to pointerup.
// [time seconds, normalized center, width additive pt, height additive pt].
// Keep the recorded times: fitting an arbitrary temporal shift hides input latency.
const selectionFrames = [
  [0, 0, 0, 0],
  [0.0331, 0.0081, 0.466, 0.311],
  [0.0665, 0.1482, 6.775, 4.516],
  [0.0998, 0.3559, 14.018, 8.811],
  [0.1331, 0.5514, 20.831, 11.071],
  [0.1665, 0.7046, 27.26, 11.464],
  [0.1998, 0.8124, 32.711, 10.906],
  [0.2665, 0.9309, 35.042, 9.581],
  [0.3331, 0.9873, 13.895, 4.267],
  [0.4001, 1.0135, -1.786, 2.911],
  [0.5165, 1.0196, -9.478, 2.608],
  [0.5998, 1.0089, -4.653, 1.286],
  [0.6998, 1, 0, 0],
  [0.7998, 0.9984, 0.912, -0.252],
  [0.9, 1, 0, 0],
];

// Candidate release deformation (not measured for iOS 26.5).
const releaseFrames = [
  [0, 1, 1],
  [0.033, 1.01, 0.81],
  [0.067, 0.7, 0.205],
  [0.1, 0.51, -0.042],
  [0.133, 0.43, -0.101],
  [0.167, 0.189, -0.075],
  [0.2, 0.043, 0.027],
  [0.267, -0.154, 0.196],
  [0.333, -0.183, 0.236],
  [0.4, -0.123, 0.159],
  [0.5, -0.038, 0.05],
  [0.6, 0.005, -0.007],
  [0.7, 0.008, -0.01],
  [0.8, 0, 0],
];

/** Visual-only enhancement: Ionic retains ownership of selection, gestures and events. */
export const registerSegmentEffect = (targetElement: HTMLElement): registeredEffect | undefined => {
  const segment = targetElement as HTMLIonSegmentElement;
  const doc = segment.ownerDocument;
  const win = doc.defaultView;
  if (!segment.classList.contains('ios') || !win || segment.matches('.ios26-enable-gesture, .ios-theme-disabled, .ios26-disabled'))
    return undefined;
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) return undefined;
  const lens = doc.createElement('div');
  lens.className = 'ios26-segment-lens';
  lens.setAttribute('aria-hidden', 'true');
  const edge = doc.createElement('div');
  edge.className = 'ios26-segment-edge';
  lens.append(edge);
  segment.append(lens);
  segment.classList.add('ios26-enable-gesture');
  const listeners = new AbortController();
  let animation: Animation | undefined;
  let handoff: Animation[] = [];
  let destroyed = false;
  let pendingEnd = 0;
  let surfaceWidth = 1;
  let surfaceColor = 'transparent';
  let pointer:
    | { id: number; startX: number; startedAt: number; from: LensRect; button: HTMLElement; selected: boolean; moved: boolean }
    | undefined;
  const buttons = () => Array.from(segment.querySelectorAll<HTMLIonSegmentButtonElement>('ion-segment-button'));
  const selected = () => buttons().find((button) => button.value === segment.value);

  const rect = (button: HTMLElement): LensRect => {
    const outer = segment.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    const sx = outer.width / segment.offsetWidth || 1;
    const sy = outer.height / segment.offsetHeight || 1;
    return {
      x: (box.left + box.width / 2 - outer.left) / sx + segment.scrollLeft,
      y: (box.top + box.height / 2 - outer.top) / sy,
      width: Math.max(1, button.clientWidth - 4),
      height: button.clientHeight,
    };
  };
  const currentRect = (): LensRect => {
    const outer = segment.getBoundingClientRect();
    const box = lens.getBoundingClientRect();
    const sx = outer.width / segment.offsetWidth || 1;
    const sy = outer.height / segment.offsetHeight || 1;
    return {
      x: (box.left + box.width / 2 - outer.left) / sx + segment.scrollLeft,
      y: (box.top + box.height / 2 - outer.top) / sy,
      width: box.width / sx,
      height: box.height / sy,
    };
  };
  // Animate dimensions separately so the glass border and shadow are not scaled.
  const frame = (box: LensRect): Keyframe => ({
    transform: `translate3d(${box.x - box.width / 2}px, ${box.y - box.height / 2}px, 0)`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    backgroundColor: `color-mix(in srgb, ${surfaceColor} ${100 - Math.max(0, Math.min(1, (box.width - surfaceWidth) / 24)) * 90}%, transparent)`,
  });
  const hide = () => {
    animation?.cancel();
    animation = undefined;
    lens.hidden = true;
    segment.classList.remove('ios26-animated');
    handoff.forEach((effect) => effect.cancel());
    handoff = [];
  };
  lens.hidden = true;
  const play = (frames: Keyframe[], duration: number, hold = false, startTime = win.performance.now()) => {
    animation?.cancel();
    handoff.forEach((effect) => effect.cancel());
    handoff = [];
    segment.classList.add('ios26-animated');
    lens.hidden = false;
    const running = lens.animate(frames, { duration, easing: 'linear', fill: 'forwards' });
    // Keep the event's timeline origin even when rendering starts a frame later.
    running.startTime = startTime;
    animation = running;
    const restingWidth = hold ? surfaceWidth : parseFloat(String(frames[frames.length - 1]['width']));
    // No raised edge at either resting endpoint; reveal it with the lens deformation.
    handoff = [
      edge.animate(
        frames.map((sample) => ({
          offset: sample.offset,
          opacity: Math.max(
            0,
            Math.min(1, (parseFloat(String(sample['width'])) - (surfaceWidth + (restingWidth - surfaceWidth) * (sample.offset ?? 0))) / 24),
          ),
        })),
        { duration, fill: 'forwards' },
      ),
    ];
    const indicator = selected()?.shadowRoot?.querySelector<HTMLElement>('[part="indicator"]');
    if (!hold && indicator) {
      // Blend into Ionic's actual selected surface, including custom colors/shadows.
      // Fading the whole lens also removes its reflective edge before it is detached.
      const offset = Math.max(0, 1 - 200 / duration);
      handoff.push(
        lens.animate([{ opacity: 1 }, { opacity: 1, offset }, { opacity: 0 }], { duration, fill: 'forwards' }),
        indicator.animate([{ opacity: 0 }, { opacity: 0, offset }, { opacity: 1 }], { duration, fill: 'forwards' }),
      );
    }
    handoff.forEach((effect) => (effect.startTime = startTime));
    if (!hold)
      void running.finished.then(
        () => {
          if (animation === running) hide();
        },
        () => {},
      );
  };
  const settle = (from: LensRect, to: LensRect, changed: boolean, startTime: number) => {
    const toolbar = segment.classList.contains('in-toolbar') && !segment.classList.contains('segment-expand');
    const samples = changed ? selectionFrames : releaseFrames.map(([time, width, height]) => [time, 1 - width, 0, 0, width, height]);
    const duration = samples[samples.length - 1][0];
    const frames = samples.map(([time, position, width, height, remainingWidth, remainingHeight]) => {
      const remaining = 1 - position;
      const box = {
        x: from.x + (to.x - from.x) * position,
        y: from.y + (to.y - from.y) * position,
        width: Math.max(1, to.width + (from.width - to.width) * (changed ? remaining : remainingWidth) + (changed ? width : 0)),
        height: Math.max(
          1,
          to.height +
            (from.height - to.height) * (changed ? remaining : remainingHeight) +
            (changed ? height * (toolbar ? 1 / 1.1 : 1) : 0),
        ),
      };
      return { ...frame(box), offset: time / duration };
    });
    play(frames, duration * 1000, false, startTime);
  };
  const releasePressed = (from: LensRect, to: LensRect) => {
    // Candidate selected-item release curve (not measured for iOS 26.5).
    const samples = [
      [0, 1],
      [0.033, 0.78],
      [0.067, 0.49],
      [0.1, 0.28],
      [0.133, 0.157],
      [0.167, 0.089],
      [0.2, 0.054],
      [0.233, 0.034],
      [0.267, 0.009],
      [0.317, 0],
      [0.43, -0.013],
      [0.65, 0],
    ];
    play(
      samples.map(([time, remaining]) => ({
        ...frame({
          ...to,
          width: to.width + (from.width - to.width) * remaining,
          height: to.height + (from.height - to.height) * remaining,
        }),
        offset: time / 0.65,
      })),
      650,
    );
  };
  const down = (event: PointerEvent) => {
    if (pointer || event.button !== 0 || segment.disabled || reducedMotion.matches || isNativeUIShell(segment)) return;
    const button = (event.target as Element).closest<HTMLIonSegmentButtonElement>('ion-segment-button');
    const old = selected();
    if (!button || button.disabled || !old) return;
    win.cancelAnimationFrame(pendingEnd);
    const rest = rect(old);
    surfaceWidth = rest.width;
    const style = win.getComputedStyle(old);
    surfaceColor = style.getPropertyValue('--indicator-color') || 'transparent';
    lens.style.borderRadius = style.getPropertyValue('--border-radius');
    const interrupted = !!animation;
    const from = interrupted ? currentRect() : rest;
    hide();
    pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startedAt: win.performance.now(),
      from: rest,
      button: old,
      selected: old === button,
      moved: false,
    };
    if (pointer.selected) {
      // Candidate selected-item press curve (not measured for iOS 26.5).
      const samples = [
        [0, 0],
        [0.033, 0.133],
        [0.067, 0.43],
        [0.1, 0.67],
        [0.133, 0.83],
        [0.167, 0.92],
        [0.2, 0.97],
        [0.233, 1],
      ];
      play(
        samples.map(([time, expansion]) => ({
          ...frame({
            ...from,
            width: from.width + (rest.width + 24 - from.width) * expansion,
            height: from.height + (rest.height + 16 - from.height) * expansion,
          }),
          offset: time / 0.233,
        })),
        233,
        true,
      );
    } else if (interrupted) {
      play([frame(from), frame(from)], 1, true);
    }
  };
  const move = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId || !pointer.selected || !segment.swipeGesture || segment.scrollable) return;
    const dx = (event.clientX - pointer.startX) / (segment.getBoundingClientRect().width / segment.offsetWidth || 1);
    if (Math.abs(dx) < 3 && !pointer.moved) return;
    pointer.moved = true;
    const centers = buttons()
      .filter((button) => !button.disabled)
      .map((button) => rect(button).x);
    const box = {
      ...pointer.from,
      x: Math.max(Math.min(...centers), Math.min(Math.max(...centers), pointer.from.x + dx)),
      width: pointer.from.width + 24,
      height: pointer.from.height + 16,
    };
    animation?.cancel();
    animation = undefined;
    Object.assign(lens.style, frame(box));
  };
  const end = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const releasedAt = win.performance.now();
    const state = pointer;
    const from = !lens.hidden ? currentRect() : state.from;
    pointer = undefined;
    // Capture runs before Ionic's pointer-end handler. Read its committed value afterwards.
    pendingEnd = win.requestAnimationFrame(() => {
      pendingEnd = 0;
      if (destroyed || pointer) return;
      const next = selected();
      if (!next || reducedMotion.matches || event.type === 'pointercancel') {
        hide();
        return;
      }
      const changed = next !== state.button;
      // Ionic has committed selection: use the destination's public appearance
      // for the moving surface as well as the final indicator.
      const nextStyle = win.getComputedStyle(next);
      surfaceColor = nextStyle.getPropertyValue('--indicator-color') || 'transparent';
      lens.style.borderRadius = nextStyle.getPropertyValue('--border-radius');
      if (!changed && !state.moved && animation) {
        // A short selected-item tap completes its press before returning, as UIKit does.
        const pressing = animation;
        void pressing.finished.then(
          () => {
            if (!destroyed && !pointer && animation === pressing) releasePressed(currentRect(), rect(next));
          },
          () => {},
        );
      } else if (changed || !lens.hidden) settle(from, rect(next), changed && !state.moved, releasedAt);
    });
  };
  const abort = () => {
    win.cancelAnimationFrame(pendingEnd);
    pendingEnd = 0;
    pointer = undefined;
    hide();
  };
  segment.addEventListener('pointerdown', down, { capture: true, signal: listeners.signal });
  doc.addEventListener('pointermove', move, { capture: true, signal: listeners.signal });
  doc.addEventListener('pointerup', end, { capture: true, signal: listeners.signal });
  doc.addEventListener('pointercancel', end, { capture: true, signal: listeners.signal });
  win.addEventListener('blur', abort, { signal: listeners.signal });
  win.addEventListener('resize', abort, { signal: listeners.signal });
  segment.addEventListener(
    'ionSelect',
    () => {
      if (!pointer && !pendingEnd) abort();
    },
    { signal: listeners.signal },
  );
  reducedMotion.addEventListener('change', abort, { signal: listeners.signal });
  segment.addEventListener('nativeUIShellChange', abort, { signal: listeners.signal });
  return {
    destroy: () => {
      destroyed = true;
      listeners.abort();
      abort();
      segment.classList.remove('ios26-enable-gesture');
      lens.remove();
    },
  };
};
