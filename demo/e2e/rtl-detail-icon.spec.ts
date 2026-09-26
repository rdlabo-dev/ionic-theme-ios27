import { expect, test } from '@playwright/test';

test('inset list keeps the detail icon inside the item in RTL', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index', { waitUntil: 'networkidle' });

  const measure = async (direction: 'ltr' | 'rtl') => {
    await page.locator('ion-app').evaluate((app, dir) => (app.dir = dir), direction);
    await page.waitForTimeout(200);
    return page
      .locator('ion-list ion-item', { hasText: 'accordion' })
      .first()
      .evaluate((item) => {
        const icon = item.shadowRoot!.querySelector('.item-detail-icon')!;
        const itemBox = item.getBoundingClientRect();
        const iconBox = icon.getBoundingClientRect();
        return {
          fromLeft: iconBox.left - itemBox.left,
          fromRight: itemBox.right - iconBox.right,
        };
      });
  };

  const ltr = await measure('ltr');
  const rtl = await measure('rtl');

  expect(ltr.fromRight).toBeGreaterThan(0);
  expect(rtl.fromLeft).toBeGreaterThan(0);
  expect(Math.abs(rtl.fromLeft - ltr.fromRight)).toBeLessThanOrEqual(4);
});
