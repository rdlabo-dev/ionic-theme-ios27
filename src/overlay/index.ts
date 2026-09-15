import { createAnimation, type Animation } from '@ionic/core';

type Kind = 'alert' | 'action-sheet';

// UIKit 26.1/26.5, unanchored UIAlertController (ondT6o / 3vg4c1).
// Both styles use the same critically damped opacity/scale response. The
// controller's variable construction latency is not baked into the animation.
const DURATION = 416.667;
const FREQUENCY = 22.85;
const progress = (seconds: number) => 1 - (1 + FREQUENCY * seconds) * Math.exp(-FREQUENCY * seconds);

const build = (baseEl: HTMLElement, kind: Kind, entering: boolean): Animation => {
  const root = baseEl.shadowRoot ?? baseEl;
  const wrapper = root.querySelector<HTMLElement>(`.${kind}-wrapper`);
  const backdrop = root.querySelector<HTMLElement>('ion-backdrop');
  const animation = createAnimation().addElement(baseEl);
  if (!wrapper || !backdrop) return animation.duration(0);

  const surface = createAnimation().addElement(wrapper);
  const dimming = createAnimation().addElement(backdrop);
  if (entering) dimming.beforeStyles({ 'pointer-events': 'none' }).afterClearStyles(['pointer-events']);

  if (baseEl.matches('.ios-theme-disabled, .ios26-disabled')) {
    // Ionic's iOS defaults, kept for explicit theme opt-out. Adapted from
    // @ionic/core alert/action-sheet animations (Ionic, MIT License).
    dimming.fromTo('opacity', entering ? 0.01 : 'var(--backdrop-opacity)', entering ? 'var(--backdrop-opacity)' : 0);
    if (kind === 'alert') {
      surface.keyframes([
        { offset: 0, opacity: entering ? 0.01 : 0.99, transform: entering ? 'scale(1.1)' : 'scale(1)' },
        { offset: 1, opacity: entering ? 1 : 0, transform: entering ? 'scale(1)' : 'scale(0.9)' },
      ]);
      animation.duration(200).easing('ease-in-out');
    } else {
      surface.fromTo('transform', entering ? 'translateY(100%)' : 'translateY(0%)', entering ? 'translateY(0%)' : 'translateY(100%)');
      animation.duration(entering ? 400 : 450).easing('cubic-bezier(.36,.66,.04,1)');
    }
  } else {
    const frames = Array.from({ length: 51 }, (_, index) => {
      const offset = index / 50;
      const p = index === 50 ? 1 : progress((offset * DURATION) / 1000);
      return { offset, opacity: entering ? p : 1 - p, transform: `scale(${entering ? 1.2 - 0.2 * p : 1})` };
    });
    surface.keyframes(frames);
    // Respect the public dimming variable, including per-overlay overrides.
    // Keep CSS expressions/variables live instead of parseFloat('calc(...)').
    dimming.keyframes(
      frames.map(({ offset, opacity: alpha }) => ({ offset, opacity: `calc(var(--backdrop-opacity, 0.2066) * ${alpha})` })),
    );
    animation.duration(DURATION).easing('linear');
  }

  if (baseEl.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) animation.duration(0);
  return animation.addAnimation([surface, dimming]);
};

/** Configure Ionic's alertEnter/alertLeave; iOS 26 unanchored presentation. */
export const alertEnterAnimation = (baseEl: HTMLElement): Animation => build(baseEl, 'alert', true);
export const alertLeaveAnimation = (baseEl: HTMLElement): Animation => build(baseEl, 'alert', false);
/** Configure Ionic's actionSheetEnter/actionSheetLeave; not an anchored popover. */
export const actionSheetEnterAnimation = (baseEl: HTMLElement): Animation => build(baseEl, 'action-sheet', true);
export const actionSheetLeaveAnimation = (baseEl: HTMLElement): Animation => build(baseEl, 'action-sheet', false);
