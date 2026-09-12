import type { Animation, AnimationKeyFrames } from '@ionic/core';
import { AnimationPosition, EffectScales } from './interfaces';
import { createAnimation, GestureDetail } from '@ionic/core';
import { getStep } from '../utils';

export const getScaleAnimation = (effectElement: Element): Animation => {
  return createAnimation().addElement(effectElement.shadowRoot!.querySelector<HTMLElement>('[part="native"]')!).easing('ease-out');
};

// Seconds, center progress, extra width/height (pt), platter expansion progress.
const tabBarPressFrames = [
  [0, 0, 0, 0, 0],
  [0.033, 0.091, 4.26, 1.52, 0.148],
  [0.067, 0.312, 13.28, 2.89, 0.46],
  [0.1, 0.551, 21.99, 2.24, 0.752],
  [0.133, 0.736, 25.94, 2.77, 0.951],
  [0.167, 0.858, 24.35, 6.03, 1.052],
  [0.2, 0.932, 22.72, 8.41, 1.081],
  [0.267, 0.985, 21.55, 10.38, 1.058],
  [0.333, 1.003, 17.89, 13.98, 1.01],
  [0.4, 1.015, 13.54, 18.42, 1],
  [0.467, 1.018, 11.3, 20.75, 1],
  [0.6, 1.005, 12.36, 19.72, 1],
  [0.733, 0.993, 14.75, 17.27, 1],
  [0.9, 1, 16, 16, 1],
];

// Short-tap transfer, measured separately from a held press (seconds, center, width/height deltas).
const tabBarTapFrames = [
  [0, 0, 0, 0],
  [0.033, 0.099, 4.15, 2.91],
  [0.067, 0.333, 13.81, 5.59],
  [0.1, 0.589, 23.77, 5.52],
  [0.133, 0.794, 29.84, 4.24],
  [0.167, 0.925, 29.01, 5.83],
  [0.2, 0.992, 26.85, 7.25],
  [0.233, 1.015, 25.83, 7.87],
  [0.267, 1.018, 20.43, 5.56],
  [0.3, 1.018, 12.87, 3.16],
  [0.367, 1.024, 1.3, 2.69],
  [0.433, 1.031, -3.98, 4.1],
  [0.5, 1.027, -5.05, 3.89],
  [0.6, 1.013, -2.95, 2.31],
  [0.7, 1.003, -0.74, 0.59],
  [0.8, 1, 0, 0],
];

// UITabBarController presentation-layer samples: horizontal stretch precedes vertical stretch.
export const createTabBarPressAnimation = (effect: HTMLElement, from: HTMLElement, to: HTMLElement, bar: HTMLElement): Animation => {
  const box = bar.getBoundingClientRect();
  const center = box.left + box.width / 2;
  const left = center - bar.offsetWidth / 2;
  const fromBox = from.getBoundingClientRect();
  const toBox = to.getBoundingClientRect();
  const parentScale = box.width / bar.offsetWidth;
  const buttonScale = new DOMMatrixReadOnly(getComputedStyle(from).transform);
  const width = fromBox.width / parentScale / buttonScale.a;
  const height = fromBox.height / parentScale / buttonScale.d;
  const start = (fromBox.left + fromBox.width / 2 - box.left) / parentScale;
  const end = (toBox.left + toBox.width / 2 - box.left) / parentScale;
  const selected = from === to;
  const frames = tabBarPressFrames.map(([time, position, extraWidth, extraHeight, expansion]) => {
    const scale = 1 + (14.14 / bar.offsetWidth) * expansion;
    // A selected item expands in place, without the transfer's sideways deformation.
    const press = 1 - Math.exp(-18 * time) * (1 + 18 * time);
    return {
      offset: time / 0.9,
      x: center + (left + start + (end - start) * position - center) * scale - width / 2,
      sx: ((width + (selected ? 16 * press : extraWidth)) * scale) / width,
      sy: ((height + (selected ? 16 * press : extraHeight)) * scale) / height,
    };
  });
  const move = createAnimation()
    .addElement(effect)
    .beforeStyles({
      width: `${width}px`,
      height: `${height}px`,
      display: 'block',
      opacity: '1',
    })
    .keyframes(
      frames.map(({ offset, x }) => ({ offset, transform: `translate3d(${x}px, ${box.top + box.height / 2 - height / 2}px, 0)` })),
    );
  const stretch = getScaleAnimation(effect)
    .easing('linear')
    .keyframes(frames.map(({ offset, sx, sy }) => ({ offset, transform: `scale(${sx}, ${sy})` })));
  return createAnimation().duration(900).easing('linear').addAnimation([move, stretch]);
};

