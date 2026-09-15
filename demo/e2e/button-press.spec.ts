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
    await target.evaluate((element) => {
      // Keep the transition open until the test releases it. This checks the
      // interrupted state without depending on CI scheduling or frame rate.
      element.style.setProperty('--ios-theme-button-press-duration', '30s');
      element.setAttribute('data-transform-starts', '0');
      element.setAttribute('data-transform-ends', '0');
      element.addEventListener('transitionstart', (event) => {
        if ((event as TransitionEvent).propertyName === 'transform') {
          element.setAttribute('data-transform-starts', String(Number(element.getAttribute('data-transform-starts')) + 1));
        }
      });
      element.addEventListener('transitionend', (event) => {
        if ((event as TransitionEvent).propertyName === 'transform') {
          element.setAttribute('data-transform-ends', String(Number(element.getAttribute('data-transform-ends')) + 1));
        }
      });
    });
    const scale = () => target.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
    const transitionCount = (attribute: 'data-transform-starts' | 'data-transform-ends') =>
      target.evaluate((element, name) => Number(element.getAttribute(name)), attribute);
    const finishTransform = () =>
      target.evaluate((element) => {
        const transition = element
          .getAnimations()
          .find((animation) => animation instanceof CSSTransition && animation.transitionProperty === 'transform');
        transition?.finish();
      });

    await button.hover();
    await page.mouse.down();
    await expect.poll(() => transitionCount('data-transform-starts')).toBe(1);
    await expect.poll(scale).toBeGreaterThan(1);
    const shortPress = await scale();
    await page.mouse.up();
    expect(shortPress).toBeGreaterThan(1);
    expect(shortPress).toBeLessThan(1.25);
    await expect.poll(() => transitionCount('data-transform-starts')).toBe(2);
    await finishTransform();
    await expect.poll(() => transitionCount('data-transform-ends')).toBe(1);
    expect(await scale()).toBeCloseTo(1, 3);

    await target.evaluate((element) => element.style.setProperty('--ios-theme-button-press-duration', '80ms'));
    await page.mouse.down();
    await expect.poll(() => transitionCount('data-transform-ends')).toBe(2);
    const longPress = await scale();
    expect(longPress).toBeCloseTo(1.25, 2);
    await page.mouse.up();
    await expect.poll(() => transitionCount('data-transform-ends')).toBe(3);
    expect(await scale()).toBeCloseTo(1, 3);
  });
}
