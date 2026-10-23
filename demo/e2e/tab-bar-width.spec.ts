import { expect, test } from '@playwright/test';
import { compile } from 'sass';
import { resolve } from 'node:path';

const css =
  compile(resolve(__dirname, '../../packages/theme-ios27/src/styles/components/ion-tabs.scss')).css +
  compile(resolve(__dirname, '../../packages/theme-ios27/src/styles/vertical-bars.scss')).css;

// iPhone / iOS 27 measurements: short two/three-tab platters are 188/274pt;
// four tabs fill the available phone width. Long labels can expand compact bars.
for (const [viewport, three, four] of [
  [320, 217, 217],
  [402, 274, 299],
  [440, 274, 337],
  [768, 274, 336],
]) {
  test(`tab widths adapt to content within ${viewport}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport, height: 900 });
    // Exercise the iOS 27 theme even when the test WebKit lacks its capability
    // marker; the demo otherwise deliberately serves the separate iOS 26 theme.
    await page.route('**/styles.css', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replaceAll('overflow-anchor: auto', 'display: block') });
    });
    await page.goto('/main/index');
    await page.addStyleTag({ content: css });
    const bar = page.locator('#tab-bar-bottom');
    await expect(bar).toBeVisible();
    const setLabels = async (labels: string[]) => {
      await bar.evaluate((element, labels) => {
        // Construct fresh Ionic elements: cloning hydrated labels duplicates their text.
        element.replaceChildren(
          ...labels.map((text, index) => {
            const button = document.createElement('ion-tab-button');
            button.mode = 'ios';
            button.tab = `width-${index}`;
            button.innerHTML = '<ion-icon name="documents"></ion-icon>';
            const label = document.createElement('ion-label');
            label.textContent = text;
            button.append(label);
            return button;
          }),
        );
      }, labels);
      await expect(bar.locator('ion-tab-button:not(.ion-cloned-element):not(.hydrated)')).toHaveCount(0);
    };
    const width = () => bar.evaluate((element) => element.getBoundingClientRect().width);
    await setLabels(['Index', 'Docs', 'Library', 'Settings']);
    await expect.poll(width).toBeCloseTo(four, 0);
    await setLabels(['Index', 'Docs']);
    await expect.poll(width).toBeCloseTo(188, 0);
    await setLabels(['Index', 'Docs', 'Library']);
    await expect.poll(width).toBeCloseTo(three, 0);
    await setLabels(['Reservations', 'Customers', 'Settings']);
    const long = await width();
    // System fonts differ between macOS and Linux CI. Check content-driven
    // expansion and viewport bounds; native pixel targets are tested on iOS.
    if (viewport === 320) expect(long).toBeCloseTo(three, 0);
    else expect(long).toBeGreaterThan(three);
    expect(long).toBeLessThanOrEqual(viewport - 103);
    const itemWidths = await bar
      .locator('ion-tab-button:not(.ion-cloned-element)')
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));
    expect(Math.max(...itemWidths) - Math.min(...itemWidths)).toBeLessThan(0.1);
    await page.locator('html').evaluate((html) => html.setAttribute('dir', 'rtl'));
    await expect.poll(width).toBeCloseTo(long, 0);
    await setLabels(['Reservations and customer management '.repeat(4), 'Docs', 'Library']);
    await expect.poll(width).toBeCloseTo(viewport - 103, 0);
    await setLabels(['Index', 'Docs', 'Library']);
    await expect.poll(width).toBeCloseTo(three, 0);
    await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    await expect.poll(width).toBeCloseTo(48, 0);
    const rail = await bar.boundingBox();
    const railItems = await bar
      .locator('ion-tab-button:not(.ion-cloned-element)')
      .evaluateAll((items) => items.map((item) => ({ x: item.getBoundingClientRect().x, width: item.getBoundingClientRect().width })));
    for (const item of railItems) {
      expect(item.x).toBeCloseTo(rail!.x + 2, 0);
      expect(item.width).toBeCloseTo(44, 0);
    }
    await page.locator('ion-app').evaluate((app) => app.classList.remove('ios-theme-vertical-bars'));
    await expect.poll(width).toBeCloseTo(three, 0);
  });
}

test('compact tabs retain their measured width beside a visible split-pane menu', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 720 });
  await page.goto('/main/index/tabs');
  await page.addStyleTag({
    content: css + compile(resolve(__dirname, '../../packages/theme-ios27/src/styles/components/ion-menu.scss')).css,
  });
  await expect(page.locator('ion-split-pane')).toHaveClass(/split-pane-visible/);
  const bars = page.locator('app-tabs ion-tab-bar');
  for (const [index, width] of [274, 336, 414].entries()) {
    await expect.poll(() => bars.nth(index).evaluate((bar) => bar.getBoundingClientRect().width)).toBeCloseTo(width, 0);
  }
});
