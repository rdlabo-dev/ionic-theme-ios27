import { createAnimation } from '@ionic/core';
import {
  ANIMATION_DELAY_BASE,
  ANIMATION_DURATION,
  ANIMATION_EASING,
  getElementReferences,
  getElementSizes,
  throwErrorByFailedClickElement,
  type SearchableEventCache,
  type TabBarSearchableFunction,
  TabBarSearchableType,
} from '@rdlabo/ionic-theme-utils';
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

export {
  TabBarSearchableType,
  type TabBarSearchableFunction,
  type SearchableEventCache,
  type ElementSizes,
  type ElementReferences,
} from '@rdlabo/ionic-theme-utils';

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
  ionTabBar.style.transformOrigin = 'left center';

  // Saved Params
  let searchableEventCache: SearchableEventCache | undefined;

  return async (event: Event, type: TabBarSearchableType) => {
    if (type === TabBarSearchableType.Enter) {
      searchableEventCache = await enterEvent(event, ionTabBar, ionFabButton, ionFooter);
    } else if (searchableEventCache !== undefined) {
      await leaveEvent(event, searchableEventCache, ionTabBar, ionFabButton, ionFooter);
      searchableEventCache = undefined;
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
