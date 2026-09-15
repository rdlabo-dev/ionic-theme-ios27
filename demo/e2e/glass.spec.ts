import { expect, test } from '@playwright/test';
import { compileString } from 'sass';
import { resolve } from 'node:path';

const loadPaths = [resolve(__dirname, '../../src/styles/utils')];
const compile = (source: string) => compileString(source, { loadPaths, style: 'compressed' }).css;

test('overlay activated alias retains its generated styles', () => {
  expect(compile('@use "api"; .probe { @include api.glass-background-overlay-activated; }')).toBe(
    compile('@use "api"; .probe { @include api.glass-background-overlay; }'),
  );
});

test('glass-background keeps positional and named argument compatibility', () => {
  expect(compile('@use "api"; .probe { @include api.glass-background(0.1, 0, 120%, $include-border: false); }')).toBe(
    compile('@use "api"; .probe { @include api.glass-background($opacity: 0.1, $blur: 0, $saturate: 120%, $include-border: false); }'),
  );
});

test('fullscreen page chrome is transparent or frosted according to translucent', async ({ page }) => {
  await page.goto('/main/album');
  const content = page.locator('app-album-page > ion-content');
  const header = page.locator('app-album-page > ion-header');
  const footer = page.locator('app-album-page > ion-footer');
  const headerToolbar = header.locator(':scope > ion-toolbar');
  const footerToolbar = footer.locator(':scope > ion-toolbar');

  await expect(header).toHaveClass(/header-translucent/);
  await expect(headerToolbar).toHaveCSS('--background', 'transparent');
  expect(await header.evaluate((element) => getComputedStyle(element, '::after').backdropFilter)).toBe('blur(2px)');

  await expect(footer).toHaveClass(/footer-translucent/);
  expect(await footer.evaluate((element) => getComputedStyle(element, '::before').backdropFilter)).toBe('blur(8px)');
  expect(await footer.evaluate((element) => getComputedStyle(element, '::before').backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  expect(await footer.evaluate((element) => getComputedStyle(element, '::after').backdropFilter)).toBe('blur(2px)');
  await expect(footerToolbar).toHaveCSS('--border-width', '0.5px 0 0');

  await footer.evaluate((element: HTMLIonFooterElement) => (element.translucent = false));
  await header.evaluate((element: HTMLIonHeaderElement) => (element.translucent = false));
  await expect(header).not.toHaveClass(/header-translucent/);
  await expect(footer).not.toHaveClass(/footer-translucent/);
  await expect(headerToolbar).toHaveCSS('--background', 'transparent');
  await expect(footerToolbar).toHaveCSS('--background', 'transparent');
  expect(await header.evaluate((element) => getComputedStyle(element, '::after').content)).toBe('none');
  expect(await footer.evaluate((element) => getComputedStyle(element, '::after').content)).toBe('none');

  await content.evaluate((element: HTMLIonContentElement) => (element.fullscreen = false));
  await expect(content).not.toHaveClass(/content-fullscreen/);
  await expect(headerToolbar).not.toHaveCSS('--background', 'transparent');
  await expect(footerToolbar).not.toHaveCSS('--background', 'transparent');

  await footer.evaluate((element: HTMLIonFooterElement) => (element.translucent = true));
  await expect(footer).toHaveClass(/footer-translucent/);
  expect(await footer.evaluate((element) => getComputedStyle(element, '::after').content)).toBe('none');
});

test('dark resting glass applies the directional rim to standalone and grouped controls', async ({ page }) => {
  await page.goto('/main/index/native-ui-shell');
  await page.evaluate(() => document.documentElement.classList.add('ion-palette-dark'));
  const button = page.locator('app-native-ui-shell ion-button[type="submit"]');
  const surface = button.locator('[part="native"]');
  await expect(surface).toHaveCSS('border-left-color', 'rgba(0, 0, 0, 0)');
  await expect(surface).toHaveCSS('border-right-color', 'rgba(0, 0, 0, 0)');
  await expect(surface).toHaveCSS('background-color', 'rgba(62, 62, 62, 0.5)');
  const back = page.locator('app-native-ui-shell ion-back-button').locator('[part="native"]');
  await expect(back).toHaveCSS('border-left-color', 'rgba(0, 0, 0, 0)');
  await expect(back).toHaveCSS('background-color', 'rgba(62, 62, 62, 0.5)');
  const group = page.locator('app-native-ui-shell ion-buttons[data-glass-group]');
  await expect(group).toHaveCSS('border-left-color', 'rgba(0, 0, 0, 0)');
  await expect(group).toHaveCSS('border-right-color', 'rgba(0, 0, 0, 0)');
});

for (const dark of [false, true]) {
  test(`Glass preserves Ionic background and shadow overrides in ${dark ? 'dark' : 'light'} mode`, async ({ page }) => {
    await page.goto('/main/index/native-ui-shell');
    await page.evaluate((enabled) => document.documentElement.classList.toggle('ion-palette-dark', enabled), dark);
    const tabs = page.locator('ion-tab-bar');
    await expect(tabs).toHaveClass(/hydrated/);
    const tabFrame = await tabs.boundingBox();
    await tabs.evaluate((el) => el.style.setProperty('--background', 'rgb(12, 34, 56)'));
    expect(await tabs.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(12, 34, 56)');
    expect(await tabs.boundingBox()).toEqual(tabFrame);
    for (const selector of ['app-native-ui-shell ion-button[type="submit"]', 'app-native-ui-shell ion-back-button']) {
      const control = page.locator(selector);
      await control.evaluate((el) => {
        el.style.setProperty('--background', 'rgb(12, 34, 56)');
        el.style.setProperty('--box-shadow', '0 0 2px rgb(12, 34, 56)');
      });
      await expect(control.locator('[part="native"]')).toHaveCSS('background-color', 'rgb(12, 34, 56)');
      await expect(control.locator('[part="native"]')).toHaveCSS('box-shadow', 'rgb(12, 34, 56) 0px 0px 2px 0px');
    }
    await page.goto('/main/index/floating-action-button-fixed');
    await page.evaluate((enabled) => document.documentElement.classList.toggle('ion-palette-dark', enabled), dark);
    const fab = page.locator('ion-fab-button').first();
    await fab.evaluate((el) => el.style.setProperty('--box-shadow', 'none'));
    await expect(fab.locator('[part="native"]')).toHaveCSS('box-shadow', 'none');
  });
}
