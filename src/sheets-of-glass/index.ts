import { AnimationPosition, EffectScales, registeredEffect } from './interfaces';
import { createAnimation, createGesture } from '@ionic/core';
import type { Animation, Gesture, GestureDetail } from '@ionic/core';
import { changeSelectedElement, cloneElement, getStep } from '../utils';
import { createMoveAnimation, createPreMoveAnimation, getMoveAnimationKeyframe, getScaleAnimation } from './animations';

const GESTURE_NAME = 'ios26-enable-gesture';
const ANIMATED_NAME = 'ios26-animated';

export const registerEffect = (
  targetElement: HTMLElement,
  effectTagName: string,
  selectedClassName: string,
  scales: EffectScales,
): registeredEffect | undefined => {
  if (!targetElement.classList.contains('ios')) {
    return undefined;
  }

  let gesture!: Gesture;
  let moveAnimation: Animation | undefined;
  let currentTouchedElement: HTMLElement | undefined;
  let clearActivatedTimer: ReturnType<typeof setTimeout> | undefined;
  let animationPosition: AnimationPosition | undefined = undefined;
  let scaleAnimationPromise: Promise<void> | undefined;
  let startAnimationPromise: Promise<void> | undefined;
  let maxVelocity = 0;
  const effectElement = cloneElement(effectTagName);

  /**
   * These event listeners fix a bug where gestures don't complete properly.
   * They terminate the gesture using native events as a fallback.
   */
  const onPointerDown = (event: PointerEvent) => {
    clearActivated();
    gesture.destroy();
    createAnimationGesture();
    const onPointerUp = async (e: PointerEvent) => {
      clearActivatedTimer = setTimeout(async () => {
        await onEndGesture();
        gesture.destroy();
        createAnimationGesture();
      });
      document.removeEventListener('pointerup', onPointerUp);
    };
    document.addEventListener('pointerup', onPointerUp);
  };
  targetElement.addEventListener('pointerdown', onPointerDown);

  const createAnimationGesture = () => {
    targetElement.classList.add(GESTURE_NAME);
    gesture = createGesture({
      el: targetElement,
      threshold: 0,
      gestureName: `${GESTURE_NAME}_${effectTagName}_${crypto.randomUUID()}`,
      onStart: (event) => onStartGesture(event),
      onMove: (event) => onMoveGesture(event),
      onEnd: () => {
        onEndGesture().then();
      },
    });
    gesture.enable(true);
  };
  createAnimationGesture();

  const clearActivated = (isEndGesture: boolean = false) => {
    if (!currentTouchedElement) {
      return;
    }
    if (!isEndGesture && !currentTouchedElement.classList.contains(selectedClassName)) {
      currentTouchedElement!.click();
      currentTouchedElement.classList.add(selectedClassName);
    }
    currentTouchedElement.classList.remove('ion-activated');
    currentTouchedElement = undefined;
    effectElement.style.display = 'none';
    maxVelocity = 0;
    targetElement.classList.remove(ANIMATED_NAME);
  };

  const onStartGesture = (detail: GestureDetail): boolean | undefined => {
    currentTouchedElement = ((detail.event.target as HTMLElement).closest(effectTagName) as HTMLElement) || undefined;
    const tabSelectedElement = targetElement.querySelector(`${effectTagName}.${selectedClassName}`);
    if (currentTouchedElement === undefined || tabSelectedElement === null) {
      return false;
    }
    animationPosition = {
      minPositionX: targetElement.getBoundingClientRect().left,
      maxPositionX: targetElement.getBoundingClientRect().right - tabSelectedElement.clientWidth,
      width: tabSelectedElement.clientWidth,
      positionY: tabSelectedElement.getBoundingClientRect().top,
    };
    targetElement.classList.add(ANIMATED_NAME);
    changeSelectedElement(targetElement, currentTouchedElement, effectTagName, selectedClassName);

    const startAnimation = (() => {
      if (tabSelectedElement === currentTouchedElement) {
        return new Promise<void>((resolve) => resolve());
      } else {
        const preMoveAnimation = createPreMoveAnimation(effectElement, tabSelectedElement, currentTouchedElement, animationPosition!);
        return preMoveAnimation.play().finally(() => preMoveAnimation.destroy());
      }
    })();
    startAnimationPromise = startAnimation;
    startAnimation.then(() => {
      if (!currentTouchedElement) {
        return;
      }
      moveAnimation = createMoveAnimation(effectElement, detail, tabSelectedElement, animationPosition!);
      moveAnimation.progressStart(
        true,
        getStep(currentTouchedElement.getBoundingClientRect().left + currentTouchedElement.clientWidth / 2, animationPosition!),
      );
    });
    getScaleAnimation(effectElement).duration(200).to('opacity', 1).to('transform', scales.large).play();
    return true;
  };

  const onMoveGesture = (detail: GestureDetail): boolean | undefined => {
    if (currentTouchedElement === undefined || !moveAnimation) {
      return false; // Skip Animation
    }
    if (scaleAnimationPromise === undefined) {
      if (Math.abs(detail.velocityX) > maxVelocity) {
        maxVelocity = Math.abs(detail.velocityX);
      }
      if (Math.abs(detail.velocityX) > 0.2) {
        scaleAnimationPromise = getScaleAnimation(effectElement)
          .duration(720)
          .keyframes(getMoveAnimationKeyframe('slowly', scales))
          .play()
          .finally(() => (scaleAnimationPromise = undefined));
      }
      if (maxVelocity > 0.2 && Math.abs(detail.velocityX) < 0.15 && Math.abs(detail.startX - detail.currentX) > 100) {
        scaleAnimationPromise = getScaleAnimation(effectElement)
          .duration(720)
          .keyframes(getMoveAnimationKeyframe(detail.velocityX > 0 ? 'moveRight' : 'moveLeft', scales))
          .play()
          .finally(() => (scaleAnimationPromise = undefined));
        maxVelocity = 0;
      }
    }

    const currentX = detail.currentX;
    const previousY = targetElement.getBoundingClientRect().top + targetElement.getBoundingClientRect().height / 2;
    const nextEl = (targetElement.getRootNode() as Document | ShadowRoot).elementFromPoint(currentX, previousY);
    const latestTouchedElement = (nextEl?.closest(effectTagName) as HTMLElement) || undefined;

    if (latestTouchedElement && currentTouchedElement !== latestTouchedElement) {
      currentTouchedElement = latestTouchedElement;
      changeSelectedElement(targetElement, currentTouchedElement, effectTagName, selectedClassName);
    }
    moveAnimation.progressStep(getStep(detail.currentX, animationPosition!));
    return true;
  };

  const onEndGesture = async (): Promise<boolean | undefined> => {
    // タイマーをクリア（正常にonEndGestureが実行された場合）
    if (clearActivatedTimer !== undefined) {
      clearTimeout(clearActivatedTimer);
      clearActivatedTimer = undefined;
    }

    if (currentTouchedElement && !currentTouchedElement.classList.contains(selectedClassName)) {
      currentTouchedElement.click();
      currentTouchedElement.classList.add(selectedClassName);
    }

    if (startAnimationPromise) {
      await startAnimationPromise;
    }

    if (currentTouchedElement === undefined || !moveAnimation) {
      return false;
    }

    setTimeout(() => {
      if (!currentTouchedElement) {
        return;
      }
      const targetX = currentTouchedElement.getBoundingClientRect().left + currentTouchedElement.clientWidth / 2;
      const step = getStep(targetX, animationPosition!);
      moveAnimation!.progressStep(step);
    });
    await getScaleAnimation(effectElement).duration(120).to('transform', `scale(1, 0.92)`).play();
    moveAnimation!.destroy();

    clearActivated(true);
    return true;
  };

  return {
    destroy: () => {
      // Remove event listeners
      targetElement.removeEventListener('pointerdown', onPointerDown);

      // Clear any pending timer
      if (clearActivatedTimer !== undefined) {
        clearTimeout(clearActivatedTimer);
        clearActivatedTimer = undefined;
      }

      // Clear activated state
      clearActivated();

      // Destroy gesture
      if (gesture) {
        gesture.destroy();
      }
      // Remove gesture class
      targetElement.classList.remove(GESTURE_NAME);
    },
  };
};
