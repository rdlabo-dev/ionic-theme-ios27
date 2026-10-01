import { expect, test } from '@playwright/test';

for (const { edge, offset, scale } of [
  { edge: 'left', offset: false, scale: 1 },
  { edge: 'right', offset: false, scale: 1 },
  { edge: 'right', offset: true, scale: 1 },
  { edge: 'right', offset: true, scale: 0.8 },
]) {
  for (const reference of ['trigger', 'event']) {
    test(`popover uses its ${edge} rail action with ${reference} positioning${offset ? ' in an offset pane' : ''}${scale !== 1 ? ' with scale' : ''}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 700, height: 900 });
      await page.goto('/main/index/popover');
      const popover = page.locator('ion-popover[trigger="click-trigger-right-buttons"]');
      await popover.waitFor({ state: 'attached' });
      if (offset) {
        await page.locator('app-popover').evaluate((element: HTMLElement) => {
          element.style.left = '160px';
          element.style.top = '40px';
        });
      }
      if (scale !== 1) {
        await page.locator('app-popover').evaluate((element: HTMLElement, value) => {
          element.style.transformOrigin = '0 0';
          element.style.transform = `scale(${value})`;
        }, scale);
      }
      await popover.evaluate((element: HTMLIonPopoverElement, value) => (element.reference = value), reference as 'trigger' | 'event');
      await page.locator('ion-app').evaluate((element, value) => {
        // Exercise safe-area handling as well as the ordinary zero-inset browser case.
        element.ownerDocument.documentElement.style.setProperty('--ion-safe-area-right', '56px');
        element.classList.add('ios-theme-vertical-bars');
        element.classList.toggle('ios-theme-vertical-bars-left', value === 'left');
      }, edge);
      const action = page.locator('ion-app > ion-button.ios-theme-vertical-bars-toolbar-projection');
      await expect(action).toBeVisible();
      const anchor = (await action.boundingBox())!;
      await action.click();
      await expect(popover).toBeVisible();
      await expect(popover.getByText('Hello World!')).toBeVisible();
      await expect(popover.locator('[part~="content"]')).toHaveCSS('opacity', '1');
      await expect
        .poll(() =>
          popover.evaluate((element) => {
            const content = element.shadowRoot!.querySelector<HTMLElement>('[part~="content"]')!.getBoundingClientRect();
            const surface = element.shadowRoot!.querySelector<HTMLElement>('[part~="callout-glass"]')!.getBoundingClientRect();
            return Math.abs(content.x - (surface.x + 32));
          }),
        )
        .toBeLessThan(2);
      const content = await popover.evaluate((element) =>
        element.shadowRoot!.querySelector<HTMLElement>('[part~="content"]')!.getBoundingClientRect().toJSON(),
      );
      expect(Math.abs(content.y + content.height / 2 - anchor.y - anchor.height / 2)).toBeLessThan(1);
      // A scaled pane can clamp the surface inward; its animation must still originate at the rail action.
      await expect
        .poll(() =>
          popover.evaluate((element, anchor) => {
            const content = element.shadowRoot!.querySelector<HTMLElement>('[part~="content"]')!;
            const [x, y] = getComputedStyle(content).transformOrigin.split(' ').map(parseFloat);
            const bounds = content.getBoundingClientRect();
            return Math.max(Math.abs(bounds.x + x - anchor.x - anchor.width / 2), Math.abs(bounds.y + y - anchor.y - anchor.height / 2));
          }, anchor),
        )
        .toBeLessThan(1);
      if (edge === 'right')
        expect(content.x + content.width).toBeLessThanOrEqual(anchor.x + (reference === 'event' ? anchor.width / 2 : 0) + 1);
      else expect(content.x).toBeGreaterThanOrEqual(anchor.x + (reference === 'event' ? anchor.width / 2 : anchor.width) - 1);
      await popover.evaluate((element: HTMLIonPopoverElement) => element.dismiss());
      await expect(action).toBeVisible();
    });
  }
}

test('a projected action respects source disabled state before its clone resynchronizes', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index/popover');
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  await expect(page.locator('ion-app > ion-button.ios-theme-vertical-bars-toolbar-projection')).toBeVisible();
  const counts = await page.locator('#click-trigger-right-buttons ion-button').evaluate((source: HTMLIonButtonElement) => {
    let clicks = 0;
    source.addEventListener('click', () => clicks++);
    const clone = document.querySelector<HTMLElement>('ion-app > ion-button.ios-theme-vertical-bars-toolbar-projection')!;
    source.disabled = true;
    clone.click();
    const hostDisabled = clicks;
    source.disabled = false;
    const native = source.shadowRoot!.querySelector<HTMLButtonElement>('[part~="native"]')!;
    native.disabled = true;
    clone.click();
    const nativeDisabled = clicks;
    native.disabled = false;
    clone.click();
    return [hostDisabled, nativeDisabled, clicks];
  });
  expect(counts).toEqual([0, 0, 1]);
});
