import { expect, test } from '@playwright/test';
import type { TestAppElement } from './native-ui-mock';

test('verticalBars mode replaces the toolbar back button with an interactive Web projection', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index/button');
  const app = page.locator('ion-app');
  await app.evaluate((element) => element.classList.add('ios-theme-vertical-bars'));

  const source = page.locator('app-button ion-header ion-back-button').first();
  const projection = page.locator('ion-app > ion-back-button.ios-theme-vertical-bars-back-button-projection');
  await expect(source).toBeHidden();
  await expect(projection).toBeVisible();
  await expect(projection).toHaveCount(1);
  await app.evaluate((element) => element.style.setProperty('--ios-theme-vertical-bars-toolbar-top', '0px'));
  await expect(projection).toHaveCSS('top', '0px');
  await app.evaluate((element) => element.style.removeProperty('--ios-theme-vertical-bars-toolbar-top'));

  await source.evaluate((element) => {
    const original = element.getBoundingClientRect.bind(element);
    const app = document.querySelector('ion-app') as TestAppElement;
    app.verticalBarsBackButtonReads = 0;
    element.getBoundingClientRect = () => {
      app.verticalBarsBackButtonReads = (app.verticalBarsBackButtonReads ?? 0) + 1;
      return original();
    };
    element.toggleAttribute('data-projection-sync');
  });
  await page.waitForTimeout(100);
  const settledReads = await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).verticalBarsBackButtonReads);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).verticalBarsBackButtonReads)).toBe(settledReads);

  await projection.click();
  await expect(page).toHaveURL(/\/main\/index$/);
  await expect(projection).toHaveCount(0);
});

test('disabling verticalBars mode restores the toolbar back button', async ({ page }) => {
  await page.goto('/main/index/button');
  const app = page.locator('ion-app');
  await app.evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  const source = page.locator('app-button ion-header ion-back-button').first();
  await expect(source).toBeHidden();

  await app.evaluate((element) => element.classList.remove('ios-theme-vertical-bars'));
  await expect(source).toBeVisible();
  await expect(page.locator('ion-app > ion-back-button.ios-theme-vertical-bars-back-button-projection')).toHaveCount(0);
});

test('Native UI suspension synchronously restores and resumes verticalBars ownership', async ({ page }) => {
  await page.goto('/main/index/button');
  const app = page.locator('ion-app');
  await app.evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  const source = page.locator('app-button ion-header ion-back-button').first();
  const projection = page.locator('ion-app > ion-back-button.ios-theme-vertical-bars-back-button-projection');
  await expect(projection).toBeVisible();

  await page.evaluate(async () => {
    const app = document.querySelector('ion-app') as TestAppElement;
    app.verticalBarsLease = await app.nativeUI!.suspend();
  });
  await expect(source).toBeVisible();
  await expect(projection).toHaveCount(0);

  await page.evaluate(async () => (document.querySelector('ion-app') as TestAppElement).verticalBarsLease!.resume());
  await expect(source).toBeHidden();
  await expect(projection).toBeVisible();
});

test('a stale suspension lease cannot re-hide Web controls after shell teardown', async ({ page }) => {
  await page.goto('/main/index/button');
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  const source = page.locator('app-button ion-header ion-back-button').first();
  await expect(page.locator('ion-app > ion-back-button.ios-theme-vertical-bars-back-button-projection')).toBeVisible();

  await page.evaluate(async () => {
    const shell = (document.querySelector('ion-app') as TestAppElement).nativeUI!;
    const lease = await shell.suspend();
    await shell.destroy();
    await lease.resume();
  });
  await expect(source).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/native-ui-prehide/);
});

test('Web toolbar projection switches at WillLeave and restores on cancellation', async ({ page }) => {
  await page.goto('/main/index/button');
  await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
  const projection = page.locator('ion-app > ion-back-button.ios-theme-vertical-bars-back-button-projection');
  await expect(projection).toBeVisible();
  const routedPage = page.locator('app-button.ion-page');

  await routedPage.evaluate((element) => {
    element.dispatchEvent(new CustomEvent('ionViewWillLeave', { bubbles: true }));
  });
  await expect(projection).toHaveCount(0);
  await routedPage.evaluate((element) => element.dispatchEvent(new CustomEvent('ionViewDidLeave', { bubbles: true })));
  await page.waitForTimeout(150);
  await expect(projection).toHaveCount(0);

  await routedPage.evaluate((element) => {
    element.classList.add('ion-page-invisible');
    element.dispatchEvent(new CustomEvent('ionViewWillEnter', { bubbles: true }));
  });
  await expect(projection).toBeVisible();
  await routedPage.evaluate((element) => {
    element.classList.remove('ion-page-invisible');
    element.dispatchEvent(new CustomEvent('ionViewDidEnter', { bubbles: true }));
  });

  await routedPage.evaluate((element) => element.dispatchEvent(new CustomEvent('ionViewWillLeave', { bubbles: true })));
  await expect(projection).toHaveCount(0);
  await routedPage.evaluate((element) => element.dispatchEvent(new Event('iosThemeVerticalBarsTransitionCanceled', { bubbles: true })));
  await expect(projection).toBeVisible();
});

