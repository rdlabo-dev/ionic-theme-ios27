import type { registeredEffect } from '../sheets-of-glass/interfaces';

/** Local shell gate — no native-integration module on this branch. */
const isNativeUIShell = (element: HTMLElement) => element.hasAttribute('data-native-ui-shell');

const CSS_SCALE = '--ios26-button-css-scale';
const GESTURE = 'ios26-enable-gesture';
const ANIMATED = 'ios26-animated';
/** Measured resting heights 28/44pt qualify; 62pt (+14.14 extra) is not yet qualified. */
const MAX_HEIGHT = 44;
// iOS 26.5: fit to 49–217ms native presses (4SaJQq), checked against
// independent dark/held traces. Release carries velocity: a minimum hold
// incorrectly made a 50ms tap expand as far as a long press.
const PRESS = { frequency: 20.43633, damping: 0.611883, delay: 13.659 };
const RELEASE = { frequency: 16.99576, damping: 0.563006, delay: 14.996 };
const DURATION = 1000;
type Spring = { from: number; velocity: number; to: number; frequency: number; damping: number; delay: number };
const springState = (spring: Spring, elapsed: number) => {
  if (elapsed >= DURATION) return { scale: spring.to, velocity: 0 };
  const t = Math.max(0, elapsed - spring.delay) / 1000;
  const { from, velocity, to, frequency: w, damping: z } = spring;
  const wd = w * Math.sqrt(1 - z * z);
  const a = from - to;
  const b = (velocity + z * w * a) / wd;
  const decay = Math.exp(-z * w * t);
  const cos = Math.cos(wd * t);
  const sin = Math.sin(wd * t);
  return {
    scale: to + decay * (a * cos + b * sin),
    velocity: decay * ((-z * w * a + wd * b) * cos + (-z * w * b - wd * a) * sin),
  };
};

