import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/main/album');
});

test('playback stays Web-owned, is isolated from opening, and survives tab changes', async ({ page }) => {
  const player = page.locator('[data-mini-player]');
  await expect(player).toBeVisible();
  await player.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(player).toHaveAttribute('data-playing', 'false');
  await expect(page.getByRole('button', { name: 'Close Now Playing' })).not.toBeVisible();
  await page.locator('ion-tab-button[tab="index"]').click();
  await expect(player).not.toBeVisible();
  await page.locator('ion-tab-button[tab="album"]').click();
  await expect(player).toHaveAttribute('data-playing', 'false');
  await player.getByRole('button', { name: 'Open Now Playing' }).click();
  const modal = page.locator('ion-modal');
  await expect(modal.getByText('Paused · 1:24 / 3:45')).toBeVisible();
  await modal.getByRole('button', { name: 'Play', exact: true }).click();
  await modal.getByRole('button', { name: 'Close Now Playing' }).click();
  await expect(player).toHaveAttribute('data-playing', 'true');
});

test('upward swipe opens once and keyboard activation still works after dismissal', async ({ page }) => {
  const open = page.locator('[data-player-open]');
  const box = await open.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 40, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 40, box!.y - 60, { steps: 8 });
  await page.mouse.up();
  const close = page.getByRole('button', { name: 'Close Now Playing' });
  await expect(close).toBeVisible();
  await close.click();
  await expect(close).not.toBeVisible();
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(close).toBeVisible();
});
