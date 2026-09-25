import { AnimationPosition } from './sheets-of-glass/interfaces';
import { IonicConfig } from '@ionic/core';

declare const __zone_symbol__requestAnimationFrame: ((callback: FrameRequestCallback) => number) | undefined;
declare const requestAnimationFrame: ((callback: FrameRequestCallback) => number) | undefined;

export const getElementRoot = (el: HTMLElement, fallback: HTMLElement = el) => {
  return el.shadowRoot || fallback;
};

export const raf = (h: FrameRequestCallback) => {
  if (typeof __zone_symbol__requestAnimationFrame === 'function') {
    return __zone_symbol__requestAnimationFrame(h);
  }
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(h);
  }
  return setTimeout(h);
};

export const cloneElement = (tagName: string, useCache: boolean = true): HTMLElement => {
  if (useCache) {
    const cachedElement = document.querySelector(`${tagName}.ion-cloned-element`);
    if (cachedElement !== null) {
      return cachedElement as HTMLElement;
    }
  }

  const clonedEl = document.createElement(tagName) as HTMLElement;
  clonedEl.classList.add('ion-cloned-element');
  clonedEl.style.setProperty('display', 'none');
  document.body.appendChild(clonedEl);

  return clonedEl;
};

export const getStep = (targetX: number, animationPosition: AnimationPosition) => {
  if (animationPosition === undefined) {
    return 0;
  }
  const currentX = targetX - animationPosition.width / 2;
  let progress = (currentX - animationPosition.minPositionX) / (animationPosition.maxPositionX - animationPosition.minPositionX);
  progress = Math.max(0, Math.min(1, progress)); // clamp 0〜1
  return progress;
};

export const changeSelectedElement = (
  targetElement: HTMLElement,
  selectedElement: HTMLElement,
  effectTagName: string,
  selectedClassName: string,
): void => {
  targetElement.querySelectorAll(effectTagName).forEach((element) => {
    element.classList.remove(selectedClassName);
    element.classList.remove('ion-activated');
  });
  selectedElement.classList.add('ion-activated');
};

export class Config {
  private m = new Map<keyof IonicConfig, unknown>();

  reset(configObj: IonicConfig) {
    this.m = new Map<keyof IonicConfig, unknown>(Object.entries(configObj) as [keyof IonicConfig, unknown][]);
  }

  get<T>(key: keyof IonicConfig, fallback?: T): T {
    const value = this.m.get(key);
    return value !== undefined ? (value as T) : (fallback as T);
  }

  getBoolean(key: keyof IonicConfig, fallback = false): boolean {
    const val = this.m.get(key);
    if (val === undefined) {
      return fallback;
    }
    if (typeof val === 'string') {
      return val === 'true';
    }
    return !!val;
  }

  getNumber(key: keyof IonicConfig, fallback?: number): number {
    const val = parseFloat(String(this.m.get(key)));
    return isNaN(val) ? (fallback !== undefined ? fallback : NaN) : val;
  }

  set(key: keyof IonicConfig, value: unknown) {
    this.m.set(key, value);
  }
}

export const config = /*@__PURE__*/ new Config();
