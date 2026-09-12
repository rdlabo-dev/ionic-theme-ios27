import { AnimationPosition, EffectScales, registeredEffect } from './interfaces';
import { createAnimation, createGesture } from '@ionic/core';
import type { Animation, Gesture, GestureDetail } from '@ionic/core';
import { changeSelectedElement, cloneElement, getStep } from '../utils';
import {
  createMoveAnimation,
  createPreMoveAnimation,
  createTabBarDragAnimation,
  createTabBarPressAnimation,
  createTabBarReleaseAnimation,
  getMoveAnimationKeyframe,
  getScaleAnimation,
} from './animations';

const GESTURE_NAME = 'ios27-enable-gesture';
const ANIMATED_NAME = 'ios27-animated';

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
  let selectedElementBeforeGesture: HTMLElement | undefined;
  let clearActivatedTimer: ReturnType<typeof setTimeout> | undefined;
  let animationPosition: AnimationPosition | undefined = undefined;
  let scaleAnimationPromise: Promise<void> | undefined;
  let startAnimationPromise: Promise<void> | undefined;
  let maxVelocity = 0;
  let releaseAnimation: Animation | undefined;
  let tabPressAnimation: Animation | undefined;
  let tabPressStartedAt = 0;
  let tabDragging = false;
  const originalTabBarScale = targetElement.style.getPropertyValue('--ios27-tab-bar-scale');
  const effectElement = cloneElement(effectTagName, false);
  const stopTabPress = () => {
    if (!tabPressAnimation) return;
    const native = effectElement.shadowRoot!.querySelector<HTMLElement>('[part="native"]')!;
    const transform = getComputedStyle(effectElement).transform;
    const scale = getComputedStyle(native).transform;
    tabPressAnimation.destroy();
    tabPressAnimation = undefined;
    effectElement.style.transform = transform;
    native.style.transform = scale;
  };
  let onPointerUp: (() => void) | undefined;
  let onPointerCancel: (() => void) | undefined;

  const removePointerEndListeners = () => {
    if (onPointerUp) {
      document.removeEventListener('pointerup', onPointerUp);
      onPointerUp = undefined;
    }
    if (onPointerCancel) {
      document.removeEventListener('pointercancel', onPointerCancel);
      onPointerCancel = undefined;
    }
  };

  /**
   * These event listeners fix a bug where gestures don't complete properly.
   * They terminate the gesture using native events as a fallback.
   */
  const onPointerDown = (event: PointerEvent) => {
    stopTabPress();
    tabDragging = false;
    releaseAnimation?.destroy();
    releaseAnimation = undefined;
    clearActivated();
    gesture.destroy();
    createAnimationGesture();
    removePointerEndListeners();
    onPointerUp = () => {
      clearActivatedTimer = setTimeout(async () => {
        await onEndGesture();
        gesture.destroy();
        createAnimationGesture();
      });
      removePointerEndListeners();
    };
    onPointerCancel = () => {
      stopTabPress();
      releaseAnimation?.destroy();
      releaseAnimation = undefined;
      removePointerEndListeners();
      currentTouchedElement?.classList.remove('ion-activated');
      selectedElementBeforeGesture?.classList.add(selectedClassName);
      currentTouchedElement = undefined;
      selectedElementBeforeGesture = undefined;
      moveAnimation?.destroy();
      moveAnimation = undefined;
      effectElement.style.display = 'none';
      maxVelocity = 0;
      targetElement.classList.remove(ANIMATED_NAME);
      gesture.destroy();
      createAnimationGesture();
    };
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
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
      onEnd: (detail) => {
        // Ionic coalesces moves; consume the release coordinate before committing a drag.
        if (effectTagName === 'ion-tab-button' && tabDragging) onMoveGesture(detail);
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
    selectedElementBeforeGesture = undefined;
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
    selectedElementBeforeGesture = tabSelectedElement as HTMLElement;
    if (effectTagName === 'ion-tab-button') {
      // UIKit expands the platter by 14.14pt at both two- and four-tab widths.
      targetElement.style.setProperty('--ios27-tab-bar-scale', String(1 + 14.14 / targetElement.offsetWidth));
    }
    animationPosition = {
      minPositionX: targetElement.getBoundingClientRect().left,
      maxPositionX: targetElement.getBoundingClientRect().right - tabSelectedElement.clientWidth,
      width: tabSelectedElement.clientWidth,
      positionY: tabSelectedElement.getBoundingClientRect().top,
    };
    targetElement.classList.add(ANIMATED_NAME);
    changeSelectedElement(targetElement, currentTouchedElement, effectTagName, selectedClassName);

    if (effectTagName === 'ion-tab-button') {
      moveAnimation = createMoveAnimation(effectElement, detail, tabSelectedElement, animationPosition);
      moveAnimation.progressStart(
        true,
        getStep(tabSelectedElement.getBoundingClientRect().left + tabSelectedElement.clientWidth / 2, animationPosition),
      );
      tabPressAnimation = createTabBarPressAnimation(
        effectElement,
        tabSelectedElement as HTMLElement,
        currentTouchedElement,
        targetElement,
      );
      tabPressStartedAt = performance.now();
      void tabPressAnimation.play();
      return true;
    }

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
    if (currentTouchedElement === undefined || !moveAnimation || releaseAnimation) {
      return false; // Skip Animation
    }
    if (effectTagName === 'ion-tab-button') {
      if (Math.abs(detail.currentX - detail.startX) < 3 && !tabDragging) return;
      tabDragging = true;
      stopTabPress();
      tabPressAnimation = createTabBarDragAnimation(effectElement, targetElement, detail.velocityX);
      void tabPressAnimation.play();
    } else if (scaleAnimationPromise === undefined) {
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
    if (releaseAnimation) return;
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

    const tapElapsed =
      tabPressAnimation && !tabDragging && selectedElementBeforeGesture !== currentTouchedElement
        ? performance.now() - tabPressStartedAt
        : undefined;
    if (tabPressAnimation && !tabDragging && tapElapsed === undefined) {
      // A quick tap still completes the initial stretch before relaxing.
      const pressing = tabPressAnimation;
      const remaining = 200 - (performance.now() - tabPressStartedAt);
      if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
      if (tabPressAnimation !== pressing) return;
    }

    if (currentTouchedElement === undefined || !moveAnimation || releaseAnimation) {
      return false;
    }

    if (effectTagName !== 'ion-tab-button')
      setTimeout(() => {
        if (!currentTouchedElement) {
          return;
        }
        const targetX = currentTouchedElement.getBoundingClientRect().left + currentTouchedElement.clientWidth / 2;
        const step = getStep(targetX, animationPosition!);
        moveAnimation!.progressStep(step);
      });
    if (effectTagName === 'ion-tab-button') {
      stopTabPress();
      moveAnimation.destroy();
      moveAnimation = undefined;
      const releasing = createTabBarReleaseAnimation(
        effectElement,
        currentTouchedElement,
        tapElapsed !== undefined && tapElapsed < 200
          ? {
              elapsed: tapElapsed,
              distance:
                Math.abs(currentTouchedElement.offsetLeft - selectedElementBeforeGesture!.offsetLeft) / currentTouchedElement.offsetWidth,
            }
          : undefined,
      );
      currentTouchedElement.classList.remove('ion-activated');
      releaseAnimation = releasing;
      await releasing.play();
      if (releaseAnimation !== releasing) return;
      clearActivated(true);
      releasing.destroy();
      releaseAnimation = undefined;
    } else {
      await getScaleAnimation(effectElement).duration(120).to('transform', `scale(1, 0.92)`).play();
    }
    moveAnimation?.destroy();

    clearActivated(true);
    return true;
  };

  return {
    destroy: () => {
      stopTabPress();
      releaseAnimation?.destroy();
      releaseAnimation = undefined;
      // Remove event listeners
      targetElement.removeEventListener('pointerdown', onPointerDown);
      removePointerEndListeners();

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
      effectElement.remove();
      if (effectTagName === 'ion-tab-button') {
        if (originalTabBarScale) targetElement.style.setProperty('--ios27-tab-bar-scale', originalTabBarScale);
        else targetElement.style.removeProperty('--ios27-tab-bar-scale');
      }
    },
  };
};
