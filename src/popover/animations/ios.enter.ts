import { createAnimation } from '@ionic/core';
import type { Animation } from '@ionic/core';
import { getElementRoot } from '../../utils';
import { calculateWindowAdjustment, getPopoverDimensions, getPopoverPosition } from '../utils';

const POPOVER_IOS_BODY_PADDING = 5;
export const POPOVER_IOS_BODY_MARGIN = 8;

/**
 * iOS Popover Enter Animation
 */
// TODO(FW-2832): types
export const iosEnterAnimation = (baseEl: HTMLElement, opts: any = {}): Animation => {
  const { event: ev, size, trigger, reference, side, align } = opts;
  const doc = baseEl.ownerDocument as any;
  const isRTL = doc.dir === 'rtl';
  const bodyWidth = doc.defaultView.innerWidth;
  const bodyHeight = doc.defaultView.innerHeight;

  const root = getElementRoot(baseEl);
  const contentEl = root.querySelector('.popover-content') as HTMLElement;

  const referenceSizeEl = trigger || ev?.detail?.ionShadowTarget || ev?.target;
  const anchorBounds = referenceSizeEl?.getBoundingClientRect();
  // Overlays live outside the page, but must stay in the pane that opened them.
  let paneAnchor = referenceSizeEl as HTMLElement | undefined;
  let pane: HTMLElement | null = null;
  while (paneAnchor && !pane) {
    pane = paneAnchor.closest('ion-content, .ion-page, ion-menu');
    paneAnchor = (paneAnchor.getRootNode() as ShadowRoot).host as HTMLElement | undefined;
  }
  const paneBounds = pane?.getBoundingClientRect();
  const scroll = pane?.shadowRoot?.querySelector<HTMLElement>('[part="scroll"]');
  const scrollStyle = scroll ? getComputedStyle(scroll) : null;
  let paneLeft = Math.max(0, (paneBounds?.left ?? 0) + (parseFloat(scrollStyle?.paddingLeft ?? '0') || 0));
  let paneRight = Math.min(bodyWidth, (paneBounds?.right ?? bodyWidth) - (parseFloat(scrollStyle?.paddingRight ?? '0') || 0));
  // Toolbars may be siblings of ion-content; exclude the visible menu there too.
  const splitPane = pane?.closest('ion-split-pane.split-pane-visible');
  if (splitPane && pane?.closest('.split-pane-main')) {
    for (const menu of Array.from(splitPane.querySelectorAll<HTMLElement>(':scope > ion-menu.menu-pane-visible'))) {
      const rect = menu.getBoundingClientRect();
      if (rect.left <= paneLeft && rect.right > paneLeft) paneLeft = rect.right;
      if (rect.right >= paneRight && rect.left < paneRight) paneRight = rect.left;
    }
  }
  const paneMargin = size === 'cover' ? 0 : POPOVER_IOS_BODY_MARGIN;
  const availableWidth = Math.max(0, paneRight - paneLeft - paneMargin * 2);
  if (pane && availableWidth > 0 && contentEl.getBoundingClientRect().width > availableWidth) {
    contentEl.dataset['previousMaxWidth'] = contentEl.style.maxWidth;
    contentEl.dataset['previousMaxWidthPriority'] = contentEl.style.getPropertyPriority('max-width');
    contentEl.style.maxWidth = `${availableWidth}px`;
  }
  const { contentWidth, contentHeight } = getPopoverDimensions(size, contentEl, referenceSizeEl);

  const isReplace = ((): boolean => {
    if (reference === 'event' || !referenceSizeEl || !['ion-button', 'ion-buttons'].includes(referenceSizeEl.localName)) {
      return false;
    }
    if (referenceSizeEl.matches('.ios-theme-disabled, .ios26-disabled')) {
      return false;
    }
    return true;
  })();

  const defaultPosition = {
    top: bodyHeight / 2 - contentHeight / 2,
    left: bodyWidth / 2 - contentWidth / 2,
    originX: isRTL ? 'right' : 'left',
    originY: 'top',
  };

  const results = getPopoverPosition(isRTL, contentWidth, contentHeight, reference, side, align, defaultPosition, trigger, ev);

  // Use the same reference for placement and the animation origin.
  const anchor = reference === 'event' ? results.referenceCoordinates : anchorBounds;

  const padding = size === 'cover' ? 0 : POPOVER_IOS_BODY_PADDING;
  const margin = size === 'cover' ? 0 : POPOVER_IOS_BODY_MARGIN;

  const {
    originX,
    originY,
    top,
    left: windowLeft,
    bottom,
    checkSafeAreaLeft,
    checkSafeAreaRight,
    addPopoverBottomClass,
  } = calculateWindowAdjustment(
    side,
    results.top,
    results.left,
    padding,
    bodyWidth,
    bodyHeight,
    contentWidth,
    contentHeight,
    margin,
    results.originX,
    results.originY,
    results.referenceCoordinates,
    referenceSizeEl?.getBoundingClientRect(),
    isReplace,
  );
  // Preserve iOS 26's replacement placement; constrain only overflowing panes.
  const left = pane ? Math.max(paneLeft + paneMargin, Math.min(paneRight - paneMargin - contentWidth, windowLeft)) : windowLeft;
  const contentOrigin = anchor
    ? `${anchor.left + anchor.width / 2 - left}px ${anchor.top + anchor.height / 2 - top}px`
    : `${originX} ${originY}`;

  const baseAnimation = createAnimation();
  const backdropAnimation = createAnimation();
  const contentAnimation = createAnimation();
  const targetAnimation = createAnimation();

  backdropAnimation
    .delay(100)
    .duration(300)
    .addElement(root.querySelector('ion-backdrop')!)
    .fromTo('opacity', 0.01, 'var(--backdrop-opacity)')
    .beforeStyles({
      'pointer-events': 'none',
    })
    .afterClearStyles(['pointer-events']);

  // In Chromium, if the wrapper animates, the backdrop filter doesn't work.
  // The Chromium team stated that this behavior is expected and not a bug. The element animating opacity creates a backdrop root for the backdrop-filter.
  // To get around this, instead of animating the wrapper, animate content.
  // https://bugs.chromium.org/p/chromium/issues/detail?id=1148826
  contentAnimation
    .easing('cubic-bezier(0, 1, 0.22, 1)')
    .delay(100)
    .duration(400)
    .addElement(root.querySelector('.popover-content')!)
    .beforeStyles({ 'transform-origin': contentOrigin })
    .beforeAddWrite(() => {
      /**
       * 'transformOrigin' use for leave animation.
       */
      root.querySelector<HTMLElement>('.popover-content')!.dataset['transformOrigin'] = contentOrigin;
    })
    .fromTo('transform', 'scale(0)', 'scale(1)')
    .fromTo('opacity', 0.01, 1);

  if (isReplace) {
    targetAnimation
      .delay(0)
      .duration(200)
      .addElement(referenceSizeEl)
      .beforeStyles({ 'transform-origin': `${originY} ${originX}` })
      .beforeAddClass('ios26-replace-element')
      .fromTo('transform', 'scale(1)', 'scale(1.05)')
      .fromTo('opacity', 1, 0);
  }

  return baseAnimation
    .easing('ease')
    .delay(100)
    .duration(100)
    .beforeAddWrite(() => {
      if (size === 'cover') {
        baseEl.dataset['ios26PreviousWidth'] = baseEl.style.getPropertyValue('--width');
        baseEl.dataset['ios26PreviousWidthPriority'] = baseEl.style.getPropertyPriority('--width');
        baseEl.style.setProperty('--width', `${contentWidth}px`);
      }

      if (addPopoverBottomClass) {
        baseEl.classList.add('popover-bottom');
      }

      if (bottom !== undefined) {
        contentEl.style.setProperty('bottom', `${bottom}px`);
      }

      const safeAreaLeft = ' + var(--ion-safe-area-left, 0)';
      const safeAreaRight = ' - var(--ion-safe-area-right, 0)';

      let leftValue = `${left}px`;

      if (checkSafeAreaLeft && !pane) {
        leftValue = `${left}px${safeAreaLeft}`;
      }
      if (checkSafeAreaRight && !pane) {
        leftValue = `${left}px${safeAreaRight}`;
      }

      contentEl.style.setProperty('top', `calc(${top}px + var(--offset-y, 0))`);
      contentEl.style.setProperty('left', `calc(${leftValue} + var(--offset-x, 0))`);
      contentEl.style.setProperty('transform-origin', contentOrigin);
    })
    .addAnimation([backdropAnimation, contentAnimation, targetAnimation]);
};
