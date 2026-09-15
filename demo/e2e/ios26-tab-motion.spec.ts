import { expect, test } from '@playwright/test';
import {
  appendDragStep,
  dragDeformation,
  dragPosition,
  dragReleaseDelay,
  dragReleaseExpansion,
  type DragStep,
} from '../../src/tab-bar/drag';
import { sample, selectedPress } from '../../src/tab-bar/motion';
import fixture from '../native-parity/fixtures/tabs-drag-ios26.json';

for (const entry of fixture.entries) {
  test(`native drag replay iOS ${entry.os} ${entry.appearance} press ${entry.press}`, () => {
    let previous = 0;
    const steps = entry.inputs.map(([time, position]) => {
      const delta = position - previous;
      previous = position;
      return { time, delta };
    });
    const delay = dragReleaseDelay(steps, entry.up);
    const [, width, height] = sample(selectedPress, entry.up);
    const errors = entry.samples.map(([t, center, nativeWidth, nativeHeight]) => {
      const [, w, h] = sample(selectedPress, t);
      const common = t <= entry.up ? (w + h) / 2 : dragReleaseExpansion((width + height) / 2, delay, t - entry.up);
      const deformation = dragDeformation(steps, t, 86);
      return [
        Math.abs(dragPosition(steps, t) - center),
        Math.abs(common + deformation - nativeWidth),
        Math.abs(common - deformation - nativeHeight),
      ];
    });
    for (let column = 0; column < 3; column++) {
      const values = errors.map((error) => error[column]);
      expect(values.reduce((sum, value) => sum + value, 0) / values.length).toBeLessThan(column ? 0.85 : 1);
      expect(Math.max(...values)).toBeLessThan(column ? 3.3 : 4.5);
    }
    // These are recorded-trajectory regression limits, not a screenshot verdict.
  });
}

test('drag input history remains bounded and preserves settled displacement', () => {
  const steps: DragStep[] = [];
  let total = 0;
  for (let index = 0; index < 10000; index++) {
    const delta = index % 100 < 50 ? 1 : -1;
    total += delta;
    appendDragStep(steps, index / 240, delta);
    expect(steps.length).toBeLessThanOrEqual(320);
  }
  expect(dragPosition(steps, 100)).toBeCloseTo(total, 8);
  expect(dragDeformation(steps, 100, 86)).toBe(0);
});
