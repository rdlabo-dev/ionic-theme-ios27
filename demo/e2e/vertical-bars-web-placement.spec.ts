import { expect, test } from '@playwright/test';

for (const edge of ['right', 'left'] as const) {
  test(`Web-only ${edge} rail keeps the Duo toolbar layout behind a sheet`, async ({ page }) => {
    await page.setViewportSize({ width: 466, height: 678 });
    await page.goto('/main/index/button');
    await page.locator('app-button > ion-header').evaluate((header) => {
      header.innerHTML = `<ion-toolbar mode="ios"><ion-buttons slot="end">
        <ion-button mode="ios" fill="clear" aria-label="Search"><ion-icon slot="icon-only" name="search"></ion-icon></ion-button>
        <ion-button mode="ios" fill="clear" aria-label="Menu"><ion-icon slot="icon-only" name="ellipsis-horizontal"></ion-icon></ion-button>
      </ion-buttons><ion-buttons slot="end">
        <ion-button mode="ios" fill="clear" aria-label="Walk in"><ion-icon slot="icon-only" name="glasses"></ion-icon></ion-button>
      </ion-buttons></ion-toolbar>`;
    });
    await page.locator('app-button ion-back-button').evaluateAll((buttons) => buttons.forEach((button) => button.remove()));
    await page.locator('ion-app').evaluate((app, edge) => {
      app.classList.add('ios-theme-vertical-bars');
      app.classList.toggle('ios-theme-vertical-bars-left', edge === 'left');
    }, edge);
    const projections = page.locator('ion-app > .ios-theme-vertical-bars-toolbar-projection');
    await expect(projections).toHaveCount(2);
    const boxes = async () =>
      projections.evaluateAll((elements) =>
        elements.flatMap((element) =>
          (element.matches('ion-buttons') ? [...element.children] : [element]).map((button) => {
            const r = button.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          }),
        ),
      );
    const x = edge === 'right' ? 394 : 24;
    const expected = [170, 222, 282].map((y) => ({ x, y, width: 48, height: 48 }));
    await expect.poll(boxes).toEqual(expected);
    await page.evaluate(async () => {
      customElements.define(
        'rail-test-sheet',
        class extends HTMLElement {
          connectedCallback() {
            this.innerHTML = '<ion-content>Sheet</ion-content>';
          }
        },
      );
      const modal = document.createElement('ion-modal');
      modal.component = 'rail-test-sheet';
      modal.breakpoints = [0, 0.4, 1];
      modal.initialBreakpoint = 0.4;
      document.querySelector('ion-app')!.append(modal);
      await modal.present();
    });
    await expect.poll(boxes).toEqual(expected);
    await expect(projections.first()).toHaveAttribute('inert', '');
    await page.evaluate(async () => document.querySelector('ion-modal')!.dismiss());
    await expect.poll(boxes).toEqual(expected);
  });
}
