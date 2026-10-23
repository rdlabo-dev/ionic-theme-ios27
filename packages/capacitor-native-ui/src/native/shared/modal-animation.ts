import type { Frame } from '../definitions';

/** One immutable presentation, played by Core Animation on the same elapsed clock. */
export interface ModalAnimation {
  id: number;
  startedAt: number;
  duration: number;
  fromY: number;
  opacity: number;
  easing: number[];
}

let sequence = 0;
export const readModalAnimation = (content: HTMLElement): { animation: ModalAnimation; frame: Frame } | undefined => {
  const win = content.ownerDocument.defaultView!;
  if (Math.abs(content.offsetWidth - win.innerWidth) > 1 || Math.abs(content.offsetLeft) > 1) return;
  const animation = content
    .getAnimations()
    .find((item) => item.playState === 'running' && (item.effect as KeyframeEffect)?.getKeyframes().some((frame) => frame['transform']));
  if (!animation || animation.playbackRate !== 1) return;
  const effect = animation.effect as KeyframeEffect;
  const timing = effect.getTiming();
  const frames = effect.getKeyframes();
  if (
    frames.length !== 2 ||
    typeof timing.duration !== 'number' ||
    timing.duration <= 0 ||
    timing.duration > 60_000 ||
    !Number.isFinite(timing.duration) ||
    frames.some((frame) => frame.easing !== 'linear') ||
    Number(frames[1]['opacity'] ?? 1) !== 1 ||
    timing.iterations !== 1 ||
    timing.direction !== 'normal' ||
    timing.delay !== 0
  )
    return;
  const translate = (value: unknown) => {
    const match = /^translateY\((-?[\d.]+)(px|%|vh)\)$/.exec(String(value));
    if (!match) return;
    const factor = match[2] === '%' ? content.offsetHeight / 100 : match[2] === 'vh' ? win.innerHeight / 100 : 1;
    return Number(match[1]) * factor;
  };
  const from = translate(frames[0]['transform']);
  const to = translate(frames[1]['transform']);
  const curve = /^cubic-bezier\(([^)]+)\)$/.exec(timing.easing ?? 'linear');
  const easing = (timing.easing ?? 'linear') === 'linear' ? [0, 0, 1, 1] : curve?.[1].split(',').map(Number);
  if (from === undefined || to === undefined || !easing || easing.length !== 4 || !easing.every(Number.isFinite)) return;
  const opacity = Number(frames[0]['opacity'] ?? 1);
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1 || easing[0] < 0 || easing[0] > 1 || easing[2] < 0 || easing[2] > 1) return;
  const matrix = new DOMMatrixReadOnly(win.getComputedStyle(content).transform);
  if (matrix.a !== 1 || matrix.d !== 1 || matrix.b !== 0 || matrix.c !== 0 || matrix.m41 !== 0) return;
  const rect = content.getBoundingClientRect();
  const y = Math.max(0, rect.top - matrix.m42 + to);
  const height = Math.min(rect.height, win.innerHeight - y);
  if (height <= 0) return;
  return {
    animation: {
      id: ++sequence,
      startedAt: Date.now() - Number(animation.currentTime ?? 0),
      duration: timing.duration,
      fromY: from - to,
      opacity,
      easing,
    },
    frame: { x: 0, y, width: win.innerWidth, height },
  };
};
