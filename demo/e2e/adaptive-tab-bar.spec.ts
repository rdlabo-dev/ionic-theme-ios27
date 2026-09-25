import { expect, test } from '@playwright/test';

const enableVerticalBars = async (page: import('@playwright/test').Page) => {
  const toggle = page.getByText('iPhone Duo Mode').locator('..').locator('ion-toggle');
  await toggle.click();
  await expect(page.locator('ion-app')).toHaveClass(/ios-theme-vertical-bars/);
};

test('verticalBars mode moves tabs into the right rail and reveals labels while dragging', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index');
  await enableVerticalBars(page);

  const bar = page.locator('#tab-bar-bottom');
  const buttons = bar.locator('ion-tab-button');
  await expect.poll(async () => (await bar.boundingBox())?.x).toBeGreaterThan(620);
  const barBox = (await bar.boundingBox())!;
  expect(barBox.width).toBeCloseTo(50, 0);
  await expect(buttons.first().locator('ion-label')).toHaveCSS('position', 'absolute');
  await expect(buttons.nth(1).locator('ion-label')).toHaveCSS('position', 'absolute');

  const selectedBox = (await buttons.first().boundingBox())!;
  const targetBox = (await buttons.nth(1).boundingBox())!;
  await page.mouse.move(selectedBox.x + selectedBox.width / 2, selectedBox.y + selectedBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 4 });
  await expect.poll(() => buttons.first().evaluate((element) => element.matches(':active'))).toBe(true);

  await expect(page).toHaveScreenshot('vertical-bars-tab-drag-labels.png', { animations: 'disabled' });
  await page.mouse.up();

  const overlayDirection = await page.evaluate(async () => {
    const menu = document.querySelector('ion-menu')!;
    const tabs = document.createElement('ion-tabs');
    const overlayBar = document.createElement('ion-tab-bar');
    overlayBar.mode = 'ios';
    tabs.append(overlayBar);
    menu.append(tabs);
    await customElements.whenDefined('ion-tab-bar');
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const direction = getComputedStyle(overlayBar).flexDirection;
    tabs.remove();
    return direction;
  });
  expect(overlayDirection).toBe('row');
});

test('manual classes place the Web rail on the left in Chrome', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index');
  await page.locator('ion-app').evaluate((root) => root.classList.add('ios-theme-vertical-bars', 'ios-theme-vertical-bars-left'));

  const bar = page.locator('#tab-bar-bottom');
  await expect.poll(async () => (await bar.boundingBox())?.x).toBeLessThan(35);
  await expect(bar).toHaveScreenshot('vertical-bars-left.png', { animations: 'disabled' });
});
