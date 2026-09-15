import { expect, test, type Page } from '@playwright/test';

const installAnimationObserver = async (page: Page) => {
  await page.addInitScript(() => {
    const originalAnimate = Element.prototype.animate;

    (window as any).__IONIC_ANIMATION_CALLS__ = [];
    Element.prototype.animate = function (keyframes, options) {
      const animation = originalAnimate.call(this, keyframes, options);
      const properties = Array.isArray(keyframes)
        ? [
            ...new Set(
              keyframes.flatMap((keyframe) => Object.keys(keyframe).filter((key) => !['offset', 'easing', 'composite'].includes(key))),
            ),
          ]
        : Object.keys(keyframes ?? {}).filter((key) => !['offset', 'easing', 'composite'].includes(key));
      const duration = typeof options === 'number' ? options : typeof options?.duration === 'number' ? options.duration : 0;

      (window as any).__IONIC_ANIMATION_CALLS__.push({
        animation,
        duration,
        properties,
        targetClass: this.getAttribute('class') ?? '',
        targetTag: this.localName,
      });

      return animation;
    };
  });
};

const clearAnimationCalls = async (page: Page) => {
  await page.evaluate(() => ((window as any).__IONIC_ANIMATION_CALLS__ = []));
};

const hasRunningAnimation = (page: Page, targetClass?: string) => {
  return page.evaluate((expectedClass) => {
    return (window as any).__IONIC_ANIMATION_CALLS__.some(
      (call: { animation: Animation; duration: number; properties: string[]; targetClass: string }) =>
        call.animation.playState === 'running' &&
        call.duration > 0 &&
        call.properties.includes('transform') &&
        (expectedClass === undefined || call.targetClass.split(' ').includes(expectedClass)),
    );
  }, targetClass);
};

const hasAnimationCall = (page: Page, targetClass: string) => {
  return page.evaluate((expectedClass) => {
    return (window as any).__IONIC_ANIMATION_CALLS__.some(
      (call: { duration: number; properties: string[]; targetClass: string }) =>
        call.duration > 0 && call.properties.includes('transform') && call.targetClass.split(' ').includes(expectedClass),
    );
  }, targetClass);
};

test.describe('Animation Tests', () => {
  test.beforeEach(async ({ page }) => {
    await installAnimationObserver(page);
  });

  test('runs and completes the iOS page transition', async ({ page }) => {
    const shade = page.locator('.ios27-transition-shade');
    const checkDimming = async (back: boolean) => {
      const opacity: number[] = [];
      for (const progress of [0.2, 0.4]) {
        await page.evaluate((progress) => {
          document.getAnimations().forEach((animation) => {
            animation.pause();
            animation.currentTime = Number(animation.effect!.getTiming().duration) * progress;
          });
        }, progress);
        await expect(page.locator('index-page')).toHaveCSS('opacity', '1');
        opacity.push(await shade.evaluate((el) => Number(getComputedStyle(el).opacity)));
      }
      expect(back ? opacity[0] - opacity[1] : opacity[1] - opacity[0]).toBeGreaterThan(0);
      const cover = (await shade.boundingBox())!;
      const top = (await page.locator('app-button').boundingBox())!;
      expect(cover.y).toBeCloseTo(top.y, 1);
      expect(cover.height).toBeCloseTo(top.height, 1);
      expect(cover.x + cover.width).toBeCloseTo(top.x, 1);
      await page.evaluate(() => document.getAnimations().forEach((animation) => animation.play()));
    };
    await page.goto('/main/index', { waitUntil: 'networkidle' });
    await clearAnimationCalls(page);

    await page.getByRole('button', { name: 'button', exact: true }).click();

    await expect.poll(() => hasRunningAnimation(page), { timeout: 2000 }).toBe(true);
    await checkDimming(false);
    await expect(page).toHaveURL('/main/index/button');
    await expect(page.locator('app-button.ion-page:not(.ion-page-hidden)')).toBeVisible();
    await expect.poll(() => hasRunningAnimation(page), { timeout: 2000 }).toBe(false);
    await expect(shade).toHaveCount(0);

    await clearAnimationCalls(page);
    await page.locator('app-button > ion-header ion-back-button').click();
    await expect.poll(() => hasRunningAnimation(page), { timeout: 2000 }).toBe(true);
    await checkDimming(true);
    await expect(page).toHaveURL('/main/index');
    await expect.poll(() => hasRunningAnimation(page), { timeout: 2000 }).toBe(false);
    await expect(shade).toHaveCount(0);
  });

  test('runs and completes the iOS popover animations', async ({ page }) => {
    await page.goto('/main/index/popover', { waitUntil: 'networkidle' });
    await clearAnimationCalls(page);

    await page.locator('#click-trigger-left').click();

    await expect.poll(() => hasRunningAnimation(page, 'popover-content'), { timeout: 2000 }).toBe(true);
    const popover = page.locator('ion-popover:not(.overlay-hidden)');
    await expect(popover).toBeVisible();
    await expect.poll(() => hasRunningAnimation(page, 'popover-content'), { timeout: 2000 }).toBe(false);

    await clearAnimationCalls(page);
    await page.keyboard.press('Escape');

    await expect.poll(() => hasAnimationCall(page, 'popover-content'), { timeout: 2000 }).toBe(true);
    await expect(popover).toBeHidden();
    await expect.poll(() => hasRunningAnimation(page, 'popover-content'), { timeout: 2000 }).toBe(false);
  });
});
