import { expect, test } from '@playwright/test';

for (const { name, width, vertical } of [
  { name: 'phone', width: 402, vertical: false },
  { name: 'split pane', width: 1440, vertical: false },
  { name: 'vertical tabs', width: 700, vertical: true },
]) {
  test(`Web searchable preserves native clear and dismissal semantics (${name})`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/main/album');
    if (vertical) await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    const album = page.locator('app-album-page');
    const trigger = vertical ? page.locator('ion-app > .ios-theme-vertical-bars-search-projection') : album.locator('ion-fab-button');
    const footer = album.locator('ion-footer');
    const input = footer.locator('input');
    const dismiss = footer.getByRole('button', { name: 'Close', exact: true });
    const selectedTab = footer.locator('ion-buttons[slot=start] ion-button');
    const clear = footer.locator('.searchbar-clear-button');
    await trigger.click();
    await expect(footer).toHaveCSS('opacity', '1');
    await expect(input).not.toBeFocused();
    await expect(selectedTab).toBeVisible();
    await expect(dismiss).toBeHidden();
    const tabBar = page.locator('ion-tab-bar');
    if (!vertical) {
      await expect.poll(async () => Math.round((await selectedTab.boundingBox())!.x - (await tabBar.boundingBox())!.x)).toBe(0);
    }
    await input.fill('glass');
    await expect(selectedTab).toBeHidden();
    await expect(dismiss).toBeVisible();
    if (!vertical) {
      await expect.poll(async () => Math.round((await input.boundingBox())!.x - (await tabBar.boundingBox())!.x)).toBe(0);
    }
    await expect
      .poll(async () => {
        const field = (await input.boundingBox())!;
        const clearBounds = (await clear.boundingBox())!;
        return clearBounds.x >= field.x && clearBounds.x + clearBounds.width <= field.x + field.width;
      })
      .toBe(true);
    // Safari uses Option-Tab to include buttons in keyboard navigation.
    const nextControl = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await input.press(nextControl);
    await expect(clear).toBeFocused();
    await expect(dismiss).toBeVisible();
    await clear.press(nextControl);
    await expect(dismiss).toBeFocused();
    await clear.click();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await input.fill('retained');
    await dismiss.click();
    await expect(footer).toHaveCSS('opacity', '0');
    await expect(input).not.toBeFocused();
    await trigger.click();
    await expect(footer).toHaveCSS('opacity', '1');
    await expect(input).toHaveValue('retained');
    await expect(dismiss).toBeHidden();
    await selectedTab.click();
    await expect(footer).toHaveCSS('opacity', '0');
    await trigger.click();
    await expect(footer).toHaveCSS('opacity', '1');
    await footer.evaluate((element) => element.classList.add('ios-theme-disabled'));
    await input.focus();
    await expect(dismiss).toBeHidden();
    await expect(selectedTab).toBeVisible();
    await selectedTab.click();
    await expect(footer).toHaveCSS('opacity', '0');
    await page.locator('ion-tab-button[tab="index"]').click();
    await expect(page).toHaveURL(/\/main\/index$/);
  });
}
