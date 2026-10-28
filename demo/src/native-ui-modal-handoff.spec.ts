import { afterEach, expect, test, vi } from 'vitest';
import { prepareSheetLayout } from '../../packages/capacitor-native-ui/src/native/shared/modal-animation';
import { releaseSheetBackdropGesture } from '../../packages/capacitor-native-ui/src/native/shared/modal';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
const fixture = (
  frames: Keyframe[] = [
    { offset: 0, opacity: 'var(--backdrop-opacity)' },
    { offset: 1, opacity: '0.01' },
  ],
) => {
  const modal = document.createElement('ion-modal');
  modal.className = 'modal-sheet ios-theme-vertical-bars-modal';
  const backdrop = document.createElement('ion-backdrop');
  modal.attachShadow({ mode: 'open' }).append(backdrop);
  class Effect {
    target = backdrop;
    constructor(private frames: Keyframe[]) {}
    getKeyframes() {
      return this.frames.map((frame) => ({ easing: 'linear', composite: 'auto', computedOffset: frame.offset, ...frame }));
    }
  }
  vi.stubGlobal('KeyframeEffect', Effect);
  const gesture = {
    playState: 'paused',
    effect: new Effect(frames),
    cancel: vi.fn(),
  };
  const leave = { ...gesture, playState: 'running', cancel: vi.fn() };
  const custom = { ...gesture, effect: new Effect([{ opacity: '0.5' }, { opacity: '0' }]), cancel: vi.fn() };
  backdrop.getAnimations = () => [gesture, leave, custom] as unknown as Animation[];
  return { modal, gesture, leave, custom };
};
test('native sheet handoff releases only the dormant Ionic backdrop gesture effect', () => {
  const f = fixture();
  releaseSheetBackdropGesture(f.modal);
  expect(f.gesture.cancel).toHaveBeenCalledOnce();
  expect(f.leave.cancel).not.toHaveBeenCalled();
  expect(f.custom.cancel).not.toHaveBeenCalled();
});
test('gesture dismissal and ordinary Web sheets keep ownership of their backdrop animations', () => {
  const f = fixture();
  releaseSheetBackdropGesture(f.modal, 'gesture');
  expect(f.gesture.cancel).not.toHaveBeenCalled();
  f.modal.classList.remove('ios-theme-vertical-bars-modal');
  releaseSheetBackdropGesture(f.modal);
  expect(f.gesture.cancel).not.toHaveBeenCalled();
});

test('a standard sheet with a backdrop breakpoint releases its three-frame gesture effect', () => {
  const f = fixture([
    { offset: 0, opacity: 'var(--backdrop-opacity)' },
    { offset: 0.75, opacity: '0' },
    { offset: 1, opacity: '0' },
  ]);
  (f.modal as HTMLIonModalElement).backdropBreakpoint = 0.25;
  releaseSheetBackdropGesture(f.modal);
  expect(f.gesture.cancel).toHaveBeenCalledOnce();
  expect(f.leave.cancel).not.toHaveBeenCalled();
  expect(f.custom.cancel).not.toHaveBeenCalled();
});

test.each([{ transform: 'scale(0.9)' }, { offset: 0.2 }, { easing: 'ease-in' }, { composite: 'add' as CompositeOperationOrAuto }])(
  'a paused custom backdrop effect remains untouched: %j',
  (custom) => {
    const f = fixture([
      { offset: 0, opacity: 'var(--backdrop-opacity)', ...custom },
      { offset: 1, opacity: '0.01' },
    ]);
    releaseSheetBackdropGesture(f.modal);
    expect(f.gesture.cancel).not.toHaveBeenCalled();
  },
);

test('a different backdrop breakpoint does not match the sheet gesture', () => {
  const f = fixture([
    { offset: 0, opacity: 'var(--backdrop-opacity)' },
    { offset: 0.5, opacity: '0' },
    { offset: 1, opacity: '0' },
  ]);
  (f.modal as HTMLIonModalElement).backdropBreakpoint = 0.25;
  releaseSheetBackdropGesture(f.modal);
  expect(f.gesture.cancel).not.toHaveBeenCalled();
});

const sheetLayout = (breakpoint: number) => {
  const modal = document.createElement('ion-modal');
  modal.className = 'modal-sheet modal-no-expand-scroll';
  modal.initialBreakpoint = breakpoint;
  const page = document.createElement('div');
  page.className = 'ion-page';
  modal.append(page);
  class Effect {
    target = page;
    frames = [0, 1].map((offset) => ({
      offset,
      computedOffset: offset,
      easing: 'linear',
      composite: 'auto',
      opacity: '1',
      maxHeight: `${Number(((offset ? breakpoint : 1 - breakpoint) * 100).toFixed(6))}%`,
    }));
    getKeyframes() {
      return this.frames;
    }
    setKeyframes = vi.fn();
  }
  vi.stubGlobal('KeyframeEffect', Effect);
  const effect = new Effect();
  const animation = { playState: 'running', effect };
  page.getAnimations = () => [animation] as unknown as Animation[];
  return { modal, effect, animation };
};

test.each([0.25, 0.5, 0.8, 1])('sheet entry lays out its destination breakpoint %s before translating', (breakpoint) => {
  const { modal, effect } = sheetLayout(breakpoint);
  prepareSheetLayout(modal);
  expect(effect.setKeyframes).toHaveBeenCalledWith(
    [0, 1].map((offset) => ({
      offset,
      easing: 'linear',
      composite: 'auto',
      opacity: '1',
      maxHeight: `${breakpoint * 100}%`,
    })),
  );
});

test('sheet layout preparation leaves custom effects, dormant gestures and other presentations untouched', () => {
  const { modal, effect } = sheetLayout(0.8);
  Object.assign(effect.frames[0], { transform: 'scale(0.9)' });
  prepareSheetLayout(modal);
  expect(effect.setKeyframes).not.toHaveBeenCalled();
  const gesture = sheetLayout(0.8);
  gesture.animation.playState = 'paused';
  prepareSheetLayout(gesture.modal);
  expect(gesture.effect.setKeyframes).not.toHaveBeenCalled();
  const regular = sheetLayout(0.8);
  regular.modal.classList.remove('modal-no-expand-scroll');
  prepareSheetLayout(regular.modal);
  expect(regular.effect.setKeyframes).not.toHaveBeenCalled();
});
