import { expect, test } from '@playwright/test';

for (const grouped of [false, true]) {
  test(`button scale reverses on release (${grouped ? 'group' : 'standalone'})`, async ({ page }) => {
    await page.goto('/main/index/native-ui-shell');
    await page.locator('app-native-ui-shell').waitFor();
    await page.evaluate((grouped) => {
      const fixture = document.createElement('div');
      fixture.style.cssText = 'position:fixed;inset:200px auto auto 100px;z-index:99999';
      fixture.innerHTML = grouped
        ? '<ion-buttons mode="ios" class="ios" id="press-target"><ion-button mode="ios" class="ios" fill="clear">Press</ion-button></ion-buttons>'
        : '<ion-button mode="ios" class="ios" id="press-target" fill="default">Press</ion-button>';
      document.body.append(fixture);
    }, grouped);
    const target = page.locator('#press-target');
    const button = grouped ? target.locator('ion-button') : target;
    await expect(button).toHaveClass(/hydrated/);
    const scale = () => target.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
    await button.hover();
    await page.mouse.down();
    await page.waitForTimeout(45);
    const shortPress = await scale();
    await page.mouse.up();
    await page.waitForTimeout(35);
    const releasing = await scale();
    await page.waitForTimeout(450);
    expect(shortPress).toBeGreaterThan(1);
    expect(shortPress).toBeLessThan(1.25);
    expect(releasing).toBeLessThan(shortPress);
    expect(await scale()).toBeCloseTo(1, 3);
    await page.mouse.down();
    await page.waitForTimeout(190);
    const overshoot = await scale();
    expect(overshoot).toBeGreaterThan(1.25);
    expect(overshoot).toBeLessThan(1.28);
    await page.waitForTimeout(300);
    const longPress = await scale();
    expect(longPress).toBeCloseTo(1.25, 2);
    await page.mouse.up();
    await page.waitForTimeout(450);
    expect(await scale()).toBeCloseTo(1, 3);
  });
}