// Drag samples: faster movement stretches sideways, then rebounds vertically at rest.
export const createTabBarDragAnimation = (effect: HTMLElement, bar: HTMLElement, velocity: number): Animation => {
  const native = effect.shadowRoot!.querySelector<HTMLElement>('[part="native"]')!;
  const current = new DOMMatrixReadOnly(native.style.transform || getComputedStyle(native).transform);
  const { width, height } = effect.getBoundingClientRect();
  const scale = 1 + 14.14 / bar.offsetWidth;
  const restX = ((width + 16) * scale) / width;
  const restY = ((height + 16) * scale) / height;
  // Approximate the 100/600pt/s UIKit samples; keep deformation bounded for fast swipes.
  const stretch = Math.min(16, 32 * velocity * velocity) * scale;
  const rebound = Math.max(stretch, (current.a - restX) * width) * 0.8;
  return getScaleAnimation(effect)
    .duration(500)
    .easing('linear')
    .keyframes([
      { offset: 0, transform: `scale(${current.a}, ${current.d})` },
      { offset: 0.2, transform: `scale(${restX + stretch / width}, ${restY - stretch / height})` },
      { offset: 0.44, transform: `scale(${restX - rebound / width}, ${restY + rebound / height})` },
      { offset: 1, transform: `scale(${restX}, ${restY})` },
    ]);
};

// UITabBarController release samples: return to rest with a small undershoot.
export const createTabBarReleaseAnimation = (
  effectElement: Element,
  target: HTMLElement,
  tap?: { elapsed: number; distance: number },
): Animation => {
  const tapElapsed = tap?.elapsed;
  const native = effectElement.shadowRoot!.querySelector<HTMLElement>('[part="native"]')!;
  const scale = new DOMMatrixReadOnly(native.style.transform || getComputedStyle(native).transform);
  const samples = [
    [0, 1],
    [0.033, 0.85],
    [0.067, 0.58],
    [0.1, 0.31],
    [0.133, 0.15],
    [0.167, 0.055],
    [0.2, 0.01],
    [0.267, -0.01],
    [0.367, -0.004],
    [0.45, 0],
  ];
  const bar = target.parentElement!;
  const box = bar.getBoundingClientRect();
  const current = effectElement.getBoundingClientRect();
  const targetBox = target.getBoundingClientRect();
  const center = box.left + box.width / 2;
  const x = center + (targetBox.left + targetBox.width / 2 - center) / (box.width / bar.offsetWidth) - current.width / 2;
  const y = box.top + box.height / 2 - current.height / 2;
  const elapsed = (tapElapsed ?? 0) / 1000;
  const duration = tapElapsed === undefined ? 450 : 800 - tapElapsed;
  let frames = samples.map(([time, remaining]) => ({
    offset: time / 0.45,
    x: x + (current.x - x) * remaining,
    y: y + (current.y - y) * remaining,
    sx: 1 + (scale.a - 1) * remaining,
    sy: 1 + (scale.d - 1) * remaining,
  }));
  if (tapElapsed !== undefined) {
    const nextIndex = tabBarTapFrames.findIndex(([time]) => time > elapsed);
    const previous = tabBarTapFrames[Math.max(0, nextIndex - 1)];
    const next = tabBarTapFrames[nextIndex];
    const progress = previous[1] + ((next[1] - previous[1]) * (elapsed - previous[0])) / (next[0] - previous[0]);
    // The late squeeze grows with travel (adjacent and three-item UIKit samples).
    const extraDistance = Math.max(0, tap!.distance - 1);
    // Start at the rendered press, not a recomputed rectangle, to avoid a release-frame jump.
    frames = [
      { offset: 0, x: current.x, y: current.y, sx: scale.a, sy: scale.d },
      ...tabBarTapFrames.slice(nextIndex).map(([time, position, width, height]) => ({
        offset: (time - elapsed) / (0.8 - elapsed),
        x: x + ((current.x - x) * (1 - position)) / Math.max(0.1, 1 - progress),
        y,
        sx: 1 + (width * (time >= 0.367 ? 1 + 0.75 * extraDistance : 1)) / current.width,
        sy: 1 + (height * (time >= 0.367 ? 1 + 0.5 * extraDistance : 1)) / current.height,
      })),
    ];
  }
  const stretch = createAnimation()
    .addElement(native)
    .duration(duration)
    .easing('linear')
    .keyframes(frames.map(({ offset, sx, sy }) => ({ offset, transform: `scale(${sx}, ${sy})` })));
  const move = createAnimation()
    .addElement(effectElement)
    .duration(duration)
    .easing('linear')
    .keyframes(
      frames.map(({ offset, x, y }) => ({
        offset,
        transform: `translate3d(${x}px, ${y}px, 0)`,
      })),
    );
  // Blend the reflective lens into the selected surface during the final 200ms.
  const offset = 1 - 200 / duration;
  const selectedBackground =
    'var(--ios27-tab-selected-background, rgba(var(--ios-theme-button-color-selected-rgb, var(--ios26-button-color-selected-rgb)), 0.095))';
  const glass = createAnimation()
    .addElement(effectElement)
    .easing('linear')
    .keyframes([
      { offset: 0, opacity: 1 },
      { offset, opacity: 1 },
      { offset: 1, opacity: 0 },
    ]);
  const selected = createAnimation()
    .addElement(target.shadowRoot!.querySelector<HTMLElement>('[part="native"]')!)
    .easing('linear')
    .keyframes([
      { offset: 0, backgroundColor: 'transparent' },
      { offset, backgroundColor: 'transparent' },
      { offset: 1, backgroundColor: selectedBackground },
    ]);
  const release = createAnimation().duration(duration).addAnimation([stretch, move, glass, selected]);
  if (tapElapsed !== undefined) {
    // A short UIKit tap keeps expanding after lift-off, then settles independently of the lens.
    // Width deltas from the 50ms tap; preserve the rendered size for an uninterrupted handoff.
    const width = bar.offsetWidth;
    const expansion = box.width - width;
    const peak = Math.max(8.65, expansion);
    const platter = createAnimation()
      .addElement(bar)
      .easing('linear')
      .keyframes(
        [
          [0, expansion],
          [17, expansion + (peak - expansion) * 0.503],
          [34, expansion + (peak - expansion) * 0.868],
          [50, peak],
          [67, peak * (8.46 / 8.65)],
          [83, peak * (7.73 / 8.65)],
          [100, peak * (6.66 / 8.65)],
          [117, peak * (5.44 / 8.65)],
          [134, peak * (4.19 / 8.65)],
          [150, peak * (3 / 8.65)],
          [167, peak * (1.97 / 8.65)],
          [184, peak * (1.09 / 8.65)],
          [200, peak * (0.39 / 8.65)],
          [217, 0],
          [234, peak * (-0.48 / 8.65)],
          [250, peak * (-0.7 / 8.65)],
          [267, peak * (-0.8 / 8.65)],
          [283, peak * (-0.82 / 8.65)],
          [300, peak * (-0.77 / 8.65)],
          [317, peak * (-0.68 / 8.65)],
          [334, peak * (-0.57 / 8.65)],
          [350, peak * (-0.46 / 8.65)],
          [383, peak * (-0.14 / 8.65)],
          [417, 0],
          [duration, 0],
        ].map(([time, extra]) => ({ offset: time / duration, transform: `scale(${1 + extra / width}) translateZ(0)` })),
      );
    release.addAnimation(platter);
  }
  return release;
};

