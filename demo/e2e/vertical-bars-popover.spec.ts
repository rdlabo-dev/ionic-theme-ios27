import { expect, test } from '@playwright/test';

for (const { edge, offset } of [
  { edge: 'left', offset: false },
  { edge: 'right', offset: false },
  { edge: 'right', offset: true },
]) {
  for (const reference of ['trigger', 'event']) {
    test(`popover uses its ${edge} rail action with ${reference} positioning${offset ? ' in an offset pane' : ''}`, async ({ page }) => {
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
      expect(content.y).toBeGreaterThan(anchor.y);
      expect(content.y).toBeLessThan(anchor.y + anchor.height + 20);
      if (edge === 'right') expect(content.x).toBeGreaterThan(400);
      else expect(content.x).toBeLessThan(100);
      await popover.evaluate((element: HTMLIonPopoverElement) => element.dismiss());
      await expect(action).toBeVisible();
    });
  }
}