/** Visual-only enhancement: Ionic keeps click/submit ownership. Grouped ion-buttons are out of scope. */
export const registerButtonEffect = (targetElement: HTMLElement): registeredEffect | undefined => {
  const button = targetElement;
  const doc = button.ownerDocument;
  const win = doc.defaultView;
  if (
    !win ||
    !button.matches('ion-button, ion-back-button') ||
    !button.classList.contains('ios') ||
    !button.classList.contains('hydrated') ||
    button.matches(`.${GESTURE}, .ios-theme-disabled, .ios26-disabled, .button-clear, .button-outline`)
  )
    return undefined;
  const group = button.closest('ion-buttons');
  if (group?.classList.contains('ios') && !group.matches('.ios-theme-disabled, .ios26-disabled')) return undefined;
  const surface = button.shadowRoot?.querySelector<HTMLElement>('[part="native"]');
  if (!surface || surface.offsetHeight > MAX_HEIGHT || !surface.offsetWidth || !surface.offsetHeight) return undefined;

  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const prevScale = button.style.getPropertyValue(CSS_SCALE);
  const prevPriority = button.style.getPropertyPriority(CSS_SCALE);
  button.style.setProperty(CSS_SCALE, '1');
  button.classList.add(GESTURE);

  const listeners = new AbortController();
  let animation: Animation | undefined;
  let spring: Spring | undefined;
  let releaseTimer = 0;
  let destroyed = false;
  let pointerId: number | undefined;
  let keyActive = false;
  let heldScale = 1;
  const restingScale = parseFloat(win.getComputedStyle(surface).scale) || 1;

  const disabled = () => button.matches('.button-disabled, .ion-disabled, [disabled]') || !!(button as HTMLIonButtonElement).disabled;
  const readState = () =>
    spring && animation && typeof animation.startTime === 'number'
      ? springState(spring, win.performance.now() - animation.startTime)
      : { scale: parseFloat(win.getComputedStyle(surface).scale) || restingScale, velocity: 0 };
  const clearTimer = () => {
    if (releaseTimer) {
      win.clearTimeout(releaseTimer);
      releaseTimer = 0;
    }
  };
  const stopAnimation = () => {
    animation?.cancel();
    animation = undefined;
    spring = undefined;
    if (button.classList.contains(ANIMATED)) button.classList.remove(ANIMATED);
  };
  const abortVisual = () => {
    clearTimer();
    pointerId = undefined;
    keyActive = false;
    stopAnimation();
  };
  const play = (next: Spring) => {
    stopAnimation();
    spring = next;
    button.classList.add(ANIMATED);
    const times = [0, ...Array.from({ length: 120 }, (_, i) => next.delay + (i * (DURATION - next.delay)) / 120), DURATION];
    const frames = times.map((t) => ({ offset: t / DURATION, scale: String(t === DURATION ? next.to : springState(next, t).scale) }));
    const running = surface.animate(frames, { duration: DURATION, easing: 'linear', fill: 'forwards' });
    // The default DocumentTimeline shares performance.timeOrigin. Its exposed
    // currentTime can still be the previous rendering tick inside an input
    // handler: use the input clock for both onset and velocity handoff.
    running.startTime = win.performance.now();
    animation = running;
    // Keep the handle while fill=forwards is active, including a held press.
    // Dropping it on finish would leave an uncancellable effect on the surface.
    return running;
  };
  const startPress = () => {
    if (reducedMotion.matches || isNativeUIShell(button) || disabled() || button.matches('.ios-theme-disabled, .ios26-disabled'))
      return false;
    // Height >44pt (e.g. large 62pt) differs from the uniform +16pt width model — skip for now.
    if (surface.offsetHeight > MAX_HEIGHT) return false;
    clearTimer();
    const width = Math.max(1, surface.offsetWidth);
    heldScale = (restingScale * (width + 16)) / width;
    const current = readState();
    play({ ...PRESS, from: current.scale, velocity: current.velocity, to: heldScale });
    return true;
  };
  const startRelease = () => {
    if (destroyed || reducedMotion.matches || isNativeUIShell(button) || disabled()) {
      abortVisual();
      return;
    }
    const current = readState();
    const releasing = play({ ...RELEASE, delay: 0, from: current.scale, velocity: current.velocity, to: restingScale });
    void releasing.finished.then(
      () => {
        if (!destroyed && animation === releasing) {
          stopAnimation();
        }
      },
      () => {},
    );
  };
  const scheduleRelease = () => {
    clearTimer();
    // Continue the press during UIKit's measured release latency; do not
    // freeze at pointerup or discard the expansion's current velocity.
    releaseTimer = win.setTimeout(startRelease, RELEASE.delay);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (pointerId !== undefined || keyActive || event.button !== 0 || disabled() || reducedMotion.matches || isNativeUIShell(button))
      return;
    if (!startPress()) return;
    pointerId = event.pointerId;
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    pointerId = undefined;
    if (event.type === 'pointercancel') {
      abortVisual();
      return;
    }
    scheduleRelease();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    if (event.repeat || pointerId !== undefined || keyActive || disabled() || reducedMotion.matches || isNativeUIShell(button)) return;
    if (!startPress()) return;
    keyActive = true;
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if ((event.key !== ' ' && event.key !== 'Enter') || !keyActive) return;
    keyActive = false;
    scheduleRelease();
  };

  button.addEventListener('pointerdown', onPointerDown, { capture: true, signal: listeners.signal });
  doc.addEventListener('pointerup', onPointerEnd, { capture: true, signal: listeners.signal });
  doc.addEventListener('pointercancel', onPointerEnd, { capture: true, signal: listeners.signal });
  button.addEventListener('keydown', onKeyDown, { signal: listeners.signal });
  button.addEventListener('keyup', onKeyUp, { signal: listeners.signal });
  win.addEventListener('blur', abortVisual, { signal: listeners.signal });
  win.addEventListener('resize', abortVisual, { signal: listeners.signal });
  reducedMotion.addEventListener('change', abortVisual, { signal: listeners.signal });
  button.addEventListener('nativeUIShellChange', abortVisual, { signal: listeners.signal });
  const observer = new MutationObserver(() => {
    if (disabled() || isNativeUIShell(button) || button.matches('.ios-theme-disabled, .ios26-disabled')) abortVisual();
  });
  observer.observe(button, { attributes: true, attributeFilter: ['class', 'disabled', 'data-native-ui-shell'] });
  const restoreCSSScale = () => {
    if (prevScale) button.style.setProperty(CSS_SCALE, prevScale, prevPriority);
    else button.style.removeProperty(CSS_SCALE);
  };
  let lastWidth = surface.offsetWidth;
  let lastHeight = surface.offsetHeight;
  const resizeObserver = new ResizeObserver(() => {
    const width = surface.offsetWidth;
    const height = surface.offsetHeight;
    // Dark activated borders change the content box without resizing the
    // button. That must not cancel the very press we are rendering.
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    abortVisual();
    // A registered small button can become large through responsive styles.
    // Return the unqualified size to its existing CSS effect, then reacquire
    // the measured effect if it becomes small again.
    if (surface.offsetHeight > MAX_HEIGHT || !surface.offsetHeight || !surface.offsetWidth) restoreCSSScale();
    else button.style.setProperty(CSS_SCALE, '1');
  });
  resizeObserver.observe(surface, { box: 'border-box' });

  return {
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      resizeObserver.disconnect();
      listeners.abort();
      abortVisual();
      button.classList.remove(GESTURE, ANIMATED);
      restoreCSSScale();
    },
  };
};
