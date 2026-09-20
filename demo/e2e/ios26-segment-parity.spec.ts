import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 402, height: 874 }, hasTouch: true });

const trackIonChange = async (segment: Locator) => {
  await segment.evaluate((el) => {
    el.dataset['changes'] = '0';
    el.addEventListener('ionChange', () => {
      el.dataset['changes'] = String(Number(el.dataset['changes'] ?? '0') + 1);
    });
  });
};

test.describe('iOS26 ion-segment candidate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/main/index/segment', { waitUntil: 'networkidle' });
    const toolbar = page.locator('app-segment ion-header ion-segment').first();
    await expect(toolbar).toHaveClass(/hydrated/);
    await expect(toolbar).toHaveClass(/ios26-enable-gesture/);
  });

  test('tap changes value exactly once per direction', async ({ page }) => {
    const segment = page.locator('app-segment ion-header ion-segment').first();
    await trackIonChange(segment);
    await segment.locator('ion-segment-button[value="segment"]').tap();
    await expect.poll(async () => segment.evaluate((el) => (el as HTMLIonSegmentElement).value)).toBe('segment');
    await expect(segment).toHaveAttribute('data-changes', '1');
    await segment.locator('ion-segment-button[value="default"]').tap();
    await expect.poll(async () => segment.evaluate((el) => (el as HTMLIonSegmentElement).value)).toBe('default');
    await expect(segment).toHaveAttribute('data-changes', '2');
  });

  test('dragging keeps Ionic selection events', async ({ page }) => {
    const segment = page.locator('app-segment ion-header ion-segment').first();
    await trackIonChange(segment);
    const tabs = segment.getByRole('tab');
    const start = (await tabs.first().boundingBox())!;
    const end = (await tabs.last().boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    for (let step = 1; step <= 5; step++) {
      const x = start.x + start.width / 2 + ((end.x + end.width / 2 - start.x - start.width / 2) * step) / 5;
      await page.mouse.move(x, end.y + end.height / 2);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    }
    await page.mouse.up();
    await expect.poll(async () => segment.evaluate((el) => (el as HTMLIonSegmentElement).value)).toBe('segment');
    await expect(segment).toHaveAttribute('data-changes', '1');
    await expect(segment.locator('ion-segment-button').last()).toHaveClass(/segment-button-checked/);
  });

  test('reduced motion skips lens registration', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload({ waitUntil: 'networkidle' });
    const segment = page.locator('app-segment ion-header ion-segment').first();
    await expect(segment).toHaveClass(/hydrated/);
    await expect(segment).not.toHaveClass(/ios26-enable-gesture/);
    expect(await segment.locator('.ios26-segment-lens').count()).toBe(0);
    await segment.locator('ion-segment-button[value="segment"]').tap();
    await expect.poll(async () => segment.evaluate((el) => (el as HTMLIonSegmentElement).value)).toBe('segment');
  });

  test('destroy and re-register do not duplicate lenses', async ({ page }) => {
    const result = await page.evaluate(() => {
      const host = document.querySelector('app-segment');
      const ng = (
        window as unknown as {
          ng?: { getComponent?: (el: Element) => { registeredGestures: { destroy: () => void }[]; ionViewDidEnter: () => void } };
        }
      ).ng;
      if (!host || !ng?.getComponent) {
        return { ok: false as const, reason: 'ng.getComponent unavailable' };
      }
      const cmp = ng.getComponent(host);
      if (!cmp?.registeredGestures || !cmp.ionViewDidEnter) {
        return { ok: false as const, reason: 'segment page component unavailable' };
      }
      const count = () => host.querySelectorAll('.ios26-segment-lens').length;
      const before = count();
      cmp.registeredGestures.forEach((gesture) => gesture.destroy());
      cmp.registeredGestures.length = 0;
      const afterDestroy = count();
      cmp.ionViewDidEnter();
      const afterRegister = count();
      cmp.ionViewDidEnter();
      const afterDuplicateAttempt = count();
      cmp.registeredGestures.forEach((gesture) => gesture.destroy());
      cmp.registeredGestures.length = 0;
      cmp.ionViewDidEnter();
      const afterReregister = count();
      return {
        ok: true as const,
        before,
        afterDestroy,
        afterRegister,
        afterDuplicateAttempt,
        afterReregister,
        segments: host.querySelectorAll('ion-segment').length,
      };
    });
    expect(result.ok, 'reason' in result ? result.reason : '').toBe(true);
    if (!result.ok) return;
    expect(result.before).toBeGreaterThan(0);
    expect(result.afterDestroy).toBe(0);
    expect(result.afterRegister).toBe(result.segments);
    expect(result.afterDuplicateAttempt).toBe(result.afterRegister);
    expect(result.afterReregister).toBe(result.afterRegister);
  });

  test('stylesheet overrides apply to track and indicator', async ({ page }) => {
    await page.addStyleTag({
      content: `
        ion-segment { --background: rgb(12, 34, 56); }
        ion-segment-button { --indicator-color: rgb(210, 30, 40); --border-radius: 8px; }
      `,
    });
    const segment = page.locator('app-segment ion-header ion-segment').first();
    await expect(segment).toHaveCSS('background-color', 'rgb(12, 34, 56)');
    const tab = segment.locator('ion-segment-button').first();
    await expect(tab.locator('[part="indicator-background"]')).toHaveCSS('background-color', 'rgb(210, 30, 40)');
    await expect(tab.locator('[part="indicator-background"]')).toHaveCSS('border-radius', '8px');
  });

  test('segment color remains independent from a colored toolbar', async ({ page }) => {
    const segment = page.getByRole('tablist', { name: 'Colored segment in light toolbar', exact: true });
    const button = segment.locator('ion-segment-button').first();
    await expect(button.locator('[part="indicator-background"]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(button.locator('[part="native"]')).toHaveCSS('color', 'rgb(0, 0, 0)');

    await page.evaluate(() => document.documentElement.classList.add('ion-palette-dark'));
    await expect(button.locator('[part="indicator-background"]')).toHaveCSS('background-color', 'rgb(90, 90, 95)');
  });

  test("light toolbar keeps Ionic's segment contrast contract", async ({ page }) => {
    const segment = page.getByRole('tablist', { name: 'Uncolored segment in light toolbar' });
    const checked = segment.locator('ion-segment-button.segment-button-checked');
    const unchecked = segment.locator('ion-segment-button:not(.segment-button-checked)');

    for (const dark of [false, true]) {
      await page.evaluate((enabled) => document.documentElement.classList.toggle('ion-palette-dark', enabled), dark);
      const palette = await segment.evaluate((el) => {
        const style = getComputedStyle(el);
        const probe = document.createElement('span');
        el.append(probe);
        const resolve = (property: string) => {
          probe.style.color = style.getPropertyValue(property);
          return getComputedStyle(probe).color;
        };
        const value = { base: resolve('--ion-color-base'), contrast: resolve('--ion-color-contrast') };
        probe.remove();
        return value;
      });

      await expect(checked.locator('[part="indicator-background"]')).toHaveCSS('background-color', palette.contrast);
      await expect(checked.locator('[part="native"]')).toHaveCSS('color', palette.base);
      await expect(unchecked.locator('[part="native"]')).toHaveCSS('color', palette.contrast);

      const box = (await checked.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const lens = segment.locator('.ios26-segment-lens');
      await expect(lens).toBeVisible();
      const lensMatches = await lens.evaluate((el, expected) => {
        el.getAnimations().forEach((animation) => {
          animation.pause();
          animation.currentTime = 0;
        });
        const context = document.createElement('canvas').getContext('2d')!;
        context.fillStyle = expected;
        context.fillRect(0, 0, 1, 1);
        const expectedPixel = Array.from(context.getImageData(0, 0, 1, 1).data);
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = getComputedStyle(el).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data).every((value, index) => Math.abs(value - expectedPixel[index]) <= 1);
      }, palette.contrast);
      expect(lensMatches).toBe(true);
      await page.mouse.up();
      await lens.evaluate((el) => el.getAnimations().forEach((animation) => animation.finish()));
      await expect(lens).toBeHidden();
    }
  });

  test('colored toolbar indicator defaults remain publicly customizable', async ({ page }) => {
    const toolbar = page.locator('app-segment ion-toolbar[color="light"]').filter({
      has: page.getByRole('tablist', { name: 'Uncolored segment in light toolbar' }),
    });
    const segment = page.getByRole('tablist', { name: 'Uncolored segment in light toolbar' });
    const checked = segment.locator('ion-segment-button.segment-button-checked');
    const indicator = checked.locator('[part="indicator-background"]');
    const lens = segment.locator('.ios26-segment-lens');
    const expectPressedLensColor = async (expected: string) => {
      const box = (await checked.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect(lens).toBeVisible();
      const matches = await lens.evaluate((el, expectedColor) => {
        el.getAnimations().forEach((animation) => {
          animation.pause();
          animation.currentTime = 0;
        });
        const context = document.createElement('canvas').getContext('2d')!;
        context.fillStyle = expectedColor;
        context.fillRect(0, 0, 1, 1);
        const expectedPixel = Array.from(context.getImageData(0, 0, 1, 1).data);
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = getComputedStyle(el).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data).every((value, index) => Math.abs(value - expectedPixel[index]) <= 1);
      }, expected);
      expect(matches).toBe(true);
      await page.mouse.up();
      await lens.evaluate((el) => el.getAnimations().forEach((animation) => animation.finish()));
      await expect(lens).toBeHidden();
    };

    await toolbar.evaluate((el) => el.style.setProperty('--ion-toolbar-segment-indicator-color', 'rgb(210, 30, 40)'));
    await expect(indicator).toHaveCSS('background-color', 'rgb(210, 30, 40)');
    await expectPressedLensColor('rgb(210, 30, 40)');

    await page.addStyleTag({ content: 'ion-segment-button { --indicator-color: rgb(12, 34, 56); }' });
    await expect(indicator).toHaveCSS('background-color', 'rgb(12, 34, 56)');
    await expectPressedLensColor('rgb(12, 34, 56)');
  });
});
