import { afterEach, expect, test } from 'vitest';
import {
  alignVerticalBarClone,
  rememberVerticalBarFrame,
} from '../../packages/capacitor-native-ui/src/native/shared/vertical-bars-geometry';

afterEach(() => document.body.replaceChildren());

for (const border of [0, 1 / 3, 1]) {
  test(`rail fallback preserves viewport coordinates with a ${border}px group border`, () => {
    const parent = document.createElement('div');
    const source = document.createElement('ion-button');
    const clone = document.createElement('ion-button');
    parent.style.border = `${border}px solid black`;
    parent.append(clone);
    document.body.append(parent, source);
    parent.getBoundingClientRect = () => DOMRect.fromRect({ x: 394, y: 170, width: 48, height: 100 });
    rememberVerticalBarFrame(source, { x: 394, y: 222, width: 48, height: 48 });
    alignVerticalBarClone(clone, source, parent);
    expect(394 + border + parseFloat(clone.style.left)).toBeCloseTo(394, 5);
    expect(170 + border + parseFloat(clone.style.top)).toBeCloseTo(222, 5);
    expect(clone.style.width).toBe('48px');
    expect(clone.style.height).toBe('48px');
  });
}
