import type { Animation, AnimationKeyFrames, GestureDetail } from '@ionic/core/components';
import { AnimationPosition, EffectScales } from './interfaces';
import { createAnimation } from '@ionic/core/components/index.js';
import { getStep } from '../utils';

export const getScaleAnimation = (effectElement: Element): Animation => {
  return createAnimation().addElement(effectElement.shadowRoot!.querySelector<HTMLElement>('[part="native"]')!).easing('ease-out');
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