test('turning verticalBars on during a transition honors its success or cancellation', async ({ page }) => {
  await page.goto('/main/index/button');
  const app = page.locator('ion-app');
  await app.evaluate((element) => element.classList.remove('ios-theme-vertical-bars'));
  const routedPage = page.locator('app-button.ion-page');
  const projection = page.locator('ion-app > ion-back-button.ios-theme-vertical-bars-back-button-projection');

  await routedPage.evaluate((element) => element.dispatchEvent(new CustomEvent('ionViewWillLeave', { bubbles: true })));
  await app.evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  await expect(projection).toHaveCount(0);
  await routedPage.evaluate((element) => element.dispatchEvent(new Event('iosThemeVerticalBarsTransitionCanceled', { bubbles: true })));
  await expect(projection).toBeVisible();

  await app.evaluate((element) => element.classList.remove('ios-theme-vertical-bars'));
  await routedPage.evaluate((element) => element.dispatchEvent(new CustomEvent('ionViewWillLeave', { bubbles: true })));
  await app.evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  await routedPage.evaluate((element) => element.dispatchEvent(new CustomEvent('ionViewDidLeave', { bubbles: true })));
  await expect(projection).toHaveCount(0);
});

for (const optOut of ['class', 'data-native-ui']) {
  test(`verticalBars back projection respects ${optOut} opt-out regardless of Ionic mode`, async ({ page }) => {
    await page.goto('/main/index/button');
    const app = page.locator('ion-app');
    const source = page.locator('app-button ion-header ion-back-button').first();
    const toolbar = source.locator('xpath=ancestor::ion-toolbar');
    const projection = page.locator('ion-app > ion-back-button.ios-theme-vertical-bars-back-button-projection');

    await source.evaluate((element, optOut) => {
      if (optOut === 'class') element.classList.add('native-ui-disabled');
      else element.setAttribute('data-native-ui', 'disabled');
    }, optOut);
    await app.evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
    await expect(projection).toHaveCount(0);
    await expect(source).toBeVisible();

    await source.evaluate((element) => {
      element.classList.remove('native-ui-disabled');
      element.removeAttribute('data-native-ui');
      (element as HTMLIonBackButtonElement).mode = 'md';
    });
    await toolbar.evaluate((element) => element.classList.remove('ios'));
    await expect(source).toBeHidden();
    await expect(projection).toBeVisible();
    expect(await projection.evaluate((element: HTMLIonBackButtonElement) => element.mode)).toBe('md');
    await expect(projection).toHaveCSS('position', 'fixed');
  });
}

test('verticalBars toolbar projects icon actions and preserves text-only actions', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index/native-ui');
  await page.locator('app-native-ui ion-button[type=submit] ion-icon').evaluate((icon) => {
    icon.setAttribute('slot', 'icon-only');
    icon.parentElement!.querySelector('[data-label]')?.remove();
  });
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));

  const sourceGroup = page.locator('app-native-ui ion-header ion-buttons[slot="end"]').first();
  const textAction = sourceGroup.getByText('Cancel', { exact: true });
  const iconSource = sourceGroup.locator('ion-button[aria-label="Save"]');
  const iconProjection = page.locator('ion-app > ion-button.ios-theme-vertical-bars-toolbar-projection[aria-label="Save"]');

  await expect(sourceGroup).toBeVisible();
  await expect(textAction).toBeVisible();
  await expect(iconSource).toBeHidden();
  await expect(iconProjection).toBeVisible();
  await iconProjection.click();
  await expect(page.locator('[data-save-count]')).toHaveText('1');

  await textAction.evaluate((element) => element.remove());
  await expect(sourceGroup).toBeHidden();
});

test('theme-disabled ion-buttons project their icon actions as independent controls', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index/native-ui');
  const app = page.locator('ion-app');
  const sourceGroup = page.locator('[data-glass-group]');
  await sourceGroup.evaluate((element) => element.classList.add('ios-theme-disabled'));
  await app.evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  await expect(
    page.locator(
      'ion-app > ion-button.ios-theme-vertical-bars-toolbar-projection:has(ion-icon:is([name="logo-github"], [name="refresh-circle"]))',
    ),
  ).toHaveCount(2);
  await expect(sourceGroup).toBeHidden();
});

