import { AnimationPosition, EffectScales, registeredEffect } from './interfaces';
import { createGesture } from '@ionic/core';
import type { Animation, Gesture, GestureDetail } from '@ionic/core';
import { changeSelectedElement, cloneElement, getStep } from '../utils';
import { createMoveAnimation, createPreMoveAnimation, getMoveAnimationKeyframe, getScaleAnimation } from './animations';

const GESTURE_NAME = 'ios26-enable-gesture';
const ANIMATED_NAME = 'ios26-animated';

/** Local shell gate — no native-integration module on this branch. */
const isNativeUIShell = (element: HTMLElement) => element.hasAttribute('data-native-ui-shell');

const isTabDisabled = (element: HTMLElement | undefined) =>
  !!element &&
  (element.hasAttribute('disabled') ||
    element.classList.contains('tab-disabled') ||
    (element as HTMLElement & { disabled?: boolean }).disabled === true);

export const registerEffect = (
  targetElement: HTMLElement,
  effectTagName: string,
  selectedClassName: string,
  scales: EffectScales,
): registeredEffect | undefined => {
  const doc = targetElement.ownerDocument;
  const win = doc.defaultView;
  if (!targetElement.classList.contains('ios') || !win || targetElement.matches(`.${GESTURE_NAME}, .ios-theme-disabled, .ios26-disabled`)) {
    return undefined;
  }
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) {
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
  let destroyed = false;
  let session = 0;
  let endingSession = -1;
  let observedClick = false;
  const activeAnimations = new Set<Animation>();
  const playAnimation = (animation: Animation) => {
    activeAnimations.add(animation);
    return animation.play().finally(() => {
      activeAnimations.delete(animation);
      animation.destroy();
    });
  };
  // Each registration owns its clone so multiple bars never share one node.
  const effectElement = cloneElement(effectTagName, false);
  let onPointerUp: ((event: PointerEvent) => void) | undefined;
  let onPointerCancel: ((event: PointerEvent) => void) | undefined;

  const removePointerEndListeners = () => {
    if (onPointerUp) {
      doc.removeEventListener('pointerup', onPointerUp);
      onPointerUp = undefined;
    }
    if (onPointerCancel) {
      doc.removeEventListener('pointercancel', onPointerCancel);
      onPointerCancel = undefined;
    }
  };

  const cancelActiveGesture = () => {
    session++;
    for (const animation of activeAnimations) animation.destroy();
    activeAnimations.clear();
    startAnimationPromise = undefined;
    scaleAnimationPromise = undefined;
    removePointerEndListeners();
    if (clearActivatedTimer !== undefined) {
      clearTimeout(clearActivatedTimer);
      clearActivatedTimer = undefined;
    }
    currentTouchedElement?.classList.remove('ion-activated');
    // Preserve a committed selection, or restore the original if the press was cancelled.
    if (!currentTouchedElement?.classList.contains(selectedClassName)) {
      selectedElementBeforeGesture?.classList.add(selectedClassName);
    }
    currentTouchedElement = undefined;
    selectedElementBeforeGesture = undefined;
    moveAnimation?.destroy();
    moveAnimation = undefined;
    effectElement.style.display = 'none';
    maxVelocity = 0;
    targetElement.classList.remove(ANIMATED_NAME);
  };

  /**
   * These event listeners fix a bug where gestures don't complete properly.
   * They terminate the gesture using native events as a fallback.
   */
  const onPointerDown = (_event: PointerEvent) => {
    if (destroyed || isNativeUIShell(targetElement) || reducedMotion.matches || _event.button !== 0 || !_event.isPrimary) return;
    cancelActiveGesture();
    const pointerSession = session;
    observedClick = false;
    gesture.destroy();
    createAnimationGesture();
    removePointerEndListeners();
    onPointerUp = (event) => {
      if (event.pointerId !== _event.pointerId) return;
      clearActivatedTimer = setTimeout(async () => {
        await onEndGesture();
        if (destroyed || pointerSession !== session) return;
        gesture.destroy();
        createAnimationGesture();
      });
      removePointerEndListeners();
    };
    onPointerCancel = (event) => {
      if (event.pointerId !== _event.pointerId) return;
      cancelActiveGesture();
      if (destroyed) return;
      gesture.destroy();
      createAnimationGesture();
    };
    doc.addEventListener('pointerup', onPointerUp);
    doc.addEventListener('pointercancel', onPointerCancel);
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
    gesture.enable(!isNativeUIShell(targetElement) && !reducedMotion.matches);
  };
  createAnimationGesture();

  const clearActivated = (isEndGesture: boolean = false) => {
    if (!currentTouchedElement) {
      return;
    }
    currentTouchedElement.classList.remove('ion-activated');
    currentTouchedElement = undefined;
    selectedElementBeforeGesture = undefined;
    effectElement.style.display = 'none';
    maxVelocity = 0;
    targetElement.classList.remove(ANIMATED_NAME);
  };

  const onStartGesture = (detail: GestureDetail): boolean | undefined => {
    if (destroyed || isNativeUIShell(targetElement) || reducedMotion.matches || !effectElement.shadowRoot) return false;
    currentTouchedElement = ((detail.event.target as HTMLElement).closest(effectTagName) as HTMLElement) || undefined;
    if (isTabDisabled(currentTouchedElement)) {
      currentTouchedElement = undefined;
      return false;
    }
    const tabSelectedElement = targetElement.querySelector(`${effectTagName}.${selectedClassName}`);
    if (currentTouchedElement === undefined || tabSelectedElement === null) {
      return false;
    }
    selectedElementBeforeGesture = tabSelectedElement as HTMLElement;
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
        return playAnimation(preMoveAnimation);
      }
    })();
    startAnimationPromise = startAnimation;
    const startSession = session;
    startAnimation.then(() => {
      if (destroyed || startSession !== session || !currentTouchedElement) {
        return;
      }
      moveAnimation = createMoveAnimation(effectElement, detail, tabSelectedElement, animationPosition!);
      moveAnimation.progressStart(
        true,
        getStep(currentTouchedElement.getBoundingClientRect().left + currentTouchedElement.clientWidth / 2, animationPosition!),
      );
    });
    void playAnimation(getScaleAnimation(effectElement).duration(200).to('opacity', 1).to('transform', scales.large));
    return true;
  };

  const onMoveGesture = (detail: GestureDetail): boolean | undefined => {
    if (destroyed || currentTouchedElement === undefined || !moveAnimation) {
      return false; // Skip Animation
    }
    if (scaleAnimationPromise === undefined) {
      if (Math.abs(detail.velocityX) > maxVelocity) {
        maxVelocity = Math.abs(detail.velocityX);
      }
      if (Math.abs(detail.velocityX) > 0.2) {
        const pending = playAnimation(
          getScaleAnimation(effectElement).duration(720).keyframes(getMoveAnimationKeyframe('slowly', scales)),
        ).finally(() => {
          if (scaleAnimationPromise === pending) scaleAnimationPromise = undefined;
        });
        scaleAnimationPromise = pending;
      }
      if (maxVelocity > 0.2 && Math.abs(detail.velocityX) < 0.15 && Math.abs(detail.startX - detail.currentX) > 100) {
        const pending = playAnimation(
          getScaleAnimation(effectElement)
            .duration(720)
            .keyframes(getMoveAnimationKeyframe(detail.velocityX > 0 ? 'moveRight' : 'moveLeft', scales)),
        ).finally(() => {
          if (scaleAnimationPromise === pending) scaleAnimationPromise = undefined;
        });
        scaleAnimationPromise = pending;
        maxVelocity = 0;
      }
    }

    const currentX = detail.currentX;
    const previousY = targetElement.getBoundingClientRect().top + targetElement.getBoundingClientRect().height / 2;
    const nextEl = (targetElement.getRootNode() as Document | ShadowRoot).elementFromPoint(currentX, previousY);
    const latestTouchedElement = (nextEl?.closest(effectTagName) as HTMLElement) || undefined;

    if (latestTouchedElement && !isTabDisabled(latestTouchedElement) && currentTouchedElement !== latestTouchedElement) {
      currentTouchedElement = latestTouchedElement;
      changeSelectedElement(targetElement, currentTouchedElement, effectTagName, selectedClassName);
    }
    moveAnimation.progressStep(getStep(detail.currentX, animationPosition!));
    return true;
  };

  const onEndGesture = async (): Promise<boolean | undefined> => {
    const endSession = session;
    if (endingSession === endSession) return false;
    endingSession = endSession;
    // タイマーをクリア（正常にonEndGestureが実行された場合）
    if (clearActivatedTimer !== undefined) {
      clearTimeout(clearActivatedTimer);
      clearActivatedTimer = undefined;
    }

    if (destroyed || !currentTouchedElement) {
      return false;
    }

    // Native click follows pointerup. Let Ionic/app routing consume that click
    // before synthesizing one for a drag that ended on another tab.
    await new Promise<void>((resolve) => win.setTimeout(resolve, 0));
    if (destroyed || endSession !== session || !currentTouchedElement) return false;
    if (!observedClick && !currentTouchedElement.classList.contains(selectedClassName)) {
      currentTouchedElement.click();
      currentTouchedElement.classList.add(selectedClassName);
    }

    if (startAnimationPromise) {
      await startAnimationPromise;
    }

    if (destroyed || endSession !== session || currentTouchedElement === undefined || !moveAnimation) {
      return false;
    }

    setTimeout(() => {
      if (destroyed || endSession !== session || !currentTouchedElement || !moveAnimation) {
        return;
      }
      const targetX = currentTouchedElement.getBoundingClientRect().left + currentTouchedElement.clientWidth / 2;
      const step = getStep(targetX, animationPosition!);
      moveAnimation.progressStep(step);
    });
    await playAnimation(getScaleAnimation(effectElement).duration(120).to('transform', `scale(1, 0.92)`));
    if (destroyed || endSession !== session || !moveAnimation) {
      return false;
    }
    moveAnimation.destroy();

    clearActivated(true);
    return true;
  };

  const nativeChanged = () => {
    if (destroyed) return;
    gesture.enable(!isNativeUIShell(targetElement) && !reducedMotion.matches);
    cancelActiveGesture();
  };
  targetElement.addEventListener('nativeUIShellChange', nativeChanged);
  const clicked = (event: Event) => {
    if (currentTouchedElement?.contains(event.target as Node)) observedClick = true;
  };
  targetElement.addEventListener('click', clicked, true);
  reducedMotion.addEventListener('change', nativeChanged);
  if (isNativeUIShell(targetElement)) nativeChanged();

  return {
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      session++;
      cancelActiveGesture();
      // Remove event listeners
      targetElement.removeEventListener('pointerdown', onPointerDown);
      targetElement.removeEventListener('nativeUIShellChange', nativeChanged);
      targetElement.removeEventListener('click', clicked, true);
      reducedMotion.removeEventListener('change', nativeChanged);

      // Destroy gesture
      if (gesture) {
        gesture.destroy();
      }
      // Remove gesture class
      targetElement.classList.remove(GESTURE_NAME);
      effectElement.remove();
    },
  };
};
