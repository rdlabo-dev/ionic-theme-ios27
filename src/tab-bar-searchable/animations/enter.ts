import { Animation, createAnimation } from '@ionic/core';
import { ANIMATION_DELAY_CLOSE_BUTTONS, OPACITY_TRANSITION, type ElementReferences, type ElementSizes } from '@rdlabo/ionic-theme-utils';
import { cloneElement } from '../../utils';

export const createEffectAnimation = (references: ElementReferences, sizes: ElementSizes): Animation => {
  const effectElement = cloneElement('ion-icon');
  const closeButtonRect = references.closeButtonIcon?.getBoundingClientRect();
  const iconName = references.selectedTabButtonIcon?.getAttribute('name');
  const selectedTabButtonIconRect = references.selectedTabButtonIcon?.getBoundingClientRect();

  return createAnimation()
    .addElement(effectElement)
    .beforeAddWrite(() => {
      effectElement.style.display = 'inline-block';
      references.closeButtonIcon.style.opacity = '0';
      if (iconName && closeButtonRect) {
        effectElement.setAttribute('name', iconName);
        effectElement.style.width = `${closeButtonRect.width}px`;
        effectElement.style.height = `${closeButtonRect.height}px`;
      }
    })
    .afterAddWrite(() => {
      effectElement.style.display = 'none';
      references.closeButtonIcon.style.opacity = '1';
    })
    .fromTo(
      'transform',
      `translate3d(${selectedTabButtonIconRect.left}px, ${selectedTabButtonIconRect.top}px, 0)`,
      `translate3d(${closeButtonRect.left}px, ${closeButtonRect.top}px, 0)`,
    );
};

export const createSearchContainerAnimation = (references: ElementReferences, sizes: ElementSizes): Animation => {
  return createAnimation()
    .addElement(references.searchContainer)
    .beforeAddWrite(() => (references.searchContainer.style.transformOrigin = 'right center'))
    .fromTo(
      'transform',
      `scale(${sizes.fabButton.width / sizes.searchContainer.width}, ${sizes.fabButton.height / sizes.searchContainer.height})`,
      'scale(1)',
    )
    .fromTo('opacity', '0.2', '1');
};

export const createCloseButtonsAnimation = (references: ElementReferences): Animation => {
  return createAnimation()
    .delay(ANIMATION_DELAY_CLOSE_BUTTONS)
    .addElement(references.closeButtons)
    .beforeAddWrite(() => (references.closeButtons.style.transformOrigin = 'left center'))
    .afterClearStyles(['transform', 'transform-origin'])
    .fromTo('transform', 'scale(1.5, 1)', 'scale(1)');
};

export const createTabBarAnimation = (ionTabBar: HTMLElement, references: ElementReferences, sizes: ElementSizes): Animation => {
  return createAnimation()
    .addElement(ionTabBar)
    .beforeAddWrite(() => {
      ionTabBar.querySelectorAll<HTMLElement>('ion-tab-button').forEach((element: HTMLElement) => {
        element.style.transition = OPACITY_TRANSITION;
        element.style.opacity = '0';
      });
      references.selectedTabButton.classList.remove('tab-selected');
      const iconName = references.selectedTabButtonIcon?.getAttribute('name');
      if (iconName) {
        references.closeButtonIcon?.setAttribute('name', iconName);
      }
    })
    .afterAddWrite(() => {
      references.selectedTabButton.classList.add('tab-selected');
      ionTabBar.style.pointerEvents = 'none';
    })
    .fromTo(
      'transform',
      'scale(1)',
      `scale(${sizes.closeButton.width / sizes.tabBar.width}, ${sizes.closeButton.height / sizes.tabBar.height})`,
    )
    .fromTo('opacity', '1', '0');
};

export const createFabButtonAnimation = (ionFabButton: HTMLElement): Animation => {
  return createAnimation()
    .addElement(ionFabButton)
    .beforeAddWrite(() => {
      ionFabButton.style.transformOrigin = 'center right';
      ionFabButton.querySelector<HTMLElement>('ion-icon')?.style.setProperty('opacity', '0');
    })
    .afterAddWrite(() => {
      ionFabButton.style.pointerEvents = 'none';
    })
    .fromTo('opacity', '1', '0');
};