test('horizontal-only keeps a group and an individual button in their Web toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index/native-ui');
  const group = page.locator('[data-glass-group]');
  const save = page.locator('app-native-ui ion-button[type="submit"]');
  await group.evaluate((element) => element.classList.add('ios-theme-horizontal-only'));
  await save.evaluate((element) => element.classList.add('ios-theme-horizontal-only'));
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));

  await expect(group).toBeVisible();
  await expect(save).toBeVisible();
  await expect(page.locator('ion-app > ion-buttons.ios-theme-vertical-bars-toolbar-projection')).toHaveCount(0);
  await expect(page.locator('ion-app > ion-button.ios-theme-vertical-bars-toolbar-projection[aria-label="Save"]')).toHaveCount(0);
  await save.click();
  await expect(page.locator('[data-save-count]')).toHaveText('1');
});

test('Web search follows vertical tabs before native projection and restores its source', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/album');
  const app = page.locator('ion-app');
  const source = page.locator('app-album-page ion-fab-button');
  const projection = page.locator('ion-app > .ios-theme-vertical-bars-search-projection');
  const projectedButton = projection.locator('ion-fab-button');
  const tabs = page.locator('ion-tab-bar');
  const footer = page.locator('app-album-page ion-footer');
  await app.evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  await expect(source).toBeHidden();
  await expect(projection).toBeVisible();
  await source.evaluate((button: HTMLIonFabButtonElement) => {
    button.disabled = true;
    button.setAttribute('aria-label', 'Find photos');
    button.querySelector('ion-icon')!.name = undefined;
  });
  await expect(projectedButton).toHaveAttribute('aria-label', 'Find photos');
  await expect.poll(() => projectedButton.evaluate((button: HTMLIonFabButtonElement) => button.disabled)).toBe(true);
  await source.evaluate((button) => {
    button.querySelector('ion-icon')!.icon =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>';
  });
  await expect.poll(() => projectedButton.evaluate((button) => button.querySelector('ion-icon')!.icon)).toContain('<circle');
  await source.evaluate((button: HTMLIonFabButtonElement) => {
    button.disabled = false;
  });
  await footer.evaluate((element) => element.setAttribute('data-native-ui', 'disabled'));
  await expect(projection).toHaveCount(0);
  await expect(source).toBeVisible();
  await footer.evaluate((element) => element.removeAttribute('data-native-ui'));
  await expect(projection).toBeVisible();
  for (const left of [false, true]) {
    await app.evaluate((element, value) => element.classList.toggle('ios-theme-vertical-bars-left', value), left);
    await expect
      .poll(async () => {
        const button = (await projection.boundingBox())!;
        const bar = (await tabs.boundingBox())!;
        return Math.abs(button.x + button.width / 2 - bar.x - bar.width / 2);
      })
      .toBeLessThan(1);
    const button = (await projection.boundingBox())!;
    expect(button.y + button.height).toBeLessThan((await tabs.boundingBox())!.y);
    await tabs.evaluate((element) => element.setAttribute('data-native-ui', 'disabled'));
    await expect.poll(async () => (await projection.boundingBox())!.y).toBe(button.y);
    await tabs.evaluate((element) => element.removeAttribute('data-native-ui'));
    await tabs.evaluate((element) => element.style.setProperty('display', 'none'));
    await expect(projection).toBeVisible();
    await expect
      .poll(async () => {
        const rect = (await projection.boundingBox())!;
        return Math.abs(rect.y + rect.height - (900 - 24));
      })
      .toBeLessThan(1);
    const bottomButton = (await projection.boundingBox())!;
    expect(Math.abs(bottomButton.x - button.x)).toBeLessThan(1);
    await projection.click();
    await expect(footer).toHaveCSS('opacity', '1');
    await footer.locator('ion-buttons[slot=start] ion-button').click();
    await expect(footer).toHaveCSS('opacity', '0');
    await tabs.evaluate((element) => element.style.removeProperty('display'));
    await expect.poll(async () => (await projection.boundingBox())!.y).toBe(button.y);
    await projection.click();
    await expect(footer).toHaveCSS('opacity', '1');
    await expect(projection).toBeHidden();
    await footer.locator('ion-buttons[slot=start] ion-button').click();
    await expect(footer).toHaveCSS('opacity', '0');
    await expect(projection).toBeVisible();
  }
  await page.locator('ion-tab-button[tab=docs]').click();
  await expect(projection).toHaveCount(0);
  await page.locator('ion-tab-button[tab=album]').click();
  await expect(projection).toBeVisible();
  await app.evaluate((element) => element.classList.remove('ios-theme-vertical-bars'));
  await expect(projection).toHaveCount(0);
  await expect(source).toBeVisible();
  await expect(source).not.toHaveAttribute('data-native-ui-projected');
});