export const createPreMoveAnimation = (
  effectElement: Element,
  tabSelectedElement: Element,
  currentTouchedElement: Element,
  animationPosition: AnimationPosition,
): Animation => {
  const diff = Math.max(
    Math.abs(tabSelectedElement.getBoundingClientRect().left - currentTouchedElement.getBoundingClientRect().left),
    140,
  );
  return createAnimation()
    .duration(diff * 2.1)
    .easing('ease-out')
    .addElement(effectElement)
    .beforeStyles({
      width: `${tabSelectedElement.clientWidth}px`,
      height: `${tabSelectedElement.clientHeight}px`,
      display: 'block',
      opacity: '1',
      transform: 'none',
    })
    .keyframes([
      {
        offset: 0,
        transform: `translate3d(${tabSelectedElement.getBoundingClientRect().left}px,  ${animationPosition.positionY}px, 0)`,
      },
      {
        offset: 1,
        transform: `translate3d(${currentTouchedElement.getBoundingClientRect().left}px,  ${animationPosition.positionY}px, 0)`,
      },
    ]);
};

export const createMoveAnimation = (
  effectElement: Element,
  detail: GestureDetail,
  tabSelectedElement: Element,
  animationPosition: AnimationPosition,
): Animation => {
  return createAnimation()
    .duration(500)
    .addElement(effectElement)
    .beforeStyles({
      width: `${tabSelectedElement.clientWidth}px`,
      height: `${tabSelectedElement.clientHeight}px`,
      display: 'block',
      opacity: '1',
      transform: 'none',
    })
    .fromTo(
      'transform',
      `translate3d(${animationPosition.minPositionX}px, ${animationPosition.positionY}px, 0)`,
      `translate3d(${animationPosition.maxPositionX}px, ${animationPosition.positionY}px, 0)`,
    )
    .progressStep(getStep(detail.currentX, animationPosition));
};

export const getMoveAnimationKeyframe = (type: 'moveRight' | 'moveLeft' | 'slowly', scales: EffectScales): AnimationKeyFrames => {
  return {
    moveRight: [
      {
        offset: 0,
        transform: scales.large,
      },
      {
        offset: 0.4,
        transform: scales.small,
      },
      {
        offset: 0.75,
        transform: scales.xlarge,
      },
      {
        offset: 1,
        transform: scales.large,
      },
    ],
    moveLeft: [
      {
        offset: 0,
        transform: scales.large,
      },
      {
        offset: 0.1,
        transform: scales.xlarge,
      },
      {
        offset: 0.6,
        transform: scales.small,
      },
      {
        offset: 1,
        transform: scales.large,
      },
    ],
    slowly: [
      {
        offset: 0,
        transform: scales.large,
      },
      {
        offset: 0.4,
        transform: scales.medium,
      },
      {
        offset: 1,
        transform: scales.large,
      },
    ],
  }[type];
};
