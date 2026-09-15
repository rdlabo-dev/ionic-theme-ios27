import type { Animation } from '@ionic/core';
import { createAnimation } from '@ionic/core';
import type { TransitionOptions } from './index';
import { getIonPageElement } from './index';

const DURATION = 540;

const getClonedElement = <T extends HTMLIonBackButtonElement | HTMLIonTitleElement>(tagName: string) => {
  return document.querySelector<T>(`${tagName}.ion-cloned-element`);
};

export const shadow = <T extends Element>(el: T): ShadowRoot | T => {
  return el.shadowRoot || el;
};

const animateFixedBackButton = (
  root: Animation,
  navEl: HTMLElement,
  page: HTMLElement,
  entering: boolean,
  interactive: boolean,
  otherPage?: HTMLElement,
) => {
  const button = page.querySelector<HTMLIonBackButtonElement>(
    ':scope > ion-header.header-translucent:not(.ios-theme-disabled, .ios26-disabled) ion-back-button:not(.ios-theme-disabled, .ios26-disabled)',
  );
  if (!button || button.offsetWidth === 0) {
    return;
  }

  const otherButton = otherPage?.querySelector<HTMLIonBackButtonElement>(
    ':scope > ion-header.header-translucent:not(.ios-theme-disabled, .ios26-disabled) ion-back-button:not(.ios-theme-disabled, .ios26-disabled)',
  );
  const persistent = !!otherButton && otherButton.offsetWidth > 0;
  const buttons = [button, ...(persistent ? [otherButton!] : [])].map((element) => ({
    element,
    visibility: element.style.visibility,
  }));
  const rect = button.getBoundingClientRect();
  const width = button.offsetWidth;
  const height = button.offsetHeight;
  const clone = getClonedElement<HTMLIonBackButtonElement>('ion-back-button');
  if (!clone) {
    return;
  }
  const cloneParent = clone.parentNode!;
  const cloneNextSibling = clone.nextSibling;
  const cloneStyle = clone.getAttribute('style');
  clone.icon = button.icon;
  clone.text = button.text;
  clone.mode = button.mode;
  clone.color = button.color;
  clone.disabled = button.disabled;
  const icon = shadow(clone).querySelector('ion-icon');
  const animation = createAnimation().addElement(clone);
  const fadeStart = !entering && interactive ? 0.8 : 0.4;
  const fadeEnd = entering ? 0.96 : interactive ? 1 : 0.95;
  if (persistent) {
    animation.fromTo('transform', 'scale(1)', 'scale(1)').fromTo('opacity', 1, 1);
  } else if (entering) {
    animation.keyframes([
      { offset: 0, transform: 'scale(1.2)', opacity: 0 },
      { offset: fadeStart, transform: 'scale(1.2)', opacity: 0 },
      { offset: 0.65, transform: 'scale(1.12)', opacity: 0.15 },
      { offset: 0.9, transform: 'scale(1.02)', opacity: 0.75 },
      { offset: fadeEnd, transform: 'scale(1)', opacity: 1 },
      { offset: 1, transform: 'scale(1)', opacity: 1 },
    ]);
  } else {
    animation.keyframes([
      { offset: 0, transform: 'scale(1)', opacity: 1 },
      { offset: fadeStart, transform: 'scale(1)', opacity: 1 },
      { offset: fadeEnd, transform: 'scale(1.2)', opacity: 0 },
      { offset: 1, transform: 'scale(1.2)', opacity: 0 },
    ]);
  }
  if (icon && !persistent) {
    const from = entering ? 'blur(4px)' : 'blur(0px)';
    const to = entering ? 'blur(0px)' : 'blur(4px)';
    animation.addAnimation(
      createAnimation()
        .addElement(icon)
        .keyframes([
          { offset: 0, filter: from },
          { offset: fadeStart, filter: from },
          { offset: fadeEnd, filter: to },
          { offset: 1, filter: to },
        ]),
    );
  }
  root.beforeAddWrite(() => {
    Object.assign(clone.style, {
      position: 'fixed',
      left: `${rect.left + (rect.width - width) / 2}px`,
      top: `${rect.top + (rect.height - height) / 2}px`,
      width: `${width}px`,
      height: `${height}px`,
      margin: '0',
      pointerEvents: 'none',
      visibility: 'visible',
      display: getComputedStyle(button).display,
      zIndex: '1000',
    });
    navEl.appendChild(clone);
    buttons.forEach(({ element }) => (element.style.visibility = 'hidden'));
  });
  root.afterAddWrite(() => {
    buttons.forEach(({ element, visibility }) => (element.style.visibility = visibility));
    cloneParent.insertBefore(clone, cloneNextSibling);
    if (cloneStyle === null) {
      clone.removeAttribute('style');
    } else {
      clone.setAttribute('style', cloneStyle);
    }
  });
  root.addAnimation(animation);
};

