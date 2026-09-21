import { expect, test } from '@playwright/test';

type Direction = 'ltr' | 'rtl';

const addFixture = async (page: import('@playwright/test').Page, direction: Direction) => {
  await page.evaluate((direction) => {
    document.body.style.setProperty('--ion-theme-safe-area-left', '76px');
    document.body.style.setProperty('--ion-theme-safe-area-right', '84px');
    document.body.style.setProperty('--ion-safe-area-left', '76px');
    document.body.style.setProperty('--ion-safe-area-right', '84px');
    document.body.classList.add('ionic-theme-enable-safe-area');

    const main = document.createElement('main');
    main.id = 'safe-area-main';
    const content = document.createElement('ion-content');
    content.id = 'safe-area-content';
    content.mode = 'ios';
    content.dir = direction;
    content.innerHTML = '<ion-list><ion-item>Content</ion-item></ion-list>';
    const toolbar = document.createElement('ion-toolbar');
    toolbar.id = 'safe-area-toolbar';
    toolbar.mode = 'ios';
    toolbar.dir = direction;
    toolbar.innerHTML = '<ion-title>Title</ion-title>';

    const logicalLeft = direction === 'ltr' ? 'start' : 'end';
    for (const physicalSide of ['left', 'right'] as const) {
      const logicalSide = physicalSide === 'left' ? logicalLeft : logicalLeft === 'start' ? 'end' : 'start';
      const menu = document.createElement('ion-menu');
      menu.id = `safe-area-menu-${physicalSide}`;
      menu.mode = 'ios';
      menu.side = logicalSide;
      menu.dir = direction;
      menu.contentId = main.id;
      menu.innerHTML = `<ion-content mode="ios" id="safe-area-menu-content-${physicalSide}">${physicalSide} menu</ion-content>`;
      const fab = document.createElement('ion-fab');
      fab.id = `safe-area-fab-${physicalSide}`;
      fab.mode = 'ios';
      fab.dir = direction;
      fab.horizontal = logicalSide;
      fab.vertical = 'center';
      fab.innerHTML = '<ion-fab-button mode="ios">+</ion-fab-button>';
      main.append(fab);
      document.body.append(menu);
    }

    const modal = document.createElement('ion-modal');
    modal.id = 'safe-area-modal';
    modal.mode = 'ios';
    modal.innerHTML = '<ion-content mode="ios" id="safe-area-modal-content" style="--ion-safe-area-right:12px">Modal</ion-content>';
    main.prepend(toolbar, content);
    document.body.append(modal, main);
  }, direction);
};

