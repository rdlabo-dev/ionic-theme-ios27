import { expect, test } from '@playwright/test';

test('foldable mode replaces the toolbar back button with an interactive Web projection', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index/button');
  const app = page.locator('ion-app');
  await app.evaluate((element) => element.classList.add('ios-theme-enable-foldable'));

  const source = page.locator('app-button ion-header ion-back-button').first();
  const projection = page.locator('ion-app > ion-back-button.ios-theme-foldable-back-button-projection');
  await expect(source).toBeHidden();
  await expect(projection).toBeVisible();
  await expect(projection).toHaveCount(1);

  await source.evaluate((element) => {
    const original = element.getBoundingClientRect.bind(element);
    (window as any).foldableBackButtonReads = 0;
    element.getBoundingClientRect = () => {
      (window as any).foldableBackButtonReads++;
      return original();
    };
    element.toggleAttribute('data-projection-sync');
  });
  await page.waitForTimeout(100);
  const settledReads = await page.evaluate(() => (window as any).foldableBackButtonReads);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).foldableBackButtonReads)).toBe(settledReads);

  await projection.click();
  await expect(page).toHaveURL(/\/main\/index$/);
  await expect(projection).toHaveCount(0);
});

test('disabling foldable mode restores the toolbar back button', async ({ page }) => {
  await page.goto('/main/index/button');
  const app = page.locator('ion-app');
  await app.evaluate((element) => element.classList.add('ios-theme-enable-foldable'));
  const source = page.locator('app-button ion-header ion-back-button').first();
  await expect(source).toBeHidden();

  await app.evaluate((element) => element.classList.remove('ios-theme-enable-foldable'));
  await expect(source).toBeVisible();
  await expect(page.locator('ion-app > ion-back-button.ios-theme-foldable-back-button-projection')).toHaveCount(0);
});

test('Native UI Shell suspension synchronously restores and resumes foldable ownership', async ({ page }) => {
  await page.goto('/main/index/button');
  const app = page.locator('ion-app');
  await app.evaluate((element) => element.classList.add('ios-theme-enable-foldable'));
  const source = page.locator('app-button ion-header ion-back-button').first();
  const projection = page.locator('ion-app > ion-back-button.ios-theme-foldable-back-button-projection');
  await expect(projection).toBeVisible();

  await page.evaluate(async () => Object.assign(window, { foldableLease: await (window as any).nativeUIShell.suspend() }));
  await expect(source).toBeVisible();
  await expect(projection).toHaveCount(0);

  await page.evaluate(async () => (window as any).foldableLease.resume());
  await expect(source).toBeHidden();
  await expect(projection).toBeVisible();
});

test('foldable projection respects shell opt-out and iOS mode', async ({ page }) => {
  await page.goto('/main/index/button');
  const app = page.locator('ion-app');
  const source = page.locator('app-button ion-header ion-back-button').first();
  const toolbar = source.locator('xpath=ancestor::ion-toolbar');
  const projection = page.locator('ion-app > ion-back-button.ios-theme-foldable-back-button-projection');

  await source.evaluate((element) => element.classList.add('ios-theme-shell-disabled'));
  await app.evaluate((element) => element.classList.add('ios-theme-enable-foldable'));
  await expect(projection).toHaveCount(0);
  await expect(source).toBeVisible();

  await source.evaluate((element) => element.classList.remove('ios-theme-shell-disabled', 'ios'));
  await toolbar.evaluate((element) => element.classList.remove('ios'));
  await expect(projection).toHaveCount(0);
  await expect(source).toBeVisible();
});

test('foldable toolbar projects icon actions and preserves text-only actions', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index/native-ui-shell');
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-enable-foldable'));

  const sourceGroup = page.locator('app-native-ui-shell ion-header ion-buttons[slot="end"]').first();
  const textAction = sourceGroup.getByText('Cancel', { exact: true });
  const iconSource = sourceGroup.locator('ion-button[aria-label="Save"]');
  const iconProjection = page.locator('ion-app > ion-buttons.ios-theme-foldable-toolbar-projection ion-button[aria-label="Save"]');

  await expect(textAction).toBeVisible();
  await expect(iconSource).toBeHidden();
  await expect(iconProjection).toBeVisible();
  await iconProjection.click();
  await expect(page.locator('[data-save-count]')).toHaveText('1');
});
