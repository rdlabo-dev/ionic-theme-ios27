import { createAnimation } from '@ionic/core/components/index.js';
import { addSearchDismissButton } from './dismiss-button';
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
import { isNativeUIShell, registerNativeSearch, requestNativeSearch, suspendNativeUIShell } from '../native-integration';
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
 *     <ion-searchbar aria-label="Search" (ionChange)="example($event)"></ion-searchbar>
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
  ionFooter.classList.add('ios-theme-searchable');
  ionFabButton.closest('ion-fab')?.classList.add('ios-theme-searchable-trigger');
  addSearchDismissButton(ionFooter);
  ionFooter.style.pointerEvents = 'none';
  ionFooter.style.opacity = '0';
  // Search dismissal belongs beside the Web search field, never in the vertical rail.
  ionFooter.querySelector('ion-buttons[slot=start]')?.classList.add('ios-theme-horizontal-only');
  const nativeSearch = registerNativeSearch(ionTabBar, ionFabButton, ionFooter);

  // Saved Params
  let searchableEventCache: SearchableEventCache | undefined;
  let resumeNative: (() => void) | undefined;
  // Leave is valid both while native Enter awaits its ack and after it completes.
  let nativeEntry = false;
  let nativeRequest = 0;
  let verticalSearch = false;
  let tabVisibilityObserver: MutationObserver | undefined;

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
      verticalSearch = !!ionTabBar.closest('ion-app.ios-theme-vertical-bars');
      if (verticalSearch) {
        // Ionic hides horizontal tabs when the keyboard opens; keep this rail available.
        const keepTabsVisible = () => {
          if (ionTabBar.classList.contains('tab-bar-hidden') && ionTabBar.closest('ion-app.ios-theme-vertical-bars')) {
            ionTabBar.classList.remove('tab-bar-hidden');
          }
        };
        tabVisibilityObserver?.disconnect();
        tabVisibilityObserver = new MutationObserver(keepTabsVisible);
        tabVisibilityObserver.observe(ionTabBar, { attributes: true, attributeFilter: ['class'] });
        keepTabsVisible();
      }
      resumeNative ??= await suspendNativeUIShell([
        ...(verticalSearch ? [] : [ionTabBar]),
        ionFooter,
        ionFabButton.closest('ion-fab') ?? ionFabButton,
      ]);
      try {
        searchableEventCache = await enterEvent(event, ionTabBar, ionFabButton, ionFooter, verticalSearch);
      } catch (error) {
        tabVisibilityObserver?.disconnect();
        resumeNative();
        resumeNative = undefined;
        throw error;
      }
    } else if (searchableEventCache !== undefined) {
      try {
        await leaveEvent(event, searchableEventCache, ionTabBar, ionFabButton, ionFooter, verticalSearch);
        searchableEventCache = undefined;
      } finally {
        tabVisibilityObserver?.disconnect();
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
  verticalSearch: boolean,
): Promise<SearchableEventCache> => {
  if (!(event.target as HTMLElement)?.closest('ion-fab-button')) {
    throw throwErrorByFailedClickElement('ion-fab-button');
  }

  const references = getElementReferences(ionTabBar, ionFooter);
  const sizes = getElementSizes(ionTabBar, ionFabButton, references);
  const colorSelected = references.selectedTabButton
    ? getComputedStyle(references.selectedTabButton).getPropertyValue('--color-selected').trim()
    : '';

  if (verticalSearch) references.closeButtonIcon.setAttribute('name', 'close');
  const tabAnimations = verticalSearch
    ? []
    : [createTabBarAnimation(ionTabBar, references, sizes), createEffectAnimation(references, sizes)];
  const searchContainerAnimation = createSearchContainerAnimation(references, sizes);
  const closeButtonsAnimation = createCloseButtonsAnimation(references);
  const fabButtonAnimation = createFabButtonAnimation(ionFabButton);

  await createAnimation()
    .delay(ANIMATION_DELAY_BASE)
    .duration(ANIMATION_DURATION)
    .easing(ANIMATION_EASING)
    .addElement(ionFooter)
    .afterAddWrite(() => (ionFooter.style.pointerEvents = 'auto'))
    .fromTo('opacity', '0.8', '1')
    .addAnimation([...tabAnimations, fabButtonAnimation, searchContainerAnimation, closeButtonsAnimation])
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
  verticalSearch: boolean,
): Promise<void> => {
  if (!(event.target as HTMLElement)?.closest('ion-buttons[slot=start] ion-button')) {
    throw throwErrorByFailedClickElement('ion-buttons[slot=start] ion-button');
  }

  const focused = ionFooter.ownerDocument.activeElement;
  if (focused instanceof HTMLElement && ionFooter.contains(focused)) focused.blur();
  const references = getElementReferences(ionTabBar, ionFooter);

  const tabAnimations = verticalSearch
    ? []
    : [
        createReverseTabBarAnimation(ionTabBar, references, searchableEventCache.elementSizes),
        createReverseEffectAnimation(references, searchableEventCache.elementSizes, searchableEventCache.colorSelected),
      ];
  const searchContainerAnimation = createReverseSearchContainerAnimation(references, searchableEventCache.elementSizes);
  const closeButtonsAnimation = createReverseCloseButtonsAnimation(references);
  const fabButtonAnimation = createReverseFabButtonAnimation(ionFabButton, searchableEventCache.elementSizes);

  await createAnimation()
    .delay(ANIMATION_DELAY_BASE)
    .duration(ANIMATION_DURATION)
    .easing(ANIMATION_EASING)
    .addElement(ionFooter)
    .afterAddWrite(() => (ionFooter.style.pointerEvents = 'none'))
    .fromTo('opacity', '1', '0')
    .addAnimation([...tabAnimations, fabButtonAnimation, searchContainerAnimation, closeButtonsAnimation])
    .play();
};
