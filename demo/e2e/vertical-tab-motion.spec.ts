import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

for (const edge of ['left', 'right']) {
  test(`vertical ${edge} tabs animate taps and follow vertical drags`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto('/main/index');
    await page.locator('ion-app').evaluate((el, side) => {
      el.classList.add('ios-theme-vertical-bars');
      el.classList.toggle('ios-theme-vertical-bars-left', side === 'left');
    }, edge);
    const bar = page.locator('#tab-bar-bottom');
    const tabs = bar.locator('ion-tab-button');
    const lens = page.locator('body > ion-tab-button.ios27-vertical-tab-effect');
    await expect(bar).toHaveClass(/ios27-enable-gesture/);
    await expect(lens).toHaveCount(1);
    const first = (await tabs.first().boundingBox())!;
    const second = (await tabs.nth(1).boundingBox())!;
    await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2);
    await page.mouse.down();
    await expect(lens).toBeVisible();
    const frames = await lens.evaluate((el) =>
      el
        .getAnimations()
        .flatMap((a) => (a.effect as KeyframeEffect).getKeyframes())
        .filter((f) => f.transform)
        .map((f) => {
          const m = new DOMMatrixReadOnly(String(f.transform));
          return { x: m.m41, y: m.m42 };
        }),
    );
    expect(Math.max(...frames.map((f) => f.y)) - Math.min(...frames.map((f) => f.y))).toBeGreaterThan(40);
    expect(Math.max(...frames.map((f) => f.x)) - Math.min(...frames.map((f) => f.x))).toBeLessThan(1);
    await page.mouse.up();
    await expect(tabs.nth(1)).toHaveClass(/tab-selected/);
    await expect(lens).toBeHidden();
    await tabs.nth(1).hover();
    await page.mouse.down();
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2, { steps: 8 });
    await expect(tabs.first()).toHaveClass(/ion-activated/);
    const following = (await lens.boundingBox())!;
    expect(Math.abs(following.y + following.height / 2 - (first.y + first.height / 2))).toBeLessThan(5);
    await page.mouse.up();
    await expect(tabs.first()).toHaveClass(/tab-selected/);
    await expect(lens).toBeHidden();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(lens).toHaveCount(0);
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveClass(/tab-selected/);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(lens).toHaveCount(1);
    await page.locator('ion-app').evaluate((el) => el.classList.remove('ios-theme-vertical-bars', 'ios-theme-vertical-bars-left'));
    await expect(lens).toHaveCount(0);
    await expect(page.locator('body > ion-tab-button.ion-cloned-element')).toHaveCount(1);
  });
}

test('vertical touch dragging survives browser panning and cancellation restores selection', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index');
  await page.locator('ion-app').evaluate((el) => el.classList.add('ios-theme-vertical-bars'));
  const bar = page.locator('#tab-bar-bottom');
  const tabs = bar.locator('ion-tab-button');
  const lens = page.locator('body > ion-tab-button.ios27-vertical-tab-effect');
  await expect(lens).toHaveCount(1);
  await expect(bar).toHaveCSS('touch-action', 'pan-x pinch-zoom');
  const box = (await tabs.first().boundingBox())!;
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await expect(lens).toBeVisible();
  // Start beyond Chromium's touch slop so it dispatches touchmove to Ionic.
  for (const delta of [20, 35, 52]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + delta }] });
    await expect(lens).toBeVisible();
    await expect
      .poll(async () => {
        const rect = (await lens.boundingBox())!;
        return Math.abs(rect.y + rect.height / 2 - (y + delta));
      })
      .toBeLessThanOrEqual(1);
  }
  await expect(tabs.nth(1)).toHaveClass(/ion-activated/);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(lens).toBeHidden();
  await expect(tabs.first()).toHaveClass(/tab-selected/);
  await expect(bar.locator('.ion-activated')).toHaveCount(0);
});

for (const disabledClass of ['ios-theme-disabled', 'ios26-disabled']) {
  test(`vertical tabs respect dynamic ${disabledClass} opt-out`, async ({ page }) => {
    await page.goto('/main/index');
    await page.locator('ion-app').evaluate((el) => el.classList.add('ios-theme-vertical-bars'));
    const bar = page.locator('#tab-bar-bottom');
    const lens = page.locator('body > ion-tab-button.ion-cloned-element');
    await expect(lens).toHaveClass(/ios27-vertical-tab-effect/);
    await bar.locator('ion-tab-button').nth(1).hover();
    await page.mouse.down();
    await expect(lens).toBeVisible();
    await bar.evaluate((el, name) => el.classList.add(name), disabledClass);
    await expect(lens).toHaveCount(0);
    await expect(bar).toHaveCSS('flex-direction', 'row');
    await expect(bar.locator('.ion-activated')).toHaveCount(0);
    await expect(bar.locator('ion-tab-button').first()).toHaveClass(/tab-selected/);
    await page.mouse.up();
    await bar.locator('ion-tab-button').nth(2).click();
    await expect(bar.locator('ion-tab-button').nth(2)).toHaveClass(/tab-selected/);
    await bar.evaluate((el, name) => el.classList.remove(name), disabledClass);
    await expect(bar).toHaveCSS('flex-direction', 'column');
    await expect(lens).toHaveClass(/ios27-vertical-tab-effect/);
    await bar.locator('ion-tab-button').first().click();
    await expect(bar.locator('ion-tab-button').first()).toHaveClass(/tab-selected/);
    await expect(lens).toBeHidden();
  });
}

test('a bar outside the direct ion-tabs child scope keeps horizontal gestures', async ({ page }) => {
  await page.goto('/main/index');
  const bar = page.locator('#tab-bar-bottom');
  await bar.evaluate((el) => {
    const app = el.closest('ion-app')!;
    const wrapper = document.createElement('div');
    // Exercise a standalone bar above the routed page, outside ion-tabs.
    wrapper.style.cssText = 'position: absolute; inset: 0; z-index: 100; pointer-events: none';
    el.style.pointerEvents = 'auto';
    app.append(wrapper);
    wrapper.append(el);
    app.classList.add('ios-theme-vertical-bars');
  });
  const lens = page.locator('body > ion-tab-button.ion-cloned-element');
  await expect(bar).toHaveCSS('flex-direction', 'row');
  await expect(lens).not.toHaveClass(/ios27-vertical-tab-effect/);
  await bar.locator('ion-tab-button').nth(1).hover();
  await page.mouse.down();
  await expect(lens).toBeVisible();
  await page.mouse.up();
  await expect(bar.locator('ion-tab-button').nth(1)).toHaveClass(/tab-selected/);
  await expect(lens).toBeHidden();
});
