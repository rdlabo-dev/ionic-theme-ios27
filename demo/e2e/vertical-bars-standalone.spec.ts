import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { compile } from 'sass';

const verticalBars = compile(resolve(__dirname, '../../src/styles/vertical-bars.scss')).css;

test('Vertical Control Area works in md mode with Ionic CSS and no iOS 27 theme', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index/native-ui-shell?verticalBarsOnly=1&ionicMode=md');
  await expect(page.locator('ion-app')).toHaveClass(/\bmd\b/);
  await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      for (let index = sheet.cssRules.length - 1; index >= 0; index--) {
        const rule = sheet.cssRules[index];
        if (rule instanceof CSSSupportsRule && rule.cssText.includes('--ios27-color-scheme')) sheet.deleteRule(index);
      }
    }
  });
  await page.addStyleTag({ content: verticalBars });
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ios27-color-scheme').trim())).toBe('');
  const backSource = page.locator('app-native-ui-shell ion-back-button');
  await backSource.evaluate((element: HTMLIonBackButtonElement) => {
    element.text = 'Return';
    element.closest('app-native-ui-shell')?.querySelector('ion-content')?.prepend(element);
  });
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));

  const tabBar = page.locator('#tab-bar-bottom');
  await expect.poll(async () => (await tabBar.boundingBox())?.x).toBeGreaterThan(620);
  const app = page.locator('ion-app');
  await app.evaluate((element) => element.style.setProperty('--ios-theme-vertical-bars-native-inset', '64px'));
  await expect
    .poll(() =>
      app.evaluate((element) => getComputedStyle(element).getPropertyValue('--ios-theme-vertical-bars-safe-area-right-resolved').trim()),
    )
    .toBe('64px');
  await app.evaluate((element) => element.style.removeProperty('--ios-theme-vertical-bars-native-inset'));
  const toolbar = page.locator('app-native-ui-shell ion-toolbar').first();
  await expect
    .poll(() => toolbar.evaluate((element) => getComputedStyle(element).getPropertyValue('--ion-safe-area-right').trim()))
    .toBe('0px');
  const source = page.locator('app-native-ui-shell ion-button[type="submit"]');
  const projection = page.locator('ion-app > ion-button.ios-theme-vertical-bars-toolbar-projection[aria-label="Save"]');
  await expect(source).toBeHidden();
  await expect(projection).toBeVisible();
  await projection.click();
  await expect(page.locator('[data-save-count]')).toHaveText('1');

  const back = page.locator('ion-app > ion-back-button.ios-theme-vertical-bars-back-button-projection');
  await expect(back).toBeVisible();
  await expect(backSource).toBeHidden();
  await back.click();
  await expect(page).toHaveURL(/\/main\/index$/);
});
