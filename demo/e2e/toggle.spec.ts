import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 402, height: 874 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/main/index/toggle');
});

for (const inItem of [false, true]) {
  test(`short tap shows and releases the glass effect (${inItem ? 'item' : 'standalone'})`, async ({ page }) => {
    const toggle = page.locator(inItem ? 'ion-toggle[color="success"]' : '.section-example ion-toggle').first();
    const handle = toggle.locator('[part="handle"]');
    const track = toggle.locator('[part="track"]');
    await track.scrollIntoViewIfNeeded();
    await toggle.evaluate((element) => {
      element.dataset['changes'] = '0';
      element.addEventListener('ionChange', () => {
        element.dataset['changes'] = String(Number(element.dataset['changes']) + 1);
      });
    });
    const rect = (await track.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    // No drag and no artificial long-press delay.
    await expect(toggle).not.toHaveClass(/toggle-activated/);
    await page.mouse.up();
    await expect.poll(() => handle.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(30);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAttribute('data-changes', '1');
    await expect.poll(() => handle.evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBe(24);
    await track.tap();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toHaveAttribute('data-changes', '2');
  });
}

test('reduced motion removes the release transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const toggle = page.locator('.section-example ion-toggle').first();
  await expect(toggle.locator('[part="handle"]')).toHaveCSS('transition-duration', '0s');
  await toggle.locator('[part="track"]').tap();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect((await toggle.locator('[part="handle"]').boundingBox())!.height).toBe(24);
});

test('custom handle shadow remains overridable', async ({ page }) => {
  const toggle = page.locator('.section-example ion-toggle').first();
  await toggle.evaluate((element) => element.style.setProperty('--handle-box-shadow', 'none'));
  await expect(toggle.locator('[part="handle"]')).toHaveCSS('box-shadow', 'none');
});

test('public radius and handle transition remain overridable', async ({ page }) => {
  const toggle = page.locator('.section-example ion-toggle').first();
  await toggle.evaluate((element) => {
    element.style.setProperty('--border-radius', '8px');
    element.style.setProperty('--handle-transition', 'none');
  });
  await expect(toggle.locator('[part="track"]')).toHaveCSS('border-radius', '8px');
  await expect(toggle.locator('[part="handle"]')).toHaveCSS('transition-duration', '0s');
});

test('checked toggle uses its Ionic palette color', async ({ page }) => {
  const toggle = page.locator('.section-example ion-toggle').first();
  await toggle.evaluate((el) => {
    el.setAttribute('color', 'danger');
    (el as HTMLIonToggleElement).checked = true;
  });
  await expect(toggle).toHaveClass(/ion-color-danger/);
  const expected = await toggle.evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(el).getPropertyValue('--ion-color-base');
    el.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(toggle.locator('[part="track"]')).toHaveCSS('background-color', expected);
});