for (const direction of ['ltr', 'rtl'] as const) {
  test(`keeps bilateral physical safe-area geometry in ${direction.toUpperCase()}`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto('/main/index');
    await addFixture(page, direction);

    const foreground = await page.locator('#safe-area-content').evaluate((content) => {
      const scroll = content.shadowRoot!.querySelector<HTMLElement>('[part="scroll"]')!;
      const toolbar = content.parentElement!.querySelector<HTMLIonToolbarElement>('#safe-area-toolbar')!;
      const container = toolbar.shadowRoot!.querySelector<HTMLElement>('[part="container"]')!;
      return {
        contentWidth: content.getBoundingClientRect().width,
        contentSafeLeft: getComputedStyle(content).getPropertyValue('--ion-safe-area-left'),
        contentSafeRight: getComputedStyle(content).getPropertyValue('--ion-safe-area-right'),
        scrollPaddingLeft: getComputedStyle(scroll).paddingLeft,
        scrollPaddingRight: getComputedStyle(scroll).paddingRight,
        toolbarSafeLeft: getComputedStyle(toolbar).getPropertyValue('--ion-safe-area-left'),
        toolbarSafeRight: getComputedStyle(toolbar).getPropertyValue('--ion-safe-area-right'),
        toolbarPaddingLeft: getComputedStyle(container).paddingLeft,
        toolbarPaddingRight: getComputedStyle(container).paddingRight,
      };
    });
    expect(foreground).toEqual({
      contentWidth: 700,
      contentSafeLeft: '0px',
      contentSafeRight: '0px',
      scrollPaddingLeft: '76px',
      scrollPaddingRight: '84px',
      toolbarSafeLeft: '0px',
      toolbarSafeRight: '0px',
      toolbarPaddingLeft: '80px',
      toolbarPaddingRight: '88px',
    });

    if (direction === 'ltr') {
      const modal = page.locator('#safe-area-modal');
      await modal.evaluate((element: HTMLIonModalElement) => element.present());
      expect(
        await page
          .locator('#safe-area-modal-content')
          .evaluate((element) => getComputedStyle(element).getPropertyValue('--ion-safe-area-right')),
      ).toBe('12px');
      await modal.evaluate((element: HTMLIonModalElement) => element.dismiss());
    }

    const leftFabBox = (await page.locator('#safe-area-fab-left').boundingBox())!;
    const rightFabBox = (await page.locator('#safe-area-fab-right').boundingBox())!;
    const logicalInsets = await page.locator('#safe-area-fab-left').evaluate((fab) => ({
      start: getComputedStyle(fab).getPropertyValue('--ios-theme-safe-area-inline-start'),
      end: getComputedStyle(fab).getPropertyValue('--ios-theme-safe-area-inline-end'),
    }));
    expect(logicalInsets).toEqual(direction === 'ltr' ? { start: '76px', end: '84px' } : { start: '84px', end: '76px' });
    if (direction === 'ltr') {
      expect(rightFabBox.x + rightFabBox.width).toBeCloseTo(600, 0);
    } else {
      expect(leftFabBox.x).toBeCloseTo(92, 0);
    }

    const leftMenu = page.locator('#safe-area-menu-left');
    await leftMenu.evaluate((element: HTMLIonMenuElement) => element.open(false));
    const leftMenuGeometry = await page.locator('#safe-area-menu-content-left').evaluate((content) => {
      const menu = content.closest('ion-menu')!;
      return {
        safeLeft: getComputedStyle(content).getPropertyValue('--ion-safe-area-left'),
        containerLeft: menu.shadowRoot!.querySelector<HTMLElement>('[part="container"]')!.getBoundingClientRect().left,
        foregroundLeft: content.shadowRoot!.querySelector<HTMLElement>('[part="scroll"]')!.getBoundingClientRect().left,
      };
    });
    expect(leftMenuGeometry.safeLeft).toBe('0px');
    expect(leftMenuGeometry.containerLeft).toBeCloseTo(76, 0);
    expect(leftMenuGeometry.foregroundLeft).toBeCloseTo(76 + (direction === 'ltr' ? 12 : 16), 0);
    await leftMenu.evaluate((element: HTMLIonMenuElement) => element.close(false));

    const rightMenu = page.locator('#safe-area-menu-right');
    await rightMenu.evaluate((element: HTMLIonMenuElement) => element.open(false));
    const rightMenuGeometry = await page.locator('#safe-area-menu-content-right').evaluate((content) => {
      const menu = content.closest('ion-menu')!;
      return {
        safeRight: getComputedStyle(content).getPropertyValue('--ion-safe-area-right'),
        containerRight: menu.shadowRoot!.querySelector<HTMLElement>('[part="container"]')!.getBoundingClientRect().right,
        foregroundRight: content.shadowRoot!.querySelector<HTMLElement>('[part="scroll"]')!.getBoundingClientRect().right,
      };
    });
    expect(rightMenuGeometry.safeRight).toBe('0px');
    expect(rightMenuGeometry.containerRight).toBeCloseTo(700 - 84, 0);
    expect(rightMenuGeometry.foregroundRight).toBeCloseTo(700 - 84 - (direction === 'ltr' ? 16 : 12), 0);
  });
}
