import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 402, height: 874 } });
const mount = async (page: Page, content: string) => {
  await page.goto('/main/index/button', { waitUntil: 'networkidle' });
  await page.evaluate((html) => {
    const element = document.createElement('div');
    element.id = 'header-list-fixture';
    element.className = 'ion-page ios';
    element.style.cssText = 'position:fixed;inset:0;width:402px;z-index:10000;--ion-safe-area-top:62px;--ion-safe-area-bottom:34px;';
    element.innerHTML = html;
    document.querySelector('ion-app')!.appendChild(element);
  }, content);
  await expect
    .poll(() =>
      page.locator('#header-list-fixture :is(ion-toolbar,ion-title,ion-list,ion-item,ion-buttons,ion-button):not(.hydrated)').count(),
    )
    .toBe(0);
};

for (const rootSize of [16, 17]) {
  test(`native header/list metrics with ${rootSize}px root`, async ({ page }) => {
    await mount(
      page,
      `<ion-header><ion-toolbar id="toolbar"><ion-title>Title</ion-title></ion-toolbar></ion-header>
      <ion-title size="large" id="large">Home</ion-title>
      <ion-list inset="true" id="list"><ion-item-group id="group"><ion-item id="row"><ion-label>Row</ion-label></ion-item></ion-item-group></ion-list>`,
    );
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}px`;
    }, rootSize);
    expect(await page.locator('#toolbar').evaluate((el) => getComputedStyle(el).getPropertyValue('--min-height').trim())).toBe('64px');
    await expect(page.locator('#toolbar')).toHaveCSS('padding-top', '52px');
    await expect(page.locator('#large')).toHaveCSS('font-size', '34px');
    await expect(page.locator('#list')).toHaveCSS('margin-left', '20px');
    await expect(page.locator('#list')).toHaveCSS('margin-right', '20px');
    await expect(page.locator('#group')).toHaveCSS('border-radius', '28px');
    await expect(page.locator('#row')).toHaveCSS('font-size', '17px');
    expect((await page.locator('#row').boundingBox())!.height).toBeCloseTo(53, 0);
  });
}

for (const rootSize of [16, 17]) {
  for (const size of ['', ' size="default"']) {
    test(`single clear toolbar button ${size || 'without size'} at ${rootSize}px root`, async ({ page }) => {
      await mount(
        page,
        `<ion-header><ion-toolbar><ion-title>Title</ion-title>
        <ion-buttons id="single-buttons" slot="end"><ion-button id="single-button" fill="clear"${size}>Next</ion-button></ion-buttons>
        </ion-toolbar></ion-header>`,
      );
      await page.evaluate((value) => {
        document.documentElement.style.fontSize = `${value}px`;
      }, rootSize);
      const button = page.locator('#single-button');
      expect(await button.evaluate((el) => el.classList.contains('button-default'))).toBe(size !== '');
      for (const property of ['--padding-start', '--padding-end']) {
        expect(await button.evaluate((el, name) => getComputedStyle(el).getPropertyValue(name).trim(), property)).toBe('16px');
      }
      const group = page.locator('#single-buttons');
      expect((await group.boundingBox())!.height).toBeCloseTo(44, 2);
      for (const edge of ['top', 'right', 'bottom', 'left']) await expect(group).toHaveCSS(`border-${edge}-width`, '0px');
    });
  }
}

for (const disabled of ['ios-theme-disabled', 'ios26-disabled']) {
  test(`${disabled} single clear button skips the measured single-button material`, async ({ page }) => {
    await mount(
      page,
      `<ion-header><ion-toolbar><ion-title>Title</ion-title>
      <ion-buttons id="single-buttons" slot="end"><ion-button id="single-button" fill="clear" class="${disabled}">Next</ion-button></ion-buttons>
      </ion-toolbar></ion-header>`,
    );
    const group = page.locator('#single-buttons');
    await expect(group).not.toHaveCSS('border-radius', '22px');
    await expect(group).not.toHaveCSS('border-top-width', '0px');
    expect(await page.locator('#single-button').evaluate((el) => getComputedStyle(el).getPropertyValue('--padding-start').trim())).not.toBe(
      '16px',
    );
  });

  test(`${disabled} on a list or row preserves Ionic defaults`, async ({ page }) => {
    await mount(
      page,
      `<ion-list inset="true"><ion-item-group id="group">
      <ion-item id="row"><ion-label>A</ion-label></ion-item>
      <ion-item id="disabled-row" class="${disabled}"><ion-label>B</ion-label></ion-item>
      </ion-item-group></ion-list>
      <ion-list inset="true" class="${disabled}" id="disabled-list"><ion-item-group id="disabled-group"><ion-item><ion-label>C</ion-label></ion-item></ion-item-group></ion-list>`,
    );
    await expect(page.locator('#group')).toHaveCSS('border-radius', '28px');
    await expect(page.locator('#disabled-group')).not.toHaveCSS('border-radius', '28px');
    await expect(page.locator('#disabled-list')).not.toHaveCSS('margin-left', '20px');
    expect(await page.locator('#disabled-row').evaluate((el) => getComputedStyle(el).getPropertyValue('--min-height').trim())).not.toBe(
      '53px',
    );
    expect(await page.locator('#row').evaluate((el) => getComputedStyle(el).getPropertyValue('--min-height').trim())).toBe('53px');
  });
}

test('RTL keeps symmetric inset margins', async ({ page }) => {
  await mount(
    page,
    '<ion-list inset="true" dir="rtl" id="list"><ion-item-group><ion-item><ion-label>Row</ion-label></ion-item></ion-item-group></ion-list>',
  );
  await expect(page.locator('#list')).toHaveCSS('margin-inline-start', '20px');
  await expect(page.locator('#list')).toHaveCSS('margin-inline-end', '20px');
});
