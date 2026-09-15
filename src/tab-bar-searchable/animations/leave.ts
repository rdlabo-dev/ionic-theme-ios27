import { Animation, createAnimation } from '@ionic/core';
import { ANIMATION_DELAY_CLOSE_BUTTONS, OPACITY_TRANSITION, type ElementReferences, type ElementSizes } from '@rdlabo/ionic-theme-utils';
import { cloneElement } from '../../utils';

export const createReverseEffectAnimation = (
  references: ElementReferences,
  searchableElementSizes: ElementSizes,
  colorSelected: string,
): Animation => {
  const effectElement = cloneElement('ion-icon');
  const closeButtonRect = references.closeButtonIcon?.getBoundingClientRect();

  return createAnimation()
    .addElement(effectElement)
    .beforeAddWrite(() => {
      effectElement.style.display = 'inline-block';
      references.closeButtonIcon.style.opacity = '0';
      if (searchableElementSizes.selectedTabButtonIcon) {
        effectElement.style.width = `${searchableElementSizes.selectedTabButtonIcon.width}px`;
        effectElement.style.height = `${searchableElementSizes.selectedTabButtonIcon.height}px`;
        effectElement.style.color = colorSelected;
      }
    })
    .afterAddWrite(() => {
      effectElement.style.display = 'none';
      references.closeButtonIcon.style.opacity = '1';
      effectElement.style.color = '';
    })
    .fromTo(
      'transform',
      `translate3d(${closeButtonRect.left}px, ${closeButtonRect.top}px, 0)`,
      `translate3d(${searchableElementSizes.selectedTabButtonIcon.left}px, ${searchableElementSizes.selectedTabButtonIcon.top}px, 0)`,
    );
};

export const createReverseSearchContainerAnimation = (references: ElementReferences, sizes: ElementSizes): Animation => {
  return createAnimation()
    .addElement(references.searchContainer)
    .beforeAddWrite(() => (references.searchContainer.style.transformOrigin = 'right center'))
    .fromTo(
      'transform',
      'scale(1)',
      `scale(${sizes.fabButton.width / sizes.searchContainer.width}, ${sizes.fabButton.height / sizes.searchContainer.height})`,
    )
    .fromTo('opacity', '1', '0.2');
};

export const createReverseCloseButtonsAnimation = (references: ElementReferences): Animation => {
  return createAnimation()
    .delay(ANIMATION_DELAY_CLOSE_BUTTONS)
    .addElement(references.closeButtons)
    .beforeAddWrite(() => (references.closeButtons.style.transformOrigin = 'left center'))
    .afterClearStyles(['transform', 'transform-origin'])
    .fromTo('transform', 'scale(1)', 'scale(1.5, 1)');
};

export const createReverseTabBarAnimation = (ionTabBar: HTMLElement, references: ElementReferences, sizes: ElementSizes): Animation => {
  return createAnimation()
    .addElement(ionTabBar)
    .beforeAddWrite(() => {
      ionTabBar.style.pointerEvents = 'auto';
      ionTabBar.querySelectorAll<HTMLElement>('ion-tab-button').forEach((element: HTMLElement) => {
        element.style.transition = OPACITY_TRANSITION;
        element.style.opacity = '1';
      });
    })
    .afterClearStyles(['transform', 'opacity'])
    .fromTo(
      'transform',
      `scale(${sizes.closeButton.width / sizes.tabBar.width}, ${sizes.closeButton.height / sizes.tabBar.height})`,
      'scale(1)',
    )
    .fromTo('opacity', '0', '1');
};

export const createReverseFabButtonAnimation = (ionFabButton: HTMLElement, references: ElementSizes): Animation => {
  return createAnimation()
    .addElement(ionFabButton)
    .beforeAddWrite(() => {
      ionFabButton.querySelector<HTMLElement>('ion-icon')?.style.setProperty('opacity', '1');
      ionFabButton.style.transformOrigin = 'center right';
    })
    .afterAddWrite(() => {
      ionFabButton.style.pointerEvents = 'auto';
    })
    .fromTo('opacity', '0', '1')
    .fromTo('transform', `scale(${references.searchContainer.height / references.fabButton.height})`, 'scale(1)');
};
