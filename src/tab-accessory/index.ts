import { createGesture } from '@ionic/core';
import type { Gesture, GestureDetail } from '@ionic/core';
import { isNativeUIShell } from '../native-integration';
import type { registeredEffect } from '../sheets-of-glass/interfaces';

export const TAB_ACCESSORY_SELECTOR = 'ion-toolbar.tab-accessory, ion-toolbar.ios-theme-tab-accessory';
export const TAB_ACCESSORY_LIFT_SELECTOR =
  '[data-tab-accessory-lift], .tab-accessory-lift, .ios-theme-tab-accessory-lift';
export const TAB_ACCESSORY_PANNING_X_CLASS = 'tab-accessory-panning-x';
export const TAB_ACCESSORY_PANNING_X_ALIAS = 'ios-theme-tab-accessory-panning-x';
export const TAB_ACCESSORY_GESTURE_ACTIVE_CLASS = 'tab-accessory-gesture-active';
export const TAB_ACCESSORY_SWIPING_CLASS = 'tab-accessory-swiping';

const PLAY_SELECTOR = '[data-tab-accessory="play"], ion-button[slot="end"]';
const OPEN_DISTANCE = 50;
const OPEN_VELOCITY = -0.3;
const GESTURE_NAME = 'tab-accessory-swipe';

export interface TabAccessoryOptions {
  liftTarget?: HTMLElement;
  onActivate?: (toolbar: HTMLElement) => void;
}

const liftOf = (toolbar: HTMLElement, options?: TabAccessoryOptions): HTMLElement =>
  options?.liftTarget ?? toolbar.closest<HTMLElement>(TAB_ACCESSORY_LIFT_SELECTOR) ?? toolbar;

const playHit = (event: Event | undefined): boolean => {
  const target = event?.target;
  return target instanceof Element && !!target.closest(PLAY_SELECTOR);
};

const panningX = (el: HTMLElement): boolean =>
  el.classList.contains(TAB_ACCESSORY_PANNING_X_CLASS) ||
  el.classList.contains(TAB_ACCESSORY_PANNING_X_ALIAS) ||
  !!el.closest(`.${TAB_ACCESSORY_PANNING_X_CLASS}, .${TAB_ACCESSORY_PANNING_X_ALIAS}`);

const hidden = (el: HTMLElement): boolean => el.style.opacity === '0';

const resetLift = (el: HTMLElement, later: (fn: () => void, ms: number) => void): void => {
  el.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
  el.style.transform = 'translateY(0)';
  el.style.opacity = '1';
  el.classList.remove(TAB_ACCESSORY_GESTURE_ACTIVE_CLASS, TAB_ACCESSORY_SWIPING_CLASS);
  later(() => {
    el.style.transition = '';
  }, 300);
};

/**
 * Swipe-up on a web/classic tab accessory: follow-the-finger lift + fade, then activate
 * the host toolbar (click). Matches native `onTap`. Skips Native UI Shell hosts.
 * Put `.tab-accessory-lift` or `.ios-theme-tab-accessory-lift` (or `data-tab-accessory-lift`)
 * on a wrapper to lift that node instead of the toolbar. Hosts may set
 * `.tab-accessory-panning-x` (or `.ios-theme-tab-accessory-panning-x`)
 * while they own a horizontal gesture so swipe-up does not steal it.
 */
