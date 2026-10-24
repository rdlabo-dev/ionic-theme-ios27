import { afterEach, expect, test, vi } from 'vitest';
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
