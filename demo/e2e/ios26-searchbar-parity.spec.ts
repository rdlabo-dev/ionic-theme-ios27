import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 402, height: 874 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/main/index/searchbar', { waitUntil: 'networkidle' });
  await expect(page.locator('app-searchbar ion-searchbar').first()).toHaveClass(/hydrated/);
  await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.id = 'search-parity';
    fixture.style.cssText = 'position:fixed;left:24px;top:220px;width:352px;z-index:10000';
    fixture.innerHTML = '<ion-searchbar id="measured-search" placeholder="Search" mode="ios"></ion-searchbar>';
    document.querySelector('ion-app')!.append(fixture);
  });
  await expect(page.locator('#measured-search')).toHaveClass(/hydrated/);
});

for (const dark of [false, true]) {
  test(`56pt host and 44pt inset field, inline clear preserved (${dark ? 'dark' : 'light'})`, async ({ page }) => {
    await page.evaluate((enabled) => document.documentElement.classList.toggle('ion-palette-dark', enabled), dark);
    const search = page.locator('#measured-search');
    const field = search.locator('input');
    const hostBox = (await search.boundingBox())!;
    const fieldBox = (await field.boundingBox())!;
    expect(hostBox.height).toBe(56);
    expect(fieldBox.height).toBe(44);
    expect(fieldBox.width).toBe(336);
    expect(fieldBox.x - hostBox.x).toBe(8);
    expect(fieldBox.y - hostBox.y).toBe(6);
    await expect(field).toHaveCSS('border-radius', '22px');
    await expect(field).toHaveCSS('background-color', dark ? 'rgba(62, 62, 62, 0.3)' : 'rgba(255, 255, 255, 0.72)');
    await field.fill('Ionic');
    const populated = (await field.boundingBox())!;
    expect(populated.width).toBe(fieldBox.width);
    const clear = search.getByRole('button', { name: 'reset', exact: true });
    await expect(clear).toBeVisible();
    const clearBox = (await clear.boundingBox())!;
    expect(clearBox.x).toBeGreaterThanOrEqual(populated.x);
    expect(clearBox.x + clearBox.width).toBeLessThanOrEqual(populated.x + populated.width + 0.5);
    await clear.click();
    await expect(field).toHaveValue('');
    await expect(field).toBeFocused();
  });
}

test('public surface properties and RTL inline insets remain usable', async ({ page }) => {
  const search = page.locator('#measured-search');
  await search.evaluate((el) => {
    el.setAttribute('dir', 'rtl');
    el.style.setProperty('--background', 'rgb(12, 34, 56)');
    el.style.setProperty('--border-radius', '9px');
    el.style.setProperty('--box-shadow', 'none');
  });
  await expect(search.locator('input')).toHaveCSS('background-color', 'rgb(12, 34, 56)');
  await expect(search.locator('input')).toHaveCSS('border-radius', '9px');
  await expect(search.locator('input')).toHaveCSS('box-shadow', 'none');
  expect(await search.locator('input').evaluate((el) => parseFloat(getComputedStyle(el).paddingInlineStart))).toBeCloseTo(39.6667, 3);
  await search.locator('input').fill('検索');
  await search.getByRole('button', { name: 'reset', exact: true }).click();
  await expect(search.locator('input')).toHaveValue('');
});

test('classic and opt-outs do not inherit the new field geometry', async ({ page }) => {
  const search = page.locator('#measured-search');
  for (const cls of ['searchbar-classic', 'ios-theme-disabled', 'ios26-disabled']) {
    await search.evaluate((el, className) => {
      el.classList.remove('searchbar-classic', 'ios-theme-disabled', 'ios26-disabled');
      el.classList.add(className);
    }, cls);
    await expect(search.locator('input')).not.toHaveCSS('border-radius', '22px');
  }
});

test('disabled search remains disabled and emits no clear event', async ({ page }) => {
  const search = page.locator('#measured-search');
  await search.evaluate((el) => {
    const host = el as HTMLIonSearchbarElement;
    host.value = 'Ionic';
    host.disabled = true;
    host.dataset['clears'] = '0';
    host.addEventListener('ionClear', () => (host.dataset['clears'] = String(Number(host.dataset['clears']) + 1)));
  });
  await expect(search.locator('input')).toBeDisabled();
  await expect(search).toHaveAttribute('data-clears', '0');
});
