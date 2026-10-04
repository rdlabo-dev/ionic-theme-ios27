import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const shots = resolve(__dirname, '../../screenshots/mini-player');

const openAlbum = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => (document.IONIC_E2E_TESTING = true));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/main/album', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('ion-toolbar.ios-theme-tab-accessory')).toBeVisible();
};

test.describe('tab accessory web fallback', () => {
  test('default capsule uses a 28px radius, 36px thumb and rgba progress fallback', async ({ page }) => {
    await openAlbum(page);
    const toolbar = page.locator('ion-toolbar.ios-theme-tab-accessory');
    await expect(toolbar).toHaveCSS('border-radius', '28px');
    await expect(toolbar).toHaveCSS('align-items', 'center');
    await expect(toolbar.locator('ion-thumbnail')).toHaveCSS('width', '36px');
    const track = await toolbar.locator('ion-progress-bar').evaluate((el) => getComputedStyle(el).getPropertyValue('--background').trim());
    expect(track).toMatch(/rgba?\(|color-mix/);
    const bottom = await toolbar.evaluate((el) => getComputedStyle(el).bottom);
    expect(Number.parseFloat(bottom)).toBeGreaterThanOrEqual(70);
  });

  test('thumbnail is vertically centered in the 64px toolbar', async ({ page }) => {
    await openAlbum(page);
    const toolbar = page.locator('ion-toolbar.ios-theme-tab-accessory');
    const metrics = await toolbar.evaluate((el) => {
      const thumb = el.querySelector('ion-thumbnail');
      const bar = el.getBoundingClientRect();
      const art = thumb!.getBoundingClientRect();
      return { top: art.top - bar.top, bottom: bar.bottom - art.bottom, height: bar.height };
    });
    expect(metrics.height).toBe(64);
    expect(Math.abs(metrics.top - metrics.bottom)).toBeLessThanOrEqual(1);
  });

  test('classic preset uses a 12px radius and sits above the 62px island', async ({ page }) => {
    await openAlbum(page);
    const toolbar = page.locator('ion-toolbar.ios-theme-tab-accessory');
    await toolbar.evaluate((el) => el.classList.add('ios-theme-tab-accessory-classic'));
    await expect(toolbar).toHaveCSS('border-radius', '12px');
    const bottom = await toolbar.evaluate((el) => getComputedStyle(el).bottom);
    expect(Number.parseFloat(bottom)).toBeGreaterThanOrEqual(70);
  });

  test('writes docs screenshots for the capsule and classic presets', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'Docs shots are captured from WebKit');
    mkdirSync(shots, { recursive: true });
    await openAlbum(page);
    const toolbar = page.locator('ion-toolbar.ios-theme-tab-accessory');
    await page.screenshot({
      path: resolve(shots, 'webkit-capsule.png'),
      clip: { x: 0, y: 680, width: 390, height: 164 },
    });
    await toolbar.evaluate((el) => el.classList.add('ios-theme-tab-accessory-classic'));
    await page.screenshot({
      path: resolve(shots, 'webkit-classic.png'),
      clip: { x: 0, y: 680, width: 390, height: 164 },
    });
  });
});
