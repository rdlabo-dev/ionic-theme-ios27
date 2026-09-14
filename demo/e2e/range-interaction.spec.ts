import { expect, test } from '@playwright/test';

for (const direction of ['ltr', 'rtl']) {
  for (const endpoint of [0, 100]) {
    test(`dual thumbs remain within their resting width at ${endpoint} in ${direction}`, async ({ page }) => {
      await page.goto('/main/index/range');
      await page.evaluate(() => {
        const el = document.createElement('ion-range');
        el.id = 'range-probe';
        el.style.cssText = 'position:fixed;top:250px;left:100px;width:300px;z-index:9999';
        document.body.append(el);
      });
      const range = page.locator('#range-probe');
      await expect(range).toHaveClass(/hydrated/);
      await range.evaluate(
        (el: any, { direction, endpoint }) => {
          el.dir = direction;
          el.min = 0;
          el.max = 100;
          el.dualKnobs = true;
          el.value = endpoint === 0 ? { lower: 0, upper: 10 } : { lower: 90, upper: 100 };
        },
        { direction, endpoint },
      );
      const knob = range.locator(endpoint === 0 ? '[part~="knob-b"]' : '[part~="knob-a"]');
      await expect(knob).toBeVisible();
      await expect(range.getByRole('slider').nth(endpoint === 0 ? 1 : 0)).toHaveAttribute('aria-valuenow', endpoint === 0 ? '10' : '90');
      const initial = (await knob.boundingBox())!;
      const track = (await range.locator('[part="bar"]').boundingBox())!;
      const endX = (endpoint === 0) === (direction === 'ltr') ? track.x : track.x + track.width;
      await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
      await page.mouse.down();
      await page.mouse.move(endX, initial.y + initial.height / 2, { steps: 8 });
      await expect(range).toHaveClass(/range-pressed/);
      await expect.poll(() => knob.evaluate((el) => el.getBoundingClientRect().width)).toBeCloseTo(initial.width, 1);
      await expect.poll(() => range.evaluate((el: any) => el.value)).toEqual({ lower: endpoint, upper: endpoint });
      await page.mouse.up();
    });
  }
  test(`activeBarStart never shows a reflection on the wrong side in ${direction}`, async ({ page }) => {
    await page.goto('/main/index/range');
    await page.evaluate(() => {
      const el = document.createElement('ion-range');
      el.id = 'range-probe';
      el.style.cssText = 'position:fixed;top:250px;left:100px;width:300px;z-index:9999';
      document.body.append(el);
    });
    const range = page.locator('#range-probe');
    await expect(range).toHaveClass(/hydrated/);
    await range.evaluate((el: any, direction) => {
      el.dir = direction;
      el.min = 0;
      el.max = 100;
      el.dualKnobs = false;
      el.activeBarStart = 80;
      el.value = 20;
    }, direction);
    const knob = range.locator('[part~="knob"]');
    await expect(range.getByRole('slider')).toHaveAttribute('aria-valuenow', '20');
    const box = (await knob.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 4 });
    await expect(range).toHaveClass(/range-pressed/);
    expect(await knob.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('none');
    await page.mouse.up();
  });
}
