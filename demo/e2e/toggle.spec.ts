import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 402, height: 874 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/main/index/toggle');
});

for (const inItem of [false, true]) {
  test(`short tap shows and releases the glass effect (${inItem ? 'item' : 'standalone'})`, async ({ page }) => {
    const toggle = page.locator(inItem ? 'ion-toggle[color="success"]' : '.section-example ion-toggle').first();
    const handle = toggle.locator('[part="handle"]');
    const track = toggle.locator('[part="track"]');
    await track.scrollIntoViewIfNeeded();
    await toggle.evaluate((element) => {
      element.dataset['changes'] = '0';
      element.addEventListener('ionChange', () => {
        element.dataset['changes'] = String(Number(element.dataset['changes']) + 1);
      });
    });
    const rect = (await track.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    // No drag and no artificial long-press delay.
    await expect(toggle).not.toHaveClass(/toggle-activated/);
    await page.mouse.up();
    await expect.poll(() => handle.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(30);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAttribute('data-changes', '1');
    await expect.poll(() => handle.evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBe(24);
    await track.tap();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toHaveAttribute('data-changes', '2');
  });
}

test('disabled toggle does not activate or change value', async ({ page }) => {
  const toggle = page.locator('.section-example ion-toggle.toggle-disabled').first();
  const track = toggle.locator('[part="track"]');
  await track.scrollIntoViewIfNeeded();
  const rect = (await track.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  const handle = (await toggle.locator('[part="handle"]').boundingBox())!;
  expect(handle.width).toBe(37);
  expect(handle.height).toBe(24);
  await page.mouse.up();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('touch tap renders the effect in both directions', async ({ page }) => {
  const toggle = page.locator('.section-example ion-toggle').first();
  const track = toggle.locator('[part="track"]');
  await track.scrollIntoViewIfNeeded();
  for (const checked of ['true', 'false']) {
    await toggle.evaluate((element) => {
      const handle = element.shadowRoot!.querySelector('[part="handle"]')!;
      element.dataset['peak'] = '1';
      const start = performance.now();
      const sample = () => {
        const scale = handle.getBoundingClientRect().height / 24;
        element.dataset['peak'] = String(Math.max(Number(element.dataset['peak']), scale));
        if (performance.now() - start < 500) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await track.tap();
    await expect(toggle).toHaveAttribute('aria-checked', checked);
    await expect.poll(() => toggle.evaluate((element) => Number(element.dataset['peak']))).toBeGreaterThan(1.1);
    await expect
      .poll(() => toggle.locator('[part="handle"]').evaluate((element) => Math.round(element.getBoundingClientRect().height)))
      .toBe(24);
  }
});

test('drag and keyboard retain Ionic value changes', async ({ page }) => {
  const toggle = page.locator('.section-example ion-toggle').first();
  const track = toggle.locator('[part="track"]');
  await track.scrollIntoViewIfNeeded();
  const rect = (await track.boundingBox())!;
  await page.mouse.move(rect.x + 10, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + 25, rect.y + rect.height / 2);
  await expect(toggle).toHaveClass(/toggle-activated/);
  await page.mouse.move(rect.x + rect.width - 5, rect.y + rect.height / 2);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.mouse.up();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(toggle).not.toHaveClass(/toggle-activated/);
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('reduced motion removes the release transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const toggle = page.locator('.section-example ion-toggle').first();
  await expect(toggle.locator('[part="handle"]')).toHaveCSS('transition-duration', '0s');
  await toggle.locator('[part="track"]').tap();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect((await toggle.locator('[part="handle"]').boundingBox())!.height).toBe(24);
});

test('native resting and held dimensions preserve the handle center', async ({ page }) => {
  const toggle = page.locator('.section-example ion-toggle').first();
  const track = toggle.locator('[part="track"]');
  const handle = toggle.locator('[part="handle"]');
  await track.scrollIntoViewIfNeeded();
  const rest = (await handle.boundingBox())!;
  const bounds = (await track.boundingBox())!;
  expect(bounds.width).toBe(63);
  expect(bounds.height).toBe(28);
  expect(rest.width).toBe(37);
  expect(rest.height).toBe(24);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  // Measure the held state, not the same width on the initial spring's way up.
  await page.waitForTimeout(400);
  await expect.poll(async () => Math.round((await handle.boundingBox())!.width)).toBe(58);
  const held = (await handle.boundingBox())!;
  expect(held.height).toBeCloseTo(38.333, 0);
  expect(held.x + held.width / 2).toBeCloseTo(rest.x + rest.width / 2, 1);
  await page.mouse.up();
  await expect.poll(async () => Math.round((await handle.boundingBox())!.width)).toBe(37);
  await expect.poll(async () => Math.round((await handle.boundingBox())!.x - rest.x)).toBe(22);
});

test('custom handle shadow remains overridable', async ({ page }) => {
  const toggle = page.locator('.section-example ion-toggle').first();
  await toggle.evaluate((element) => element.style.setProperty('--handle-box-shadow', 'none'));
  await expect(toggle.locator('[part="handle"]')).toHaveCSS('box-shadow', 'none');
});

test('public radius and handle transition remain overridable', async ({ page }) => {
  const toggle = page.locator('.section-example ion-toggle').first();
  await toggle.evaluate((element) => {
    element.style.setProperty('--border-radius', '8px');
    element.style.setProperty('--handle-transition', 'none');
  });
  await expect(toggle.locator('[part="track"]')).toHaveCSS('border-radius', '8px');
  await expect(toggle.locator('[part="handle"]')).toHaveCSS('transition-duration', '0s');
});

for (const duration of [50, 80, 100, 150, 600]) {
  test(`${duration}ms press has no second expansion before settling`, async ({ page }) => {
    const toggle = page.locator('.section-example ion-toggle').first();
    const track = toggle.locator('[part="track"]');
    await track.scrollIntoViewIfNeeded();
    for (const checked of ['true', 'false']) {
      await toggle.evaluate((element) => {
        delete element.dataset['frames'];
        const handle = element.shadowRoot!.querySelector('[part="handle"]')!;
        const frames: number[][] = [];
        const start = performance.now();
        const sample = () => {
          const { width, height } = handle.getBoundingClientRect();
          frames.push([width, height]);
          if (performance.now() - start < 1800) requestAnimationFrame(sample);
          else element.dataset['frames'] = JSON.stringify(frames);
        };
        requestAnimationFrame(sample);
      });
      const rect = (await track.boundingBox())!;
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.mouse.down();
      // Deliberately cover the gap between an instantaneous tap and a long press.
      await page.waitForTimeout(duration);
      await page.mouse.up();
      await expect(toggle).toHaveAttribute('aria-checked', checked);
      await expect(toggle).toHaveAttribute('data-frames', /\[/);
      const frames = JSON.parse((await toggle.getAttribute('data-frames'))!) as number[][];
      for (const [axis, rest] of [
        [0, 37],
        [1, 24],
      ]) {
        let peak = rest;
        let low = Infinity;
        for (const frame of frames) {
          const size = frame[axis];
          peak = Math.max(peak, size);
          if (peak - size > 1) low = Math.min(low, size);
          // Allow the native-sized final undershoot, not another enlarged lens.
          if (size > rest + 3) expect(size - low).toBeLessThanOrEqual(1);
        }
        expect(peak).toBeGreaterThan(rest + 8);
        expect(frames.at(-1)![axis]).toBeCloseTo(rest, 1);
      }
    }
  });
}

test('checked toggle uses its Ionic palette color', async ({ page }) => {
  const toggle = page.locator('.section-example ion-toggle').first();
  await toggle.evaluate((el) => {
    el.setAttribute('color', 'danger');
    (el as HTMLIonToggleElement).checked = true;
  });
  await expect(toggle).toHaveClass(/ion-color-danger/);
  const expected = await toggle.evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(el).getPropertyValue('--ion-color-base');
    el.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(toggle.locator('[part="track"]')).toHaveCSS('background-color', expected);
});

test('native handle still moves when lens CSS is unavailable', async ({ page }) => {
  const removed = await page.evaluate(() => {
    let count = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
        const rule = sheet.cssRules[i];
        if (rule instanceof CSSSupportsRule && rule.conditionText.includes('sin(') && rule.conditionText.includes('color-mix')) {
          sheet.deleteRule(i);
          count++;
        }
      }
    }
    return count;
  });
  expect(removed).toBeGreaterThan(0);
  const toggle = page.locator('.section-example ion-toggle').first();
  const track = toggle.locator('[part="track"]');
  await track.scrollIntoViewIfNeeded();
  const handle = toggle.locator('[part="handle"]');
  const before = (await handle.boundingBox())!;
  await track.tap();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await handle.boundingBox())!.x).toBeGreaterThan(before.x + 10);
  await expect(handle).toHaveCSS('height', '24px');
  await track.tap();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => (await handle.boundingBox())!.x).toBeCloseTo(before.x, 0);
});
