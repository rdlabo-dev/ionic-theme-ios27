import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  attachTabAccessory,
  enableTabAccessory,
  TAB_ACCESSORY_GESTURE_ACTIVE_CLASS,
  TAB_ACCESSORY_PANNING_X_CLASS,
} from '../../src/tab-accessory';

const gestureMocks = vi.hoisted(() => ({
  createGesture: vi.fn(() => ({ enable: vi.fn(), destroy: vi.fn() })),
}));

vi.mock('@ionic/core', () => ({
  createGesture: gestureMocks.createGesture,
}));

const createGestureMock = gestureMocks.createGesture;

type GestureConfig = {
  el: HTMLElement;
  direction?: string;
  gesturePriority?: number;
  passive?: boolean;
  disableScroll?: boolean;
  maxAngle?: number;
  canStart?: (detail: { event?: Event }) => boolean;
  onStart?: (detail?: unknown) => void;
  onMove?: (detail: { deltaY: number }) => void;
  onEnd?: (detail: { deltaY: number; velocityY?: number }) => void;
};

const config = (): GestureConfig => {
  const last = createGestureMock.mock.calls.at(-1) as [GestureConfig] | undefined;
  if (!last) throw new Error('createGesture was not called');
  return last[0];
};

const mount = (lift = false, alias = false) => {
  const clip = document.createElement('div');
  if (lift) clip.className = alias ? 'ios-theme-tab-accessory-lift' : 'tab-accessory-lift';
  const toolbarClass = alias ? 'ios ios-theme-tab-accessory' : 'ios tab-accessory';
  clip.innerHTML = `
    <ion-toolbar class="${toolbarClass}">
      <img data-tab-accessory="artwork" alt="" />
      <ion-button data-tab-accessory="play"></ion-button>
    </ion-toolbar>`;
  document.body.append(clip);
  return {
    clip,
    toolbar: clip.querySelector<HTMLElement>('ion-toolbar')!,
    play: clip.querySelector<HTMLElement>('ion-button')!,
  };
};

beforeEach(() => {
  createGestureMock.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

test('attaches an upward swipe gesture with follow-the-finger priority', () => {
  const { toolbar } = mount();
  const effect = attachTabAccessory(toolbar);
  expect(createGestureMock).toHaveBeenCalledTimes(1);
  expect(config().el).toBe(toolbar);
  expect(config().direction).toBe('y');
  expect(config().gesturePriority).toBe(20);
  expect(config().passive).toBe(false);
  expect(config().disableScroll).toBe(true);
  expect(config().maxAngle).toBe(45);
  effect?.destroy();
});

test('attaches to the ios-theme-tab-accessory alias', () => {
  const { toolbar } = mount(false, true);
  attachTabAccessory(toolbar);
  expect(createGestureMock).toHaveBeenCalledTimes(1);
});

test('lifts a marked wrapper instead of the toolbar', () => {
  const { toolbar, clip } = mount(true);
  attachTabAccessory(toolbar);
  expect(config().el).toBe(clip);
});

test('clicks the toolbar after a -50px swipe-up', () => {
  const { toolbar } = mount();
  const click = vi.fn();
  toolbar.addEventListener('click', click);
  attachTabAccessory(toolbar);
  config().onEnd?.({ deltaY: -80, velocityY: 0 } as never);
  expect(click).not.toHaveBeenCalled();
  vi.advanceTimersByTime(200);
  expect(click).toHaveBeenCalledTimes(1);
});

test('clicks the toolbar on a fast upward flick', () => {
  const { toolbar } = mount();
  const click = vi.fn();
  toolbar.addEventListener('click', click);
  attachTabAccessory(toolbar);
  config().onEnd?.({ deltaY: -10, velocityY: -0.5 } as never);
  vi.advanceTimersByTime(200);
  expect(click).toHaveBeenCalledTimes(1);
});

test('snaps back when the swipe is too small', () => {
  const { toolbar } = mount();
  const click = vi.fn();
  toolbar.addEventListener('click', click);
  attachTabAccessory(toolbar);
  config().onStart?.({} as never);
  config().onEnd?.({ deltaY: -20, velocityY: -0.1 } as never);
  expect(click).not.toHaveBeenCalled();
  expect(toolbar.style.transform).toBe('translateY(0)');
});

test('follows the finger and fades while dragging up', () => {
  const { toolbar } = mount();
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  attachTabAccessory(toolbar);
  config().onStart?.({} as never);
  config().onMove?.({ deltaY: -80 } as never);
  expect(toolbar.style.transform).toBe('translateY(-80px)');
  expect(toolbar.classList.contains(TAB_ACCESSORY_GESTURE_ACTIVE_CLASS)).toBe(true);
  expect(Number(toolbar.style.opacity)).toBeLessThan(1);
});

test('does not start on the play control', () => {
  const { toolbar, play } = mount();
  attachTabAccessory(toolbar);
  const event = { target: play } as unknown as Event;
  expect(config().canStart?.({ event } as never)).toBe(false);
});

test('does not activate while the host owns a horizontal pan', () => {
  const { toolbar, clip } = mount(true);
  const click = vi.fn();
  toolbar.addEventListener('click', click);
  attachTabAccessory(toolbar);
  clip.classList.add(TAB_ACCESSORY_PANNING_X_CLASS);
  config().onEnd?.({ deltaY: -80, velocityY: 0 } as never);
  vi.advanceTimersByTime(200);
  expect(click).not.toHaveBeenCalled();
});

test('skips Native UI Shell hosts', () => {
  const { toolbar } = mount();
  toolbar.setAttribute('data-native-ui-shell', '');
  expect(attachTabAccessory(toolbar)).toBeUndefined();
  expect(createGestureMock).not.toHaveBeenCalled();
});

test('enableTabAccessory attaches and tears down observed toolbars', () => {
  const { toolbar } = mount();
  const handle = enableTabAccessory();
  expect(createGestureMock).toHaveBeenCalled();
  expect(config().el).toBe(toolbar);
  handle.destroy();
  const gesture = createGestureMock.mock.results.at(-1)?.value as { destroy: ReturnType<typeof vi.fn> };
  expect(gesture.destroy).toHaveBeenCalled();
});
