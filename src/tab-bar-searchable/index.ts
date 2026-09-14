import { createAnimation } from '@ionic/core';
import { isNativeUIShell, registerNativeSearch, requestNativeSearch, suspendNativeUIShell } from '../native-integration';
import {
  ANIMATION_DELAY_BASE,
  ANIMATION_DURATION,
  ANIMATION_EASING,
  getElementReferences,
  getElementSizes,
  throwErrorByFailedClickElement,
} from './utils';
import { SearchableEventCache, TabBarSearchableFunction, TabBarSearchableType } from './interfaces';
import {
  createCloseButtonsAnimation,
  createEffectAnimation,
  createFabButtonAnimation,
  createSearchContainerAnimation,
  createTabBarAnimation,
} from './animations/enter';
import {
  createReverseCloseButtonsAnimation,
  createReverseEffectAnimation,
  createReverseFabButtonAnimation,
  createReverseSearchContainerAnimation,
  createReverseTabBarAnimation,
} from './animations/leave';

export * from './interfaces';

/**
 *  <ion-fab vertical="bottom" horizontal="end" slot="fixed">
 *   <ion-fab-button (click)="present($event)">
 *     <ion-icon name="search"></ion-icon>
 *   </ion-fab-button>
 *  </ion-fab>
 *  <ion-footer [translucent]="true">
 *   <ion-toolbar>
 *     <ion-buttons slot="start">
 *     <!-- ion-icon does not need `name` attribute. -->
 *       <ion-button fill="default"><ion-icon slot="icon-only"></ion-icon>
 *     </ion-button>
 *     </ion-buttons>
 *     <!-- User set `ionChange` or other events. -->
 *     <ion-searchbar (ionChange)="example($event)"></ion-searchbar>
 *   </ion-toolbar>
 *  </ion-footer>
 **/

export const attachTabBarSearchable = (
  ionTabBar: HTMLElement,
  ionFabButton: HTMLElement,
  ionFooter: HTMLElement,
): TabBarSearchableFunction => {
  if (!ionTabBar || !ionFabButton || !ionFooter) {
    throw new Error('TabBarSearchable should be defined with props');
  }
  // Initialize
  ionFooter.style.pointerEvents = 'none';
  ionFooter.style.opacity = '0';
  const nativeSearch = registerNativeSearch(ionTabBar, ionFabButton, ionFooter);

  // Saved Params
  let searchableEventCache: SearchableEventCache | undefined;
  let resumeNative: (() => void) | undefined;
  // Leave is valid both while native Enter awaits its ack and after it completes.
  let nativeEntry = false;
  let nativeRequest = 0;

  return async (event: Event, type: TabBarSearchableType) => {
    const selector = type === TabBarSearchableType.Enter ? 'ion-fab-button' : 'ion-buttons[slot=start] ion-button';
    if (!(event.target as HTMLElement)?.closest(selector)) throw throwErrorByFailedClickElement(selector);
    if (type === TabBarSearchableType.Leave && !nativeEntry && !searchableEventCache)
      throw new Error('TabBarSearchableType.Leave should be run after TabBarSearchableType.Enter');
    const hadNativeEntry = nativeEntry;
    const request = ++nativeRequest;
    if (type === TabBarSearchableType.Enter) nativeEntry ||= isNativeUIShell(ionFooter);
    const accepted = await requestNativeSearch(nativeSearch, type === TabBarSearchableType.Enter);
    if (request !== nativeRequest) return;
    if (accepted) {
      nativeEntry = type === TabBarSearchableType.Enter;
      return;
    }
    nativeEntry = false;
    if (type === TabBarSearchableType.Leave && hadNativeEntry) {
      // Forced native retirement already restored the closed Web presentation.
      return;
    }
    if (type === TabBarSearchableType.Enter) {
      resumeNative ??= await suspendNativeUIShell([ionTabBar, ionFooter, ionFabButton.closest('ion-fab') ?? ionFabButton]);
      try {
        searchableEventCache = await enterEvent(event, ionTabBar, ionFabButton, ionFooter);
      } catch (error) {
        resumeNative();
        resumeNative = undefined;
        throw error;
      }
    } else if (searchableEventCache !== undefined) {
      try {
        await leaveEvent(event, searchableEventCache, ionTabBar, ionFabButton, ionFooter);
        searchableEventCache = undefined;
      } finally {
        resumeNative?.();
        resumeNative = undefined;
      }
    } else {
      throw new Error('TabBarSearchableType.Leave should be run after TabBarSearchableType.Enter');
    }
  };
};

const enterEvent = async (
  event: Event,
  ionTabBar: HTMLElement,
  ionFabButton: HTMLElement,
  ionFooter: HTMLElement,
): Promise<SearchableEventCache> => {
  if (!(event.target as HTMLElement)?.closest('ion-fab-button')) {
    throw throwErrorByFailedClickElement('ion-fab-button');
  }

  const references = getElementReferences(ionTabBar, ionFooter);
  const sizes = getElementSizes(ionTabBar, ionFabButton, references);
  const colorSelected = references.selectedTabButton
    ? getComputedStyle(references.selectedTabButton).getPropertyValue('--color-selected').trim()
    : '';

  const effectAnimation = createEffectAnimation(references, sizes);
  const searchContainerAnimation = createSearchContainerAnimation(references, sizes);
  const closeButtonsAnimation = createCloseButtonsAnimation(references);
  const tabBarAnimation = createTabBarAnimation(ionTabBar, references, sizes);
  const fabButtonAnimation = createFabButtonAnimation(ionFabButton);

  await createAnimation()
    .delay(ANIMATION_DELAY_BASE)
    .duration(ANIMATION_DURATION)
    .easing(ANIMATION_EASING)
    .addElement(ionFooter)
    .afterAddWrite(() => (ionFooter.style.pointerEvents = 'auto'))
    .fromTo('opacity', '0.8', '1')
    .addAnimation([tabBarAnimation, fabButtonAnimation, searchContainerAnimation, effectAnimation, closeButtonsAnimation])
    .play();

  return {
    elementSizes: sizes,
    colorSelected,
  };
};

const leaveEvent = async (
  event: Event,
  searchableEventCache: SearchableEventCache,
  ionTabBar: HTMLElement,
  ionFabButton: HTMLElement,
  ionFooter: HTMLElement,
): Promise<void> => {
  if (!(event.target as HTMLElement)?.closest('ion-buttons[slot=start] ion-button')) {
    throw throwErrorByFailedClickElement('ion-buttons[slot=start] ion-button');
  }

  const references = getElementReferences(ionTabBar, ionFooter);

  const effectAnimation = createReverseEffectAnimation(references, searchableEventCache.elementSizes, searchableEventCache.colorSelected);
  const searchContainerAnimation = createReverseSearchContainerAnimation(references, searchableEventCache.elementSizes);
  const closeButtonsAnimation = createReverseCloseButtonsAnimation(references);
  const tabBarAnimation = createReverseTabBarAnimation(ionTabBar, references, searchableEventCache.elementSizes);
  const fabButtonAnimation = createReverseFabButtonAnimation(ionFabButton, searchableEventCache.elementSizes);

  await createAnimation()
    .delay(ANIMATION_DELAY_BASE)
    .duration(ANIMATION_DURATION)
    .easing(ANIMATION_EASING)
    .addElement(ionFooter)
    .afterAddWrite(() => (ionFooter.style.pointerEvents = 'none'))
    .fromTo('opacity', '1', '0')
    .addAnimation([tabBarAnimation, fabButtonAnimation, searchContainerAnimation, effectAnimation, closeButtonsAnimation])
    .play();
};
