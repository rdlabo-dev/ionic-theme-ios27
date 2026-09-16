import { expect, test } from '@playwright/test';

for (const direction of ['ltr', 'rtl']) {
  for (const slot of ['top', 'bottom']) {
    for (const count of [1, 2, 3, 4, 5] as const) {
      test(`${direction} ${slot} ${count} tabs support all positions without shifting the press origin`, async ({ page }) => {
        await page.setViewportSize({ width: 800, height: 900 });
        await page.goto('/main/index');
        await page.evaluate(
          ({ direction, slot, count }) => {
            const fixture = document.createElement('div');
            fixture.style.cssText = 'position:fixed;inset:0;z-index:99999;--ion-safe-area-left:20px;--ion-safe-area-right:8px';
            fixture.dir = direction;
            const bar = document.createElement('ion-tab-bar');
            bar.id = 'position-probe';
            bar.mode = 'ios';
            bar.slot = slot;
            for (let i = 0; i < count; i++) {
              const button = document.createElement('ion-tab-button');
              button.mode = 'ios';
              button.textContent = `Tab ${i + 1}`;
              bar.append(button);
            }
            fixture.append(bar);
            document.body.append(fixture);
          },
          { direction, slot, count },
        );
        const bar = page.locator('#position-probe');
        await expect(bar).toHaveClass(/hydrated/);
        for (const position of ['start', 'center', 'end']) {
          await bar.evaluate((element, position) => {
            element.classList.remove('tab-bar-position-start', 'tab-bar-position-center', 'tab-bar-position-end');
            element.classList.add(`tab-bar-position-${position}`);
          }, position);
          const normal = (await bar.boundingBox())!;
          const nativeWidth = { 1: 102, 2: 188, 3: 274, 4: 336, 5: 414 }[count]!;
          expect(normal.width).toBeCloseTo(nativeWidth, 1);
          if (position === 'center') {
            expect(normal.x + normal.width / 2).toBeCloseTo(406, 1);
          } else if ((position === 'start') === (direction === 'ltr')) {
            expect(normal.x).toBeCloseTo(41, 1);
          } else {
            expect(normal.x + normal.width).toBeCloseTo(771, 1);
          }
          await bar
            .locator('ion-tab-button')
            .first()
            .evaluate((button) => button.classList.add('ion-activated'));
          await expect
            .poll(() => bar.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a))
            .toBeCloseTo(1.038, 3);
          const pressed = (await bar.boundingBox())!;
          expect(pressed.x + pressed.width / 2).toBeCloseTo(normal.x + normal.width / 2, 1);
          await bar
            .locator('ion-tab-button')
            .first()
            .evaluate((button) => button.classList.remove('ion-activated'));
          await expect.poll(() => bar.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(normal.width, 1);
        }
      });
    }
  }
}
