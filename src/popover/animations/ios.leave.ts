import { createAnimation } from '@ionic/core';
import { getElementRoot } from '../../utils';

import type { Animation } from '@ionic/core';

/**
 * iOS Popover Leave Animation
 */
export const iosLeaveAnimation = (baseEl: HTMLElement): Animation => {
  const root = getElementRoot(baseEl);
  const contentEl = root.querySelector('.popover-content') as HTMLElement;
  const arrowEl = root.querySelector('.popover-arrow') as HTMLElement | null;

  const baseAnimation = createAnimation();
  const backdropAnimation = createAnimation();
  const contentAnimation = createAnimation();
  const targetAnimation = createAnimation();
  const surfaceAnimation = createAnimation()
    .addElement(Array.from(root.querySelectorAll<HTMLElement>('.ios-theme-callout-layer')))
    .duration(400)
    .easing('ease')
    .fromTo('opacity', 0.99, 0)
    .fromTo('transform', 'scale(1)', 'scale(0)');

  const doc = baseEl.ownerDocument as any;
  const replaceElement = doc.querySelector('.ios26-replace-element') as HTMLElement | null;

  if (replaceElement) {
    const ratio = contentEl.getBoundingClientRect().width / contentEl.getBoundingClientRect().height;
    const scale = ratio > 1 ? `${Math.min(1.2, 1.05 * ratio)}, 1.05` : `1.05, ${Math.min(1.2, 1.05 * ratio)}`;

    targetAnimation
      .addElement(replaceElement)
      .delay(100)
      .duration(300)
      .afterRemoveClass('ios26-replace-element')
      .fromTo('transform', `scale(${scale})`, 'scale(1)')
      .fromTo('opacity', 0, 0.9);
  }

  backdropAnimation.addElement(root.querySelector('ion-backdrop')!).fromTo('opacity', 'var(--backdrop-opacity)', 0);

  contentAnimation
    .duration(400)
    .easing('ease')
    .addElement(root.querySelector('.popover-arrow')!)
    .addElement(root.querySelector('.popover-content')!)
    .fromTo('opacity', 0.99, 0);

  const popoverContentDataset = root.querySelector<HTMLElement>('.popover-content')!.dataset['transformOrigin'];
  if (popoverContentDataset) {
    contentAnimation.beforeStyles({ 'transform-origin': popoverContentDataset }).afterAddRead(() => {
      root.querySelector<HTMLElement>('.popover-content')!.dataset['transformOrigin'] = '';
    });

    if (replaceElement) {
      contentAnimation.fromTo('transform', 'scale(1)', 'scale(0.55)');
    } else {
      contentAnimation.fromTo('transform', 'scale(1)', 'scale(0)');
    }
  }

  return baseAnimation
    .easing('ease')
    .afterAddWrite(() => {
      if (baseEl.dataset['ios26PreviousWidth'] !== undefined) {
        baseEl.style.setProperty('--width', baseEl.dataset['ios26PreviousWidth'], baseEl.dataset['ios26PreviousWidthPriority'] ?? '');
        delete baseEl.dataset['ios26PreviousWidth'];
        delete baseEl.dataset['ios26PreviousWidthPriority'];
      }
      baseEl.classList.remove('popover-bottom');
      baseEl.classList.remove('ios-theme-callout');
      root.querySelectorAll('.ios-theme-callout-layer').forEach((layer) => layer.remove());

      contentEl.style.removeProperty('top');
      contentEl.style.removeProperty('left');
      contentEl.style.removeProperty('bottom');
      contentEl.style.removeProperty('transform-origin');
      if (contentEl.dataset['previousMaxWidth'] !== undefined) {
        contentEl.style.setProperty(
          'max-width',
          contentEl.dataset['previousMaxWidth'],
          contentEl.dataset['previousMaxWidthPriority'] ?? '',
        );
        delete contentEl.dataset['previousMaxWidth'];
        delete contentEl.dataset['previousMaxWidthPriority'];
      }

      if (arrowEl) {
        arrowEl.style.removeProperty('top');
        arrowEl.style.removeProperty('left');
        arrowEl.style.removeProperty('display');
        arrowEl.style.removeProperty('bottom');
        arrowEl.style.removeProperty('transform');
      }
    })
    .duration(300)
    .addAnimation([backdropAnimation, contentAnimation, targetAnimation, surfaceAnimation]);
};
