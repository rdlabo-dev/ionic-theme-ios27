import { afterEach, expect, test, vi } from 'vitest';
import { releaseSheetBackdropGesture } from '../../packages/capacitor-native-ui/src/native/shared/modal';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
const fixture = () => {
  const modal = document.createElement('ion-modal');
  modal.className = 'modal-sheet ios-theme-vertical-bars-modal';
  const backdrop = document.createElement('ion-backdrop');
  modal.attachShadow({ mode: 'open' }).append(backdrop);
  class Effect {
    target = backdrop;
    constructor(private frames: object[]) {}
    getKeyframes() {
      return this.frames;
    }
  }
  vi.stubGlobal('KeyframeEffect', Effect);
  const gesture = {
    playState: 'paused',
    effect: new Effect([{ opacity: 'var(--backdrop-opacity)' }, { opacity: '0.01' }]),
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
