import { expect, test } from 'vitest';
import { isAtomicSwap, isAtomicSwapDuration, isAtomicSwapHandoff } from '../../src/native/shared/dom';

test.each(['data-shell-handoff', 'class'] as const)('isAtomicSwap via %s matches the element and ancestors', (attribute) => {
  document.body.innerHTML = '<div id="parent"><ion-segment id="segment"></ion-segment><ion-button id="other"></ion-button></div>';
  const parent = document.getElementById('parent')!;
  const segment = document.getElementById('segment')!;
  const other = document.getElementById('other')!;
  if (attribute === 'class') segment.className = 'ios-theme-shell-handoff-swap';
  else segment.setAttribute('data-shell-handoff', 'swap');
  expect(isAtomicSwap(segment)).toBe(true);
  expect(isAtomicSwap(other)).toBe(false);
  if (attribute === 'class') {
    segment.className = '';
    parent.className = 'ios-theme-shell-handoff-swap';
  } else {
    segment.removeAttribute('data-shell-handoff');
    parent.setAttribute('data-shell-handoff', 'swap');
  }
  expect(isAtomicSwap(segment)).toBe(true);
  expect(isAtomicSwap(other)).toBe(true);
  document.body.innerHTML = '';
});

test('unknown data-shell-handoff values do not opt in', () => {
  document.body.innerHTML = '<ion-segment data-shell-handoff="fade"></ion-segment>';
  expect(isAtomicSwap(document.querySelector('ion-segment')!)).toBe(false);
  document.body.innerHTML = '';
});

test('isAtomicSwapHandoff requires every changed source to be atomic', () => {
  document.body.innerHTML = `
    <ion-segment id="atomic" data-shell-handoff="swap"></ion-segment>
    <ion-back-button id="back"></ion-back-button>`;
  const atomic = document.getElementById('atomic')!;
  const back = document.getElementById('back')!;
  expect(isAtomicSwapHandoff([])).toBe(false);
  expect(isAtomicSwapHandoff([atomic])).toBe(true);
  expect(isAtomicSwapHandoff([atomic, back])).toBe(false);
  document.body.innerHTML = '';
});

test('isAtomicSwapDuration is 0 when every added source is atomic', () => {
  document.body.innerHTML = `
    <ion-segment id="atomic" data-shell-handoff="swap"></ion-segment>
    <ion-back-button id="back"></ion-back-button>`;
  const atomic = document.getElementById('atomic')!;
  const back = document.getElementById('back')!;
  expect(isAtomicSwapDuration([back], [atomic])).toBe(true);
  expect(isAtomicSwapDuration([atomic], [])).toBe(true);
  expect(isAtomicSwapDuration([back], [])).toBe(false);
  expect(isAtomicSwapDuration([], [back])).toBe(false);
  document.body.innerHTML = '';
});
