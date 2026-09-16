import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 402, height: 874 } });

for (const [length, scrollTop] of [
  ['short', 0],
  ['long', 0],
  ['long', 24],
  ['long', 100],
] as const) {
  test(`push preserves title geometry and pop restores scroll (${length}, ${scrollTop})`, async ({ page }) => {
    await page.goto('/main/index');
    const source = page.locator('index-page');
    const content = source.locator('ion-content');
    const title = content.locator('ion-title.title-large');
    await expect(title).toBeAttached();
    await content.evaluate(
      async (el, { length, scrollTop }) => {
        if (length === 'short') {
          el.querySelectorAll('ion-item').forEach((item) => {
            if (item.textContent?.trim() !== 'button') item.remove();
          });
          el.querySelectorAll('ion-list').forEach((list) => {
            if (!list.querySelector('ion-item')) list.remove();
          });
        }
        await (el as HTMLIonContentElement).scrollToPoint(0, scrollTop, 0);
      },
      { length, scrollTop },
    );
    await expect
      .poll(() => content.evaluate(async (el) => (await (el as HTMLIonContentElement).getScrollElement()).scrollTop))
      .toBe(scrollTop);
    const before = (await title.boundingBox())!;
    // Pause the actual routed transition, rather than testing a copy of its keyframes.
    await source.evaluate((el) => {
      const content = el.querySelector('ion-content')!;
      el.addEventListener(
        'ionViewWillLeave',
        () => {
          const hold = () => {
            const animations = document.getAnimations();
            if (!animations.some((animation) => (animation.effect as KeyframeEffect).target === el)) {
              requestAnimationFrame(hold);
              return;
            }
            animations.forEach((animation) => {
              animation.pause();
              animation.currentTime = Number(animation.effect!.getTiming().duration) * 0.15;
            });
            content.dataset['motionHeld'] = 'true';
          };
          requestAnimationFrame(hold);
        },
        { once: true },
      );
    });
    await source
      .locator('ion-item')
      .filter({ has: page.getByText('button', { exact: true }) })
      .click();
    await expect(content).toHaveAttribute('data-motion-held', 'true');
    const during = (await title.boundingBox())!;
    expect(during.x).toBeLessThan(before.x);
    expect(during.y).toBeCloseTo(before.y, 1);
    expect(during.height).toBeCloseTo(before.height, 1);
    await expect(title).toHaveCSS('opacity', '1');
    await expect(source).toHaveCSS('opacity', '1');
    await expect(page.locator('ion-title.ion-cloned-element')).toBeHidden();
    const shade = page.locator('.ios-transition-shade');
    const shadeBounds = (await shade.boundingBox())!;
    const topBounds = (await page.locator('app-button').boundingBox())!;
    expect(shadeBounds.y).toBeCloseTo(topBounds.y, 1);
    expect(shadeBounds.height).toBeCloseTo(topBounds.height, 1);
    expect(shadeBounds.x).toBe(0);
    expect(await shade.evaluate((el) => el.nextElementSibling?.matches('app-button'))).toBe(true);
    const dimming = await shade.evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(dimming).toBeGreaterThan(0);
    expect(dimming).toBeLessThan(1);
    for (const view of [source, page.locator('app-button')]) {
      const header = view.locator(':scope > ion-header');
      expect((await header.boundingBox())!.x).toBeCloseTo((await view.locator(':scope > ion-content').boundingBox())!.x, 1);
      expect(await header.evaluate((el) => getComputedStyle(el, '::after').content)).not.toBe('none');
      await expect(view.locator(':scope > ion-content .transition-effect')).toBeHidden();
    }
    await page.evaluate(() => document.getAnimations().forEach((animation) => animation.play()));
    await expect(source).toHaveClass(/ion-page-hidden/);
    await expect(shade).toHaveCount(0);
    expect(await page.locator('app-button').evaluate((el) => (el as HTMLElement).style.clipPath)).toBe('');
    await expect(page.locator('ion-back-button.ion-cloned-element')).toBeHidden();
    await page.locator('app-button > ion-header ion-back-button').click();
    await expect(source).not.toHaveClass(/ion-page-hidden/);
    await expect.poll(async () => (await title.boundingBox())!.x).toBeCloseTo(before.x, 1);
    await expect
      .poll(() => content.evaluate(async (el) => (await (el as HTMLIonContentElement).getScrollElement()).scrollTop))
      .toBe(scrollTop);
    expect((await title.boundingBox())!.y).toBeCloseTo(before.y, 1);
    await expect(shade).toHaveCount(0);
    await expect(page.locator('ion-back-button.ion-cloned-element')).toBeHidden();
    expect(await source.evaluate((el) => (el as HTMLElement).style.boxShadow)).toBe('');
  });
}
