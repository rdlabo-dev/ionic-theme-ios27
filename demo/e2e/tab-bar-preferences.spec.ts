import { expect, test } from '@playwright/test';
import { compile } from 'sass';
import { resolve } from 'node:path';

test.use({ viewport: { width: 402, height: 874 }, hasTouch: true });

for (const theme of ['light', 'class', 'system', 'always']) {
  test(`tab selection color fallbacks in ${theme} mode`, async ({ page }) => {
    const styles = resolve(__dirname, '../../src/styles');
    const css = compile(`${styles}/default-variables.scss`).css + compile(`${styles}/ionic-theme-ios27.scss`).css;
    const darkCss = theme === 'light' ? '' : compile(`${styles}/ionic-theme-ios27-dark-${theme}.scss`).css;
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    const html = `
      <html class="${theme === 'class' ? 'ion-palette-dark' : ''}"><body>
        <ion-tab-bar class="ios"><ion-tab-button class="ios tab-selected"></ion-tab-button></ion-tab-bar>
      </body></html>`;
    await page.goto(`data:text/html,${encodeURIComponent(html)}`);
    await page.addStyleTag({ content: css + darkCss });
    const samples = await page.evaluate(() => {
      const tab = document.querySelector<HTMLElement>('ion-tab-button')!;
      tab.attachShadow({ mode: 'open' }).innerHTML = '<div part="native">Tab</div>';
      const read = () => getComputedStyle(tab.shadowRoot!.firstElementChild!).backgroundColor;
      const defaults = read();
      const colors: string[] = [];
      // Overrides must work through inheritance as well as on the component itself.
      for (const scope of [document.documentElement, tab.parentElement!, tab]) {
        scope.style.setProperty('--ios26-button-color-selected-rgb', '12, 34, 56');
        colors.push(read());
        scope.style.setProperty('--ios-theme-button-color-selected-rgb', '65, 43, 21');
        colors.push(read());
        scope.style.removeProperty('--ios26-button-color-selected-rgb');
        colors.push(read());
        scope.style.removeProperty('--ios-theme-button-color-selected-rgb');
      }
      return { defaults, colors, restored: read() };
    });
    const expectColor = (color: string, rgb: number[]) => {
      const channels = color.match(/[\d.]+/g)!.map(Number);
      expect(channels.slice(0, 3)).toEqual(rgb);
      // Browsers can quantize alpha to 8 bits when serializing computed colors.
      expect(Math.abs(channels[3] - (theme === 'light' ? 0.095 : 0.72))).toBeLessThan(1 / 255);
    };
    expectColor(samples.defaults, theme === 'light' ? [16, 16, 16] : [0, 0, 0]);
    expect(samples.restored).toBe(samples.defaults);
    samples.colors.forEach((color, index) => expectColor(color, index % 3 === 0 ? [12, 34, 56] : [65, 43, 21]));
  });
}

test('reduced motion preserves pointer and keyboard tab selection without scaling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/main/index');
  const bar = page.locator('ion-tab-bar');
  const buttons = bar.locator('ion-tab-button');
  await expect(buttons.first()).toHaveClass(/tab-selected/);
  await expect(bar).not.toHaveClass(/ios27-enable-gesture/);
  await expect(page.locator('body > ion-tab-button.ion-cloned-element')).toHaveCount(0);
  // Exercise the CSS activation state too: Ionic still provides press feedback.
  await buttons.nth(1).evaluate((el) => el.classList.add('ion-activated'));
  await expect(bar).toHaveCSS('transform', 'none');
  await expect(bar).toHaveCSS('transition-duration', '0s');
  await expect(buttons.nth(1)).toHaveCSS('transform', 'none');
  await buttons.nth(1).evaluate((el) => el.classList.remove('ion-activated'));
  await buttons.nth(1).click();
  await expect(buttons.nth(1)).toHaveClass(/tab-selected/);
  await buttons.nth(2).locator('[part="native"]').focus();
  await page.keyboard.press('Enter');
  await expect(buttons.nth(2)).toHaveClass(/tab-selected/);
  await expect(page.locator('body > ion-tab-button.ion-cloned-element')).toHaveCount(0);
});

for (const phase of ['press', 'release']) {
  test(`enabling reduced motion cancels the tab ${phase} and can re-enable the effect`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/main/index');
    const bar = page.locator('ion-tab-bar');
    const buttons = bar.locator('ion-tab-button');
    const lens = page.locator('body > ion-tab-button.ion-cloned-element');
    await expect(bar).toHaveClass(/ios27-enable-gesture/);
    await buttons.nth(1).hover();
    await page.mouse.down();
    await expect(lens).toBeVisible();
    if (phase === 'release') {
      await page.waitForTimeout(250);
      await page.mouse.up();
      await expect(buttons.nth(1)).toHaveClass(/tab-selected/);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(lens).toHaveCount(0);
    await expect(bar).not.toHaveClass(/ios27-enable-gesture|ios27-animated/);
    await expect(bar.locator('.ion-activated')).toHaveCount(0);
    await expect(bar.locator('.tab-selected')).toHaveCount(1);
    await expect(buttons.nth(phase === 'press' ? 0 : 1)).toHaveClass(/tab-selected/);
    await expect(bar).toHaveCSS('transform', 'none');
    if (phase === 'press') await page.mouse.up();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(bar).toHaveClass(/ios27-enable-gesture/);
    await expect(lens).toHaveCount(1);
    await buttons.nth(2).hover();
    await page.mouse.down();
    // Wait past the cancelled release to catch stale callbacks clearing the new gesture.
    await page.waitForTimeout(500);
    await expect(lens).toBeVisible();
    await expect(bar).toHaveClass(/ios27-animated/);
    await page.mouse.up();
    await expect(buttons.nth(2)).toHaveClass(/tab-selected/);
    await expect(lens).toBeHidden();
  });
}

test('an initially reduced tab bar enables its effect when the preference changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/main/index');
  const bar = page.locator('ion-tab-bar');
  await expect(bar.locator('ion-tab-button').first()).toHaveClass(/tab-selected/);
  await expect(page.locator('body > ion-tab-button.ion-cloned-element')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(bar).toHaveClass(/ios27-enable-gesture/);
  await expect(page.locator('body > ion-tab-button.ion-cloned-element')).toHaveCount(1);
});
