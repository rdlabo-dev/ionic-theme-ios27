import { createAnimation } from '@ionic/core';
import type { Animation } from '@ionic/core';
import { getElementRoot } from '../../utils';
import { calculateWindowAdjustment, getPopoverDimensions, getPopoverPosition } from '../utils';
import { createCalloutSurface } from '../callout-surface';

const POPOVER_IOS_BODY_PADDING = 5;
export const POPOVER_IOS_BODY_MARGIN = 8;

/**
 * iOS Popover Enter Animation
 */
// TODO(FW-2832): types
export const iosEnterAnimation = (baseEl: HTMLElement, opts?: any): Animation => {
  const { event: ev, size, trigger, reference, side, align } = opts;
  const doc = baseEl.ownerDocument as any;
  const isRTL = doc.dir === 'rtl';
  const bodyWidth = doc.defaultView.innerWidth;
  const bodyHeight = doc.defaultView.innerHeight;

  const root = getElementRoot(baseEl);
  const contentEl = root.querySelector('.popover-content') as HTMLElement;
  const arrowEl = root.querySelector<HTMLElement>('.popover-arrow');

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

  // Use the same reference for placement, the callout and the animation origin.
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
  // A replacing surface grows inward from the button's edge, not its center.
  const preferredLeft =
    isReplace && anchorBounds
      ? anchorBounds.left + anchorBounds.width / 2 <= (paneLeft + paneRight) / 2
        ? anchorBounds.left
        : anchorBounds.right - contentWidth
      : windowLeft;
  const left = pane ? Math.max(paneLeft + paneMargin, Math.min(paneRight - paneMargin - contentWidth, preferredLeft)) : preferredLeft;
  const physicalSide = side === 'start' ? (isRTL ? 'right' : 'left') : side === 'end' ? (isRTL ? 'left' : 'right') : side;
  const horizontal = physicalSide === 'left' || physicalSide === 'right';
  const above = addPopoverBottomClass || physicalSide === 'top';
  const hasCallout = !!arrowEl && !isReplace && !!anchor && size !== 'cover' && bottom === undefined;
  const surfaceTop = hasCallout && !horizontal ? top + (above ? -5 : 5) : top;
  const contentOrigin = anchor
    ? `${anchor.left + anchor.width / 2 - left}px ${anchor.top + anchor.height / 2 - surfaceTop}px`
    : `${originX} ${originY}`;

  const baseAnimation = createAnimation();
  const backdropAnimation = createAnimation();
  const contentAnimation = createAnimation();
  const targetAnimation = createAnimation();
  const arrowAnimation = createAnimation();
  const surfaceAnimation = createAnimation();
  if (arrowEl) {
    arrowAnimation.addElement(arrowEl).delay(300).duration(200).fromTo('opacity', 0, 1);
  }
  if (hasCallout && anchor) {
    const length = horizontal ? contentHeight : contentWidth;
    const inset = Math.min(48, length / 2);
    const center = Math.max(
      inset,
      Math.min(length - inset, horizontal ? anchor.top + anchor.height / 2 - top : anchor.left + anchor.width / 2 - left),
    );
    const arrowSide = horizontal ? (physicalSide === 'left' ? 'right' : 'left') : above ? 'bottom' : 'top';
    const layers = createCalloutSurface(root, contentWidth, contentHeight, arrowSide, center);
    baseEl.classList.add('ios-theme-callout');
    for (const layer of layers) {
      layer.style.left = `calc(${left - 32}px + var(--offset-x, 0))`;
      layer.style.top = `calc(${surfaceTop - 32}px + var(--offset-y, 0))`;
      const [originLeft, originTop] = contentOrigin.split(' ').map(parseFloat);
      layer.style.transformOrigin = `${originLeft + 32}px ${originTop + 32}px`;
    }
    surfaceAnimation
      .addElement(layers)
      .delay(100)
      .duration(400)
      .easing('cubic-bezier(0, 1, 0.22, 1)')
      .fromTo('transform', 'scale(0)', 'scale(1)')
      .fromTo('opacity', 0.01, 1);
  }

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
      .beforeAddClass('ios27-replace-element')
      .fromTo('transform', 'scale(1)', 'scale(1.05)')
      .fromTo('opacity', 1, 0);
  }

  return baseAnimation
    .easing('ease')
    .delay(100)
    .duration(100)
    .beforeAddWrite(() => {
      if (size === 'cover') {
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

      contentEl.style.setProperty('top', `calc(${surfaceTop}px + var(--offset-y, 0))`);
      contentEl.style.setProperty('left', `calc(${leftValue} + var(--offset-x, 0))`);
      contentEl.style.setProperty('transform-origin', contentOrigin);

      // Morphing buttons replace their anchor; ordinary anchored popovers point to it.
      if (arrowEl) {
        arrowEl.style.display = 'none';
        if (hasCallout && anchor) {
          const inset = Math.min(48, (horizontal ? contentHeight : contentWidth) / 2);
          const clamp = (value: number, length: number) => Math.max(inset, Math.min(length - inset, value));
          let arrowLeft: number;
          let arrowTop: number;
          let rotation: number;
          if (horizontal) {
            arrowLeft = physicalSide === 'left' ? left + contentWidth - 10 : left - 24;
            arrowTop = top + clamp(anchor.top + anchor.height / 2 - top, contentHeight) - 7;
            rotation = physicalSide === 'left' ? 90 : -90;
          } else {
            arrowLeft = left + clamp(anchor.left + anchor.width / 2 - left, contentWidth) - 17;
            arrowTop = above ? surfaceTop + contentHeight - 1 : surfaceTop - 13;
            rotation = above ? 180 : 0;
          }
          arrowEl.style.setProperty('display', 'block');
          arrowEl.style.setProperty('top', `calc(${arrowTop}px + var(--offset-y, 0))`);
          arrowEl.style.setProperty('left', `calc(${arrowLeft}px + var(--offset-x, 0))`);
          arrowEl.style.setProperty('bottom', 'auto');
          arrowEl.style.setProperty('transform', `rotate(${rotation}deg)`);
        }
      }
    })
    .addAnimation([backdropAnimation, contentAnimation, targetAnimation, arrowAnimation, surfaceAnimation]);
};
