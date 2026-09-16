import { expect, test, type Page } from '@playwright/test';

const setPalette = (page: Page) =>
  page.evaluate(() => {
    const root = document.documentElement.style;
    root.setProperty('--ion-color-primary', 'rgb(10, 20, 30)');
    root.setProperty('--ion-color-primary-contrast', 'rgb(240, 241, 242)');
    root.setProperty('--ion-color-primary-shade', 'rgb(5, 10, 15)');
    root.setProperty('--ios-theme-destructive-color', 'rgb(190, 20, 30)');
    root.setProperty('--ion-text-color', 'rgb(40, 41, 42)');
    root.setProperty('--ion-text-color-rgb', '40, 41, 42');
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/main/index');
  await setPalette(page);
});

test('action sheet preferred role is distinct from selection and preserves its dismissal role', async ({ page }) => {
  await page.evaluate(async () => {
    const sheet = document.createElement('ion-action-sheet');
    sheet.mode = 'ios';
    sheet.header = 'Actions';
    sheet.buttons = [
      { text: 'No role' },
      { text: 'Default', role: 'default' },
      { text: 'Selected', role: 'selected' },
      { text: 'Delete', role: 'destructive' },
      { text: 'Continue', role: 'preferred', icon: 'arrow-forward' },
      { text: 'Confirm', role: 'confirm' },
      { text: 'Cancel', role: 'cancel' },
    ];
    sheet.addEventListener('ionActionSheetDidDismiss', (event) => {
      document.body.dataset['dismissRole'] = (event as CustomEvent<{ role?: string }>).detail.role ?? '';
    });
    document.body.append(sheet);
    await sheet.present();
  });

  const preferred = page.locator('ion-action-sheet .action-sheet-preferred');
  await expect(preferred).toBeVisible();
  await expect(preferred).toHaveCSS('background-color', 'rgb(10, 20, 30)');
  await expect(preferred).toHaveCSS('color', 'rgb(240, 241, 242)');
  await expect(preferred.locator('ion-icon')).toHaveCSS('color', 'rgb(240, 241, 242)');
  await preferred.evaluate((button) => button.classList.add('ion-activated'));
  await expect(preferred).toHaveCSS('background-color', 'rgb(5, 10, 15)');
  await preferred.evaluate((button) => button.classList.remove('ion-activated'));

  const selected = page.locator('ion-action-sheet .action-sheet-selected');
  await expect(selected).toHaveCSS('background-color', 'rgb(10, 20, 30)');
  await expect(selected).toHaveCSS('color', 'rgb(240, 241, 242)');
  await selected.evaluate((button) => button.classList.add('ion-activated'));
  await expect(selected).toHaveCSS('color', 'rgb(240, 241, 242)');
  await expect(selected).not.toHaveCSS('background-color', 'rgb(5, 10, 15)');

  for (const name of ['No role', 'Default', 'Cancel', 'Confirm']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toHaveCSS('color', 'rgb(40, 41, 42)');
    await expect(button).not.toHaveCSS('background-color', 'rgb(10, 20, 30)');
    await expect(button).not.toHaveCSS('background-color', 'rgb(5, 10, 15)');
  }
  const destructive = page.locator('ion-action-sheet .action-sheet-destructive');
  await expect(destructive).toHaveCSS('color', 'rgb(190, 20, 30)');
  await expect(destructive).not.toHaveCSS('background-color', 'rgb(10, 20, 30)');

  await preferred.click();
  await expect.poll(() => page.locator('body').getAttribute('data-dismiss-role')).toBe('preferred');
});

test('alert preferred role uses the same palette and pressed state', async ({ page }) => {
  await page.evaluate(async () => {
    const alert = document.createElement('ion-alert');
    alert.mode = 'ios';
    alert.header = 'Continue?';
    alert.buttons = [
      { text: 'No role' },
      { text: 'Default', role: 'default' },
      { text: 'Cancel', role: 'cancel' },
      { text: 'Delete', role: 'destructive' },
      { text: 'Confirm', role: 'confirm' },
      { text: 'Continue', role: 'preferred' },
    ];
    alert.addEventListener('ionAlertDidDismiss', (event) => {
      document.body.dataset['dismissRole'] = (event as CustomEvent<{ role?: string }>).detail.role ?? '';
    });
    document.body.append(alert);
    await alert.present();
  });

  const preferred = page.locator('ion-alert .alert-button-role-preferred');
  await expect(preferred).toBeVisible();
  await expect(preferred).toHaveCSS('background-color', 'rgb(10, 20, 30)');
  await expect(preferred).toHaveCSS('color', 'rgb(240, 241, 242)');
  await preferred.evaluate((button) => button.classList.add('ion-activated'));
  await expect(preferred).toHaveCSS('background-color', 'rgb(5, 10, 15)');
  await preferred.evaluate((button) => button.classList.remove('ion-activated'));

  for (const name of ['No role', 'Default', 'Cancel', 'Confirm']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toHaveCSS('color', 'rgb(40, 41, 42)');
    await expect(button).not.toHaveCSS('background-color', 'rgb(10, 20, 30)');
    await expect(button).not.toHaveCSS('background-color', 'rgb(5, 10, 15)');
  }
  const destructive = page.locator('ion-alert .alert-button-role-destructive');
  await expect(destructive).toHaveCSS('color', 'rgb(190, 20, 30)');
  await expect(destructive).not.toHaveCSS('background-color', 'rgb(10, 20, 30)');

  await preferred.click();
  await expect.poll(() => page.locator('body').getAttribute('data-dismiss-role')).toBe('preferred');
});
