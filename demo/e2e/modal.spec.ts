import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1210, height: 834 } });

for (const type of ['normal', 'card', 'sheet']) {
  test(`${type} opens once and closes with Done`, async ({ page }) => {
    await page.goto(`/main/index/modal?type=${type}`);
    const modal = page.locator('ion-modal');
    await expect(modal).toHaveCount(1);
    await expect(modal.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
    await modal.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(modal).toHaveCount(0);
    // A delegated ModalPage must not reopen the URL-selected overlay.
    await expect(page.getByText('present:normal', { exact: true })).toBeVisible();
  });
}

test('sheet retains dragging and backdrop dismissal', async ({ page }) => {
  await page.goto('/main/index/modal?type=sheet');
  const modal = page.locator('ion-modal');
  const handle = modal.locator('[part="handle"]');
  await expect(handle).toBeVisible();
  await expect.poll(() => modal.evaluate((el: HTMLIonModalElement) => el.getCurrentBreakpoint())).toBe(0.8);
  await page.waitForTimeout(600);
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 210, { steps: 30 });
  await page.mouse.up();
  await expect.poll(() => modal.evaluate((el: HTMLIonModalElement) => el.getCurrentBreakpoint())).toBe(0.5);
  await expect.poll(() => modal.evaluate((el) => Math.round(el.querySelector('.ion-page')!.getBoundingClientRect().bottom))).toBe(814);
  // Outside the sheet's horizontal bounds, the backdrop must remain interactive.
  await page.mouse.click(30, 350);
  await expect(modal).toHaveCount(0);
});

test('phone normal modal stays fullscreen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/main/index/modal?type=normal');
  const content = page.getByRole('dialog');
  await expect(content).toBeVisible();
  await expect.poll(async () => Math.round((await content.boundingBox())!.width)).toBe(390);
  await expect.poll(async () => Math.round((await content.boundingBox())!.height)).toBe(844);
});
