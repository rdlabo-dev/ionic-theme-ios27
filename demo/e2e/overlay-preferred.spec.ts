import { expect, test, type Page } from '@playwright/test';

const setPalette = (page: Page) =>
  page.evaluate(() => {
    const root = document.documentElement.style;
    root.setProperty('--ion-color-primary', 'rgb(10, 20, 30)');
    root.setProperty('--ion-color-primary-contrast', 'rgb(240, 241, 242)');
    root.setProperty('--ion-color-primary-shade', 'rgb(5, 10, 15)');
    root.setProperty('--ios-theme-destructive-color', 'rgb(190, 20, 30)');
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
      { text: 'Default' },
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

  await expect(page.locator('ion-action-sheet .action-sheet-selected')).not.toHaveClass(/action-sheet-preferred/);
  await expect(page.locator('ion-action-sheet .action-sheet-destructive')).toHaveCSS('color', 'rgb(190, 20, 30)');
  await expect(page.getByRole('button', { name: 'Confirm' })).not.toHaveClass(/action-sheet-preferred/);

  await preferred.click();
  await expect.poll(() => page.locator('body').getAttribute('data-dismiss-role')).toBe('preferred');
});

test('alert preferred role uses the same palette and pressed state', async ({ page }) => {
  await page.evaluate(async () => {
    const alert = document.createElement('ion-alert');
    alert.mode = 'ios';
    alert.header = 'Continue?';
    alert.buttons = [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Delete', role: 'destructive' },
      { text: 'Confirm', role: 'confirm' },
      { text: 'Continue', role: 'preferred' },
    ];
    document.body.append(alert);
    await alert.present();
  });

  const preferred = page.locator('ion-alert .alert-button-role-preferred');
  await expect(preferred).toBeVisible();
  await expect(preferred).toHaveCSS('background-color', 'rgb(10, 20, 30)');
  await expect(preferred).toHaveCSS('color', 'rgb(240, 241, 242)');
  await preferred.evaluate((button) => button.classList.add('ion-activated'));
  await expect(preferred).toHaveCSS('background-color', 'rgb(5, 10, 15)');
  await expect(page.locator('ion-alert .alert-button-role-destructive')).toHaveCSS('color', 'rgb(190, 20, 30)');
  await expect(page.getByRole('button', { name: 'Confirm' })).not.toHaveClass(/alert-button-role-preferred/);
});
