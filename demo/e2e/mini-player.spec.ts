import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/main/index/native-ui-extension');
  await page.getByRole('switch', { name: 'Native extension', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Native extension', exact: true })).toBeChecked();
});

test('playback stays Web-owned, is isolated from opening, and survives tab changes', async ({ page }) => {
  const player = page.locator('[data-mini-player]');
  await expect(player).toBeVisible();
  await player.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(player).toHaveAttribute('data-playing', 'false');
  await expect(page.getByRole('button', { name: 'Close Now Playing' })).not.toBeVisible();
  await page.locator('ion-tab-button[tab="album"]').click();
  await expect(player).not.toBeVisible();
  await page.locator('ion-tab-button[tab="index"]').click();
  await page.getByRole('link', { name: 'Native UI Extension', exact: true }).click();
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

test('disable keeps the Web UI and re-enable preserves playback state', async ({ page }) => {
  const player = page.locator('[data-mini-player]');
  await player.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('switch', { name: 'Native extension', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Native extension', exact: true })).not.toBeChecked();
  await expect(player).toBeVisible();
  await expect(player).toHaveAttribute('data-shell', 'disabled');
  await expect(page.getByRole('status')).toHaveText('Extension: Disabled');
  await page.getByRole('switch', { name: 'Native extension', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Native extension', exact: true })).toBeChecked();
  await expect(player).toBeVisible();
  await expect(player).toHaveAttribute('data-playing', 'false');
});

for (const edge of ['left', 'right'] as const) {
  test(`Web player controls stay inside the ${edge} rail safe area`, async ({ page }) => {
    await page.locator('ion-app').evaluate((app, edge) => {
      app.classList.add('ios-theme-vertical-bars');
      app.classList.toggle('ios-theme-vertical-bars-left', edge === 'left');
      app.style.setProperty('--ios-theme-vertical-bars-native-inset', '80px');
    }, edge);
    const player = page.locator('[data-mini-player]');
    const box = await player.boundingBox();
    expect(box).not.toBeNull();
    const width = page.viewportSize()!.width;
    expect(box!.x).toBeGreaterThanOrEqual(edge === 'left' ? 92 : 12);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width - (edge === 'right' ? 92 : 12));
    expect(box!.height).toBe(48);
    await player.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(player).toHaveAttribute('data-playing', 'false');
  });
}
