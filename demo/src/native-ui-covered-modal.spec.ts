import { observeVerticalBarsModals, movingModal, modalMotionEvent } from '../../packages/capacitor-native-ui/src/native/shared/modal';
import { afterEach, expect, test, vi } from 'vitest';
import { coverOverlayBackground, usesCoveredBackground } from '../../packages/capacitor-native-ui/src/native/overlays/covered-overlay';
import type { CoveredSnapshots } from '../../packages/capacitor-native-ui/src/native/shared/covered-snapshot';

afterEach(() => document.body.replaceChildren());
test('presentation never waits for the bridge or changes Ionic visibility/animation', () => {
  const modal = document.createElement('ion-modal');
  document.body.append(modal);
  const begin = vi.fn(() => new Promise<void>(() => {}));
  const builder = vi.fn();
  const snapshots = { begin, retireRestoration: vi.fn() } as unknown as CoveredSnapshots;
  document.addEventListener('ionModalWillPresent', () => coverOverlayBackground(modal, snapshots), { capture: true, once: true });
  modal.addEventListener('ionModalWillPresent', () => {
    modal.enterAnimation = builder;
  });
  modal.dispatchEvent(new Event('ionModalWillPresent', { bubbles: true }));
  expect(begin).toHaveBeenCalledOnce();
  expect(modal.style.visibility).toBe('');
  expect(modal.enterAnimation).toBe(builder);
});
test.each(['interactive', 'no-backdrop'])('%s modal keeps its live Web background', (kind) => {
  const modal = document.createElement('ion-modal');
  if (kind === 'interactive') {
    modal.initialBreakpoint = 0.5;
    modal.backdropBreakpoint = 0.75;
  }
  if (kind === 'no-backdrop') modal.showBackdrop = false;
  const begin = vi.fn();
  const retireRestoration = vi.fn();
  coverOverlayBackground(modal, { begin, retireRestoration } as unknown as CoveredSnapshots);
  expect(retireRestoration).toHaveBeenCalledOnce();
  expect(begin).not.toHaveBeenCalled();
});

test.each(['sheet', 'card'])('%s motion spans dragging and settling, without treating a tap as movement', async (kind) => {
  vi.useFakeTimers();
  document.body.innerHTML = '<ion-app class="ios-theme-vertical-bars"><ion-modal></ion-modal></ion-app>';
  const modal = document.querySelector('ion-modal')!;
  if (kind === 'sheet') modal.breakpoints = [0, 0.5, 0.8];
  else modal.presentingElement = document.body;
  const wrapper = document.createElement('div');
  wrapper.setAttribute('part', 'content');
  modal.attachShadow({ mode: 'open' }).append(wrapper);
  let y = 136;
  let running = false;
  wrapper.getBoundingClientRect = () => DOMRect.fromRect({ y, width: innerWidth, height: innerHeight });
  wrapper.getAnimations = () => (running ? [{ playState: 'running' } as Animation] : []);
  Object.defineProperty(wrapper, 'offsetWidth', { value: innerWidth });
  const events: boolean[] = [];
  const listener = (event: Event) => events.push((event as CustomEvent).detail.moving);
  window.addEventListener(modalMotionEvent, listener);
  const stop = observeVerticalBarsModals(document);
  try {
    modal.dispatchEvent(new CustomEvent('ionModalDidPresent', { bubbles: true }));
    modal.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(20);
    expect(movingModal(document)).toBeUndefined();
    y = 200;
    await vi.advanceTimersByTimeAsync(20);
    expect(movingModal(document)).toBe(modal);
    y = 300;
    await vi.advanceTimersByTimeAsync(20);
    expect(events).toEqual([true]);
    running = true;
    modal.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(20);
    expect(movingModal(document)).toBe(modal);
    running = false;
    await vi.advanceTimersByTimeAsync(20);
    expect(events).toEqual([true, false]);
    expect(movingModal(document)).toBeUndefined();
  } finally {
    stop();
    window.removeEventListener(modalMotionEvent, listener);
    vi.useRealTimers();
  }
});

test.each(['popover', 'alert', 'action-sheet', 'loading', 'picker'])('%s shares the blocking background handoff', (name) => {
  const overlay = document.createElement(`ion-${name}`);
  const snapshots = { begin: vi.fn(), retireRestoration: vi.fn() } as unknown as CoveredSnapshots;
  coverOverlayBackground(overlay, snapshots);
  expect(snapshots.begin).toHaveBeenCalledOnce();
  Object.assign(overlay, { showBackdrop: false });
  expect(usesCoveredBackground(overlay)).toBe(false);
});
test.each(['toast', 'menu'])('%s keeps its existing live route', (name) => {
  expect(usesCoveredBackground(document.createElement(`ion-${name}`))).toBe(false);
});

test('card modal uses the same prepared background handoff', () => {
  const modal = document.createElement('ion-modal');
  modal.presentingElement = document.body;
  const snapshots = { begin: vi.fn(), retireRestoration: vi.fn() } as unknown as CoveredSnapshots;
  coverOverlayBackground(modal, snapshots);
  expect(snapshots.begin).toHaveBeenCalledWith(document.body);
});
