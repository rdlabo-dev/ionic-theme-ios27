import { sample, transfer } from './motion';

export interface DragStep {
  time: number;
  delta: number;
}

export const appendDragStep = (steps: DragStep[], time: number, delta: number) => {
  if (!delta) return;
  const last = steps[steps.length - 1];
  if (last && time - last.time < 1 / 240) {
    last.delta += delta;
  } else steps.push({ time, delta });
  // Settled transfers contribute only their final position. Keep that offset
  // but not an unbounded event history during a long held drag.
  while (steps.length > 2 && (steps[1].time < time - 1.2 || steps.length > 320)) {
    steps[1].delta += steps[0].delta;
    steps.shift();
  }
};

// Independent 26.1/26.5 pointer/presentation recordings agree on this delayed
// near-critical response. Time is the actual input clock, not a fitted plot shift.
const response = (seconds: number) => {
  const t = Math.max(0, seconds - 1 / 60);
  const omega = 30;
  const damping = 0.95;
  const decay = damping * omega;
  const frequency = omega * Math.sqrt(1 - damping * damping);
  return 1 - Math.exp(-decay * t) * (Math.cos(frequency * t) + (decay / frequency) * Math.sin(frequency * t));
};

export const dragPosition = (steps: DragStep[], seconds: number) =>
  steps.reduce((position, step) => position + step.delta * response(seconds - step.time), 0);

export const dragVelocity = (steps: DragStep[], seconds: number) =>
  (dragPosition(steps, seconds + 0.001) - dragPosition(steps, seconds - 0.001)) / 0.002;

export const dragReleaseDelay = (steps: DragStep[], seconds: number) => Math.min(0.0833, Math.abs(dragVelocity(steps, seconds)) * 0.00014);

export const dragReleaseExpansion = (initial: number, delay: number, seconds: number) => {
  const t = Math.max(0, seconds - delay);
  return initial * Math.exp(-25 * t) * (1 + 25 * t);
};

// A movement is a sequence of small transfers. Preserve their delayed lateral /
// vertical rebound instead of replacing every move with a uniform held ellipse.
export const dragDeformation = (steps: DragStep[], seconds: number, spacing: number) =>
  steps.reduce((deformation, step) => {
    const [, width, height] = sample(transfer, Math.max(0, seconds - step.time) * 1.25);
    return deformation + ((step.delta / Math.max(1, spacing)) * (height - width) * 1.125) / 2;
  }, 0);