export const iosTransitionAnimation = (navEl: HTMLElement, opts: TransitionOptions): Animation => {
  try {
    const EASING = 'cubic-bezier(0.32,0.72,0,1)';
    const OPACITY = 'opacity';
    const TRANSFORM = 'transform';
    const CENTER = '0%';
    const OFF_OPACITY = 0.8;

    const isRTL = navEl.ownerDocument.dir === 'rtl';
    const OFF_RIGHT = isRTL ? '-99.5%' : '99.5%';
    // UIKit26 retreats the previous page by 30% without moving/scaling its large title independently.
    const OFF_LEFT = isRTL ? '30%' : '-30%';

    const enteringEl = opts.enteringEl;
    const leavingEl = opts.leavingEl;

    const backDirection = opts.direction === 'back';
    const contentEl = enteringEl.querySelector(':scope > ion-content');
    const headerEls = enteringEl.querySelectorAll(':scope > ion-header > *:not(ion-toolbar), :scope > ion-footer > *');
    const enteringToolBarEls = enteringEl.querySelectorAll(':scope > ion-header > ion-toolbar');

    const rootAnimation = createAnimation();
    const enteringContentAnimation = createAnimation();

    rootAnimation
      .addElement(enteringEl)
      .duration((opts.duration ?? 0) || DURATION)
      .easing(opts.easing || EASING)
      .fill('both')
      .beforeRemoveClass('ion-page-invisible');

    const topPage = backDirection ? leavingEl : enteringEl;
    const translucentTop = topPage?.querySelector(':scope > ion-header.header-translucent:not(.ios-theme-disabled, .ios26-disabled)');
    if (topPage && translucentTop) {
      // UIKit dims the opaque page underneath, including its header, with 10% black.
      const shade = navEl.ownerDocument.createElement('div');
      shade.className = 'ios26-transition-shade';
      shade.setAttribute('aria-hidden', 'true');
      const edge = navEl.ownerDocument.createElement('div');
      edge.setAttribute('aria-hidden', 'true');
      const clipPath = topPage.style.clipPath;
      // UIKit's continuous page outline is smaller in tablet-sized panes.
      const [corner, control] = topPage.offsetWidth >= 768 ? [36, 13] : [78, 22];
      Object.assign(shade.style, {
        position: 'absolute',
        inset: '0',
        zIndex: topPage.style.zIndex,
        pointerEvents: 'none',
        background: 'rgba(0, 0, 0, 0.1)',
      });
      Object.assign(edge.style, {
        position: 'absolute',
        top: '0',
        bottom: '0',
        [isRTL ? 'right' : 'left']: '-100%',
        width: '100%',
        zIndex: topPage.style.zIndex,
        pointerEvents: 'none',
        background: `linear-gradient(to ${isRTL ? 'right' : 'left'}, rgba(0, 0, 0, 0.02), transparent 18px)`,
      });
      rootAnimation.beforeAddWrite(() => {
        topPage.before(shade, edge);
        topPage.style.clipPath = `inset(0 round ${corner * 0.82}px)`;
        topPage.style.clipPath = `shape(from 0px ${corner}px,
          curve to ${corner}px 0px with 0px ${control}px / ${control}px 0px, hline to calc(100% - ${corner}px),
          curve to 100% ${corner}px with calc(100% - ${control}px) 0px / 100% ${control}px, vline to calc(100% - ${corner}px),
          curve to calc(100% - ${corner}px) 100% with 100% calc(100% - ${control}px) / calc(100% - ${control}px) 100%, hline to ${corner}px,
          curve to 0px calc(100% - ${corner}px) with ${control}px 100% / 0px calc(100% - ${control}px), close)`;
      });
      rootAnimation.afterAddWrite(() => {
        shade.remove();
        edge.remove();
        topPage.style.clipPath = clipPath;
      });
      rootAnimation.addAnimation(
        createAnimation()
          .addElement(shade)
          .fromTo(OPACITY, backDirection ? 1 : 0, backDirection ? 0 : 1),
      );
      rootAnimation.addAnimation(
        createAnimation()
          .addElement(edge)
          .fromTo(
            TRANSFORM,
            `translateX(${backDirection ? CENTER : OFF_RIGHT})`,
            `translateX(${backDirection ? (isRTL ? '-100%' : '100%') : CENTER})`,
          ),
      );
    }

    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
    if (leavingEl && navEl !== null && navEl !== undefined) {
      const navDecorAnimation = createAnimation();
      navDecorAnimation.addElement(navEl);
      rootAnimation.addAnimation(navDecorAnimation);
    }

    if (enteringEl.querySelector(':scope > ion-header.header-translucent:not(.ios-theme-disabled, .ios26-disabled)')) {
      enteringContentAnimation.addElement(enteringEl);
    } else if (!contentEl && enteringToolBarEls.length === 0 && headerEls.length === 0) {
      enteringContentAnimation.addElement(enteringEl.querySelector(':scope > .ion-page, :scope > ion-nav, :scope > ion-tabs')!); // REVIEW
    } else {
      enteringContentAnimation.addElement(contentEl!); // REVIEW
      enteringContentAnimation.addElement(headerEls);
    }

    rootAnimation.addAnimation(enteringContentAnimation);

    if (backDirection) {
      enteringContentAnimation
        .beforeClearStyles([OPACITY])
        .fromTo('transform', `translateX(${OFF_LEFT})`, `translateX(${CENTER})`)
        .fromTo(OPACITY, translucentTop ? 1 : OFF_OPACITY, 1);
    } else {
      // entering content, forward direction
      enteringContentAnimation.beforeClearStyles([OPACITY]).fromTo('transform', `translateX(${OFF_RIGHT})`, `translateX(${CENTER})`);
    }

    if (contentEl && !enteringEl.querySelector(':scope > ion-header.header-translucent:not(.ios-theme-disabled, .ios26-disabled)')) {
      const enteringTransitionEffectEl = shadow(contentEl).querySelector('.transition-effect');
      if (enteringTransitionEffectEl) {
        const enteringTransitionCoverEl = enteringTransitionEffectEl.querySelector('.transition-cover');
        const enteringTransitionShadowEl = enteringTransitionEffectEl.querySelector('.transition-shadow');

        const enteringTransitionEffect = createAnimation();
        const enteringTransitionCover = createAnimation();
        const enteringTransitionShadow = createAnimation();

        enteringTransitionEffect
          .addElement(enteringTransitionEffectEl)
          .beforeStyles({ opacity: '1', display: 'block' })
          .afterStyles({ opacity: '', display: '' });

        enteringTransitionCover
          .addElement(enteringTransitionCoverEl!) // REVIEW
          .beforeClearStyles([OPACITY])
          .fromTo(OPACITY, 0, 0.1);

        enteringTransitionShadow
          .addElement(enteringTransitionShadowEl!) // REVIEW
          .beforeClearStyles([OPACITY])
          .fromTo(OPACITY, 0.03, 0.7);

        enteringTransitionEffect.addAnimation([enteringTransitionCover, enteringTransitionShadow]);
        enteringContentAnimation.addAnimation([enteringTransitionEffect]);
      }
    }

    if (topPage) {
      animateFixedBackButton(
        rootAnimation,
        navEl,
        topPage,
        !backDirection,
        opts.progressCallback !== undefined,
        backDirection ? enteringEl : leavingEl,
      );
    }

    const enteringContentHasLargeTitle = enteringEl.querySelector('ion-header.header-collapse-condense');

    enteringToolBarEls.forEach((enteringToolBarEl) => {
      if (enteringToolBarEl.closest('ion-header')?.matches('.header-translucent:not(.ios-theme-disabled, .ios26-disabled)')) {
        return;
      }
      const enteringToolBar = createAnimation();
      enteringToolBar.addElement(enteringToolBarEl);
      rootAnimation.addAnimation(enteringToolBar);

      const enteringTitle = createAnimation();
      enteringTitle.addElement(enteringToolBarEl.querySelector('ion-title')!); // REVIEW

      const enteringToolBarButtons = createAnimation();
      const buttons = Array.from(enteringToolBarEl.querySelectorAll('ion-buttons,[menuToggle]'));

      const parentHeader = enteringToolBarEl.closest('ion-header');
      const inactiveHeader = parentHeader?.classList.contains('header-collapse-condense-inactive');

      let buttonsToAnimate;
      if (backDirection) {
        buttonsToAnimate = buttons.filter((button) => {
          const isCollapseButton = button.classList.contains('buttons-collapse');
          return (isCollapseButton && !inactiveHeader) || !isCollapseButton;
        });
      } else {
        buttonsToAnimate = buttons.filter((button) => !button.classList.contains('buttons-collapse'));
      }

      enteringToolBarButtons.addElement(buttonsToAnimate);

      const enteringToolBarItems = createAnimation();
      enteringToolBarItems.addElement(enteringToolBarEl.querySelectorAll(':scope > *:not(ion-title):not(ion-buttons):not([menuToggle])'));

      const enteringToolBarBg = createAnimation();
      enteringToolBarBg.addElement(shadow(enteringToolBarEl).querySelector('.toolbar-background')!); // REVIEW

      const enteringBackButton = createAnimation();
      const backButtonEl = enteringToolBarEl.querySelector('ion-back-button');

      if (backButtonEl) {
        enteringBackButton.addElement(backButtonEl);
      }

      enteringToolBar.addAnimation([enteringTitle, enteringToolBarButtons, enteringToolBarItems, enteringToolBarBg, enteringBackButton]);
      enteringToolBarButtons.fromTo(OPACITY, 0.01, 1);
      enteringToolBarItems.fromTo(OPACITY, 0.01, 1);

      if (backDirection) {
        if (!inactiveHeader) {
          enteringTitle.fromTo('transform', `translateX(${OFF_LEFT})`, `translateX(${CENTER})`).fromTo(OPACITY, 0.01, 1);
        }

        enteringToolBarItems.fromTo('transform', `translateX(${OFF_LEFT})`, `translateX(${CENTER})`);

        // back direction, entering page has a back button
        enteringBackButton.fromTo(OPACITY, 0.01, 1);
      } else {
        // entering toolbar, forward direction
        if (!enteringContentHasLargeTitle) {
          enteringTitle.fromTo('transform', `translateX(${OFF_RIGHT})`, `translateX(${CENTER})`).fromTo(OPACITY, 0.01, 1);
        }

        enteringToolBarItems.fromTo('transform', `translateX(${OFF_RIGHT})`, `translateX(${CENTER})`);
        enteringToolBarBg.beforeClearStyles([OPACITY, 'transform']);

        const translucentHeader = parentHeader?.translucent;
        if (!translucentHeader) {
          enteringToolBarBg.fromTo(OPACITY, 0.01, 'var(--opacity)');
        } else {
          enteringToolBarBg.fromTo('transform', isRTL ? 'translateX(-100%)' : 'translateX(100%)', 'translateX(0px)');
        }

        // forward direction, entering page has a back button
        enteringBackButton.fromTo(OPACITY, 0.01, 1);

        if (backButtonEl) {
          const enteringBackBtnText = createAnimation();
          enteringBackBtnText
            .addElement(shadow(backButtonEl).querySelector('.button-text')!) // REVIEW
            .fromTo(`transform`, isRTL ? 'translateX(-100px)' : 'translateX(100px)', 'translateX(0px)');

          enteringToolBar.addAnimation(enteringBackBtnText);
        }
      }
    });

    // setup leaving view
    if (leavingEl) {
      const leavingContent = createAnimation();
      const leavingContentEl = leavingEl.querySelector(':scope > ion-content');
      const leavingToolBarEls = leavingEl.querySelectorAll(':scope > ion-header > ion-toolbar');
      const leavingHeaderEls = leavingEl.querySelectorAll(':scope > ion-header > *:not(ion-toolbar), :scope > ion-footer > *');

      if (leavingEl.querySelector(':scope > ion-header.header-translucent:not(.ios-theme-disabled, .ios26-disabled)')) {
        leavingContent.addElement(leavingEl);
      } else if (!leavingContentEl && leavingToolBarEls.length === 0 && leavingHeaderEls.length === 0) {
        leavingContent.addElement(leavingEl.querySelector(':scope > .ion-page, :scope > ion-nav, :scope > ion-tabs')!); // REVIEW
      } else {
        leavingContent.addElement(leavingContentEl!); // REVIEW
        leavingContent.addElement(leavingHeaderEls);
      }

      rootAnimation.addAnimation(leavingContent);

      if (backDirection) {
        // leaving content, back direction
        leavingContent
          .beforeClearStyles([OPACITY])
          .fromTo('transform', `translateX(${CENTER})`, isRTL ? 'translateX(-100%)' : 'translateX(100%)');

        const leavingPage = getIonPageElement(leavingEl) as HTMLElement;
        rootAnimation.afterAddWrite(() => {
          if (rootAnimation.getDirection() === 'normal') {
            leavingPage.style.setProperty('display', 'none');
          }
        });
      } else {
        // leaving content, forward direction
        leavingContent
          .fromTo('transform', `translateX(${CENTER})`, `translateX(${OFF_LEFT})`)
          .fromTo(OPACITY, 1, translucentTop ? 1 : OFF_OPACITY);
      }

      if (
        leavingContentEl &&
        !leavingEl.querySelector(':scope > ion-header.header-translucent:not(.ios-theme-disabled, .ios26-disabled)')
      ) {
        const leavingTransitionEffectEl = shadow(leavingContentEl).querySelector('.transition-effect');

        if (leavingTransitionEffectEl) {
          const leavingTransitionCoverEl = leavingTransitionEffectEl.querySelector('.transition-cover');
          const leavingTransitionShadowEl = leavingTransitionEffectEl.querySelector('.transition-shadow');

          const leavingTransitionEffect = createAnimation();
          const leavingTransitionCover = createAnimation();
          const leavingTransitionShadow = createAnimation();

          leavingTransitionEffect
            .addElement(leavingTransitionEffectEl)
            .beforeStyles({ opacity: '1', display: 'block' })
            .afterStyles({ opacity: '', display: '' });

          leavingTransitionCover
            .addElement(leavingTransitionCoverEl!) // REVIEW
            .beforeClearStyles([OPACITY])
            .fromTo(OPACITY, 0.1, 0);

          leavingTransitionShadow
            .addElement(leavingTransitionShadowEl!) // REVIEW
            .beforeClearStyles([OPACITY])
            .fromTo(OPACITY, 0.7, 0.03);

          leavingTransitionEffect.addAnimation([leavingTransitionCover, leavingTransitionShadow]);
          leavingContent.addAnimation([leavingTransitionEffect]);
        }
      }

      leavingToolBarEls.forEach((leavingToolBarEl) => {
        if (leavingToolBarEl.closest('ion-header')?.matches('.header-translucent:not(.ios-theme-disabled, .ios26-disabled)')) {
          return;
        }
        const leavingToolBar = createAnimation();
        leavingToolBar.addElement(leavingToolBarEl);

        const leavingTitle = createAnimation();
        leavingTitle.addElement(leavingToolBarEl.querySelector('ion-title')!); // REVIEW

        const leavingToolBarButtons = createAnimation();
        const buttons = leavingToolBarEl.querySelectorAll('ion-buttons,[menuToggle]');

        const parentHeader = leavingToolBarEl.closest('ion-header');
        const inactiveHeader = parentHeader?.classList.contains('header-collapse-condense-inactive');

        const buttonsToAnimate = Array.from(buttons).filter((button) => {
          const isCollapseButton = button.classList.contains('buttons-collapse');
          return (isCollapseButton && !inactiveHeader) || !isCollapseButton;
        });

        leavingToolBarButtons.addElement(buttonsToAnimate);

        const leavingToolBarItems = createAnimation();
        const leavingToolBarItemEls = leavingToolBarEl.querySelectorAll(':scope > *:not(ion-title):not(ion-buttons):not([menuToggle])');
        if (leavingToolBarItemEls.length > 0) {
          leavingToolBarItems.addElement(leavingToolBarItemEls);
        }

        const leavingToolBarBg = createAnimation();
        leavingToolBarBg.addElement(shadow(leavingToolBarEl).querySelector('.toolbar-background')!); // REVIEW

        const leavingBackButton = createAnimation();
        const backButtonEl = leavingToolBarEl.querySelector('ion-back-button');
        if (backButtonEl) {
          leavingBackButton.addElement(backButtonEl);
        }

        leavingToolBar.addAnimation([leavingTitle, leavingToolBarButtons, leavingToolBarItems, leavingBackButton, leavingToolBarBg]);
        rootAnimation.addAnimation(leavingToolBar);

        // fade out leaving toolbar items
        leavingBackButton.fromTo(OPACITY, 0.99, 0);

        leavingToolBarButtons.fromTo(OPACITY, 0.99, 0);
        leavingToolBarItems.fromTo(OPACITY, 0.99, 0);

        if (backDirection) {
          if (!inactiveHeader) {
            // leaving toolbar, back direction
            leavingTitle
              .fromTo('transform', `translateX(${CENTER})`, isRTL ? 'translateX(-100%)' : 'translateX(100%)')
              .fromTo(OPACITY, 0.99, 0);
          }

          leavingToolBarItems.fromTo('transform', `translateX(${CENTER})`, isRTL ? 'translateX(-100%)' : 'translateX(100%)');
          leavingToolBarBg.beforeClearStyles([OPACITY, 'transform']);
          // leaving toolbar, back direction, and there's no entering toolbar
          // should just slide out, no fading out
          const translucentHeader = parentHeader?.translucent;
          if (!translucentHeader) {
            leavingToolBarBg.fromTo(OPACITY, 'var(--opacity)', 0);
          } else {
            leavingToolBarBg.fromTo('transform', 'translateX(0px)', isRTL ? 'translateX(-100%)' : 'translateX(100%)');
          }

          if (backButtonEl) {
            const leavingBackBtnText = createAnimation();
            leavingBackBtnText
              .addElement(shadow(backButtonEl).querySelector('.button-text')!) // REVIEW
              .fromTo('transform', `translateX(${CENTER})`, `translateX(${(isRTL ? -124 : 124) + 'px'})`);
            leavingToolBar.addAnimation(leavingBackBtnText);
          }
        } else {
          // leaving toolbar, forward direction
          if (!inactiveHeader) {
            leavingTitle
              .fromTo('transform', `translateX(${CENTER})`, `translateX(${OFF_LEFT})`)
              .fromTo(OPACITY, 0.99, 0)
              .afterClearStyles([TRANSFORM, OPACITY]);
          }

          leavingToolBarItems
            .fromTo('transform', `translateX(${CENTER})`, `translateX(${OFF_LEFT})`)
            .afterClearStyles([TRANSFORM, OPACITY]);

          leavingBackButton.afterClearStyles([OPACITY]);
          leavingTitle.afterClearStyles([OPACITY]);
          leavingToolBarButtons.afterClearStyles([OPACITY]);
        }
      });
    }

    return rootAnimation;
  } catch (err) {
    throw err;
  }
};