export const attachTabAccessory = (toolbar: HTMLElement, options?: TabAccessoryOptions): registeredEffect | undefined => {
  if (!toolbar.matches(TAB_ACCESSORY_SELECTOR) || isNativeUIShell(toolbar)) return;

  let gesture: Gesture | undefined;
  let opening = false;
  const timers: number[] = [];
  const win = (): Window | null => toolbar.ownerDocument.defaultView;
  const later = (fn: () => void, ms: number): void => {
    const id = win()?.setTimeout(fn, ms);
    if (id !== undefined) timers.push(id);
  };
  const lift = (): HTMLElement => liftOf(toolbar, options);
  const skip = (): boolean => opening || panningX(lift()) || hidden(lift()) || isNativeUIShell(toolbar);

  const activate = (): void => {
    if (opening) return;
    opening = true;
    gesture?.enable(false);
    const el = lift();
    const height = win()?.innerHeight ?? 800;
    el.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
    el.style.transform = `translateY(${-height}px)`;
    el.style.opacity = '0';
    later(() => {
      (options?.onActivate ?? ((host: HTMLElement) => host.click()))(toolbar);
      el.style.transition = 'transform 0s, opacity 0s';
      el.style.transform = 'translateY(0)';
      el.classList.remove(TAB_ACCESSORY_GESTURE_ACTIVE_CLASS, TAB_ACCESSORY_SWIPING_CLASS);
      opening = false;
      gesture?.enable(true);
    }, 200);
  };

  gesture = createGesture({
    el: lift(),
    gestureName: GESTURE_NAME,
    direction: 'y',
    threshold: 10,
    maxAngle: 45,
    gesturePriority: 20,
    passive: false,
    disableScroll: true,
    canStart: (detail: GestureDetail) => !playHit(detail.event) && !skip(),
    onStart: () => {
      const el = lift();
      el.classList.add(TAB_ACCESSORY_GESTURE_ACTIVE_CLASS);
      el.style.transition = 'none';
      el.style.opacity = '1';
    },
    onMove: (detail: GestureDetail) => {
      if (skip()) return;
      if (detail.deltaY >= 0) return;
      const el = lift();
      const height = toolbar.ownerDocument.defaultView?.innerHeight ?? 800;
      const translateY = Math.max(detail.deltaY, -height);
      el.style.transform = `translateY(${translateY}px)`;
      el.style.opacity = String(Math.max(0, Math.min(1, 1 - Math.abs(translateY) / (height / 2))));
      if (Math.abs(detail.deltaY) > 20) el.classList.add(TAB_ACCESSORY_SWIPING_CLASS);
      if (detail.deltaY <= -height / 2) activate();
    },
    onEnd: (detail: GestureDetail) => {
      if (opening) return;
      if (panningX(lift())) {
        resetLift(lift(), later);
        return;
      }
      if (detail.deltaY < -OPEN_DISTANCE || detail.velocityY < OPEN_VELOCITY) activate();
      else resetLift(lift(), later);
    },
  });
  gesture.enable(true);

  return {
    destroy: () => {
      for (const id of timers) win()?.clearTimeout(id);
      timers.length = 0;
      gesture?.destroy();
      gesture = undefined;
    },
  };
};

const enabled = new WeakMap<object, registeredEffect>();

/** Observes `ion-toolbar.tab-accessory` (and the `ios-theme-tab-accessory` alias) and attaches swipe-up. Call once at app start. */
export const enableTabAccessory = (root?: ParentNode): registeredEffect => {
  const scope = root ?? (typeof document === 'undefined' ? undefined : document);
  if (!scope) return { destroy: () => {} };
  const existing = enabled.get(scope);
  if (existing) return existing;

  const live = new Map<HTMLElement, registeredEffect>();
  const sync = (): void => {
    for (const [toolbar, effect] of live) {
      if (!toolbar.isConnected || isNativeUIShell(toolbar)) {
        effect.destroy();
        live.delete(toolbar);
      }
    }
    for (const toolbar of Array.from(scope.querySelectorAll<HTMLElement>(TAB_ACCESSORY_SELECTOR))) {
      if (live.has(toolbar) || isNativeUIShell(toolbar) || !toolbar.isConnected) continue;
      const effect = attachTabAccessory(toolbar);
      if (effect) live.set(toolbar, effect);
    }
  };

  const observer = new MutationObserver(sync);
  observer.observe(scope instanceof Document ? scope.documentElement : (scope as Node), {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-native-ui-shell'],
  });
  sync();

  const handle: registeredEffect = {
    destroy: () => {
      observer.disconnect();
      for (const effect of live.values()) effect.destroy();
      live.clear();
      enabled.delete(scope);
    },
  };
  enabled.set(scope, handle);
  return handle;
};
