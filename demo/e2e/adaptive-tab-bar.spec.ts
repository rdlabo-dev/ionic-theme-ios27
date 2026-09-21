import { expect, test } from '@playwright/test';

const addFixture = async (
  page: import('@playwright/test').Page,
  placement: 'left' | 'right',
  slot: 'top' | 'bottom',
  direction: 'ltr' | 'rtl' = 'ltr',
  count = 4,
) => {
  await page.evaluate(
    ({ placement, slot, direction, count }) => {
      document.body.style.setProperty('--ion-theme-safe-area-right', '84px');
      document.body.style.setProperty('--ion-theme-safe-area-left', '76px');

      const tabs = document.createElement('ion-tabs');
      tabs.id = 'adaptive-tabs-probe';
      tabs.dir = direction;
      tabs.className = `ionic-theme-adaptive-tabs ionic-theme-tabs-side-${placement}`;
      tabs.style.cssText =
        'position:fixed;inset:0;z-index:99999;--ion-safe-area-top:22px;--ion-safe-area-right:84px;--ion-safe-area-bottom:34px;--ion-safe-area-left:76px';

      const bar = document.createElement('ion-tab-bar');
      bar.id = 'adaptive-tab-bar';
      bar.mode = 'ios';
      bar.slot = slot;
      for (let index = 0; index < count; index++) {
        const button = document.createElement('ion-tab-button');
        button.mode = 'ios';
        button.tab = `tab-${index + 1}`;
        const label = document.createElement('ion-label');
        label.textContent = `Tab ${index + 1}`;
        button.append(label);
        button.addEventListener('click', () => button.setAttribute('data-clicked', 'true'));
        bar.append(button);
      }
      const outlet = document.createElement('ion-router-outlet');
      outlet.id = 'adaptive-tabs-content';
      tabs.append(outlet, bar);
      document.body.append(tabs);
    },
    { placement, slot, direction, count },
  );
};

test('places bottom tabs in the trailing reserved region and keeps them clickable', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index');
  await addFixture(page, 'right', 'bottom');

  const bar = page.locator('#adaptive-tab-bar');
  await expect(bar).toHaveClass(/hydrated/);
  const box = (await bar.boundingBox())!;
  const contentBox = (await page.locator('#adaptive-tabs-content').boundingBox())!;
  expect(box.width).toBeCloseTo(62, 0);
  expect(box.height).toBeCloseTo(224, 0);
  expect(box.x).toBeCloseTo(627, 0);
  expect(box.y + box.height).toBeCloseTo(858, 0);
  const buttonBoxes = await bar.locator('ion-tab-button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }),
  );
  expect(buttonBoxes).toHaveLength(4);
  for (const [index, buttonBox] of buttonBoxes.entries()) {
    expect(buttonBox.width).toBeCloseTo(54, 0);
    expect(buttonBox.height).toBeCloseTo(54, 0);
    expect(buttonBox.x).toBeCloseTo(buttonBoxes[0].x, 0);
    if (index) expect(buttonBox.y - buttonBoxes[index - 1].y).toBeCloseTo(54, 0);
  }
  expect(contentBox.x).toBeCloseTo(0, 0);
  expect(contentBox.width).toBeCloseTo(700, 0);
  const last = bar.locator('ion-tab-button').last();
  await expect(last.locator('a')).toHaveAccessibleName('Tab 4');
  await last.click();
  await expect(last).toHaveAttribute('data-clicked', 'true');
});

test('sizes the bar from its tab count without a fixed supported range', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index');
  await addFixture(page, 'right', 'top', 'ltr', 6);

  const bar = page.locator('#adaptive-tab-bar');
  const box = (await bar.boundingBox())!;
  expect(box.height).toBeCloseTo(6 * 54 + 8, 0);
  await expect(bar.locator('ion-tab-button')).toHaveCount(6);
});

test('supports top alignment and physical left placement', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index');
  await addFixture(page, 'left', 'top');

  const box = (await page.locator('#adaptive-tab-bar').boundingBox())!;
  const contentBox = (await page.locator('#adaptive-tabs-content').boundingBox())!;
  expect(box.x).toBeCloseTo(7, 0);
  expect(box.y).toBeCloseTo(30, 0);
  expect(contentBox.x).toBeCloseTo(0, 0);
  expect(contentBox.width).toBeCloseTo(700, 0);
});

test('physical side placement does not follow writing direction', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index');
  await addFixture(page, 'left', 'bottom', 'rtl');

  const box = (await page.locator('#adaptive-tab-bar').boundingBox())!;
  const contentBox = (await page.locator('#adaptive-tabs-content').boundingBox())!;
  expect(box.x).toBeCloseTo(7, 0);
  expect(contentBox.x).toBeCloseTo(0, 0);
});

test('foldable tab drag reveals icon labels in the vertical rail', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index');
  await enableFoldable(page);

  const buttons = page.locator('#tab-bar-bottom ion-tab-button');
  const selectedBox = (await buttons.first().boundingBox())!;
  const target = buttons.nth(1);
  const targetBox = (await target.boundingBox())!;
  await page.mouse.move(selectedBox.x + selectedBox.width / 2, selectedBox.y + selectedBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 4 });
  await expect.poll(() => buttons.first().evaluate((element) => element.matches(':active'))).toBe(true);

  await expect(page).toHaveScreenshot('foldable-tab-drag-labels.png', { animations: 'disabled' });
  await page.mouse.up();
});
