import { expect, test } from '@playwright/test';

// Public iOS26 color contract; not a copy of the theme's default palette.
for (const dark of [false, true]) {
  test(`submit brightness respects both markup forms and disabled state (${dark ? 'dark' : 'light'})`, async ({ page }) => {
    await page.goto('/main/index/button');
    await expect(page.locator('app-button ion-button').first()).toHaveClass(/hydrated/);
    await page.evaluate((dark) => {
      document.documentElement.classList.toggle('ion-palette-dark', dark);
      document.documentElement.style.setProperty('--ion-color-primary-brightness', 'rgb(120, 220, 180)');
      const fixture = document.createElement('div');
      fixture.id = 'brightness';
      fixture.innerHTML = ['type="submit"', 'type="button" class="button-submit"']
        .flatMap((attrs) =>
          ['', 'color="primary"'].map(
            (color) =>
              `<ion-button fill="solid" ${color} ${attrs}>Enabled</ion-button><ion-button fill="solid" ${color} ${attrs} disabled>Disabled</ion-button>`,
          ),
        )
        .join('');
      document.querySelector('ion-app')!.append(fixture);
    }, dark);
    const buttons = page.locator('#brightness ion-button');
    await expect(buttons).toHaveCount(8);
    await expect(page.locator('#brightness ion-button:not(.hydrated)')).toHaveCount(0);
    for (const button of await buttons.all()) {
      const native = button.locator('[part="native"]');
      if (await button.evaluate((el) => (el as HTMLIonButtonElement).disabled)) {
        await expect(native).not.toHaveCSS('color', 'rgb(120, 220, 180)');
        await expect(native).not.toHaveCSS('border-top-color', 'rgb(120, 220, 180)');
      } else {
        await expect(native).toHaveCSS('color', 'rgb(120, 220, 180)');
        await expect(native).toHaveCSS('border-top-color', 'rgb(120, 220, 180)');
        expect(parseFloat(await native.evaluate((el) => getComputedStyle(el).borderTopWidth))).toBeGreaterThan(0);
      }
    }
  });

  test(`non-primary brightness accepts direct and legacy RGB overrides (${dark ? 'dark' : 'light'})`, async ({ page }) => {
    await page.goto('/main/index/button');
    await expect(page.locator('app-button ion-button').first()).toHaveClass(/hydrated/);
    await page.evaluate((dark) => {
      document.documentElement.classList.toggle('ion-palette-dark', dark);
      document.documentElement.style.setProperty('--ion-color-secondary-brightness-rgb', '120, 220, 180');
      document.documentElement.style.setProperty('--ion-color-danger-brightness', 'rgb(240, 170, 90)');
      document
        .querySelector('ion-app')!
        .insertAdjacentHTML(
          'beforeend',
          '<ion-button id="legacy-brightness" fill="solid" color="secondary" type="submit">Legacy</ion-button>' +
            '<ion-button id="direct-brightness" fill="solid" color="danger" type="button" class="button-submit">Direct</ion-button>',
        );
    }, dark);
    for (const [id, color] of [
      ['legacy-brightness', 'rgb(120, 220, 180)'],
      ['direct-brightness', 'rgb(240, 170, 90)'],
    ]) {
      const button = page.locator(`#${id}`);
      await expect(button).toHaveClass(/hydrated/);
      await expect(button.locator('[part="native"]')).toHaveCSS('color', color);
      await expect(button.locator('[part="native"]')).toHaveCSS('border-top-color', color);
    }
  });
}
