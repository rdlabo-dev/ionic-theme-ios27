import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 402, height: 874 }, hasTouch: true });

test('dark selection preserves custom colors and only darkens navigation segments', async ({ page }) => {
  await page.goto('/main/index/segment');
  await expect(page.locator('ion-tab-bar')).toHaveClass(/ios27-enable-gesture/);
  await expect(page.locator('ion-tab-bar ion-tab-button').first()).toHaveClass(/tab-selected/);
  await page.evaluate(() => {
    document.documentElement.classList.add('ion-palette-dark');
    const tab = document.querySelector<HTMLElement>('ion-tab-button')!;
    tab.style.setProperty('--ios-theme-button-color-selected-rgb', '12, 34, 56');
    const fixture = document.createElement('div');
    fixture.id = 'selection-fixture';
    fixture.innerHTML = `
      <ion-segment class="ios in-toolbar"><ion-segment-button class="ios" value="default">Default</ion-segment-button></ion-segment>
      <ion-segment class="ios"><ion-segment-button class="ios" value="content">Content</ion-segment-button></ion-segment>
      <ion-segment class="ios in-toolbar"><ion-segment-button class="ios" value="custom" style="--indicator-color: rgb(12, 34, 56)">Custom</ion-segment-button></ion-segment>
      <ion-segment class="ios in-toolbar ion-color"><ion-segment-button class="ios" value="colored">Colored</ion-segment-button></ion-segment>`;
    document.body.append(fixture);
  });
  await expect(page.locator('#selection-fixture [part="indicator-background"]')).toHaveCount(4);
  const colors = await page.evaluate(() => {
    const tab = document.querySelector('ion-tab-button')!;
    return {
      tab: getComputedStyle(tab.shadowRoot!.querySelector('[part="native"]')!).backgroundColor,
      segments: [...document.querySelectorAll('#selection-fixture ion-segment-button')].map(
        (el) => getComputedStyle(el.shadowRoot!.querySelector('[part="indicator-background"]')!).backgroundColor,
      ),
    };
  });
  expect(colors.tab).toBe('rgba(12, 34, 56, 0.72)');
  expect(colors.segments[0]).toBe('rgba(0, 0, 0, 0.72)');
  expect(colors.segments[1]).not.toBe(colors.segments[0]);
  expect(colors.segments[2]).toBe('rgb(12, 34, 56)');
  expect(colors.segments[3]).not.toBe(colors.segments[0]);
  await expect(page.locator('body > ion-tab-button.ion-cloned-element [part="native"]')).toHaveCSS('background-image', 'none');
  for (const lens of [
    page.locator('body > ion-tab-button.ion-cloned-element [part="native"]'),
    page.locator('app-segment ion-segment').first().locator('.ios27-segment-edge'),
  ]) {
    await expect(lens).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const shadow = await lens.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toContain('rgba(0, 0, 0,');
    expect(shadow).not.toContain('255, 255, 255');
  }
});

test('dark short-tap glass hands off during the final 200ms of motion', async ({ page }) => {
  await page.goto('/main/index');
  await page.evaluate(() => document.documentElement.classList.add('ion-palette-dark'));
  const bar = page.locator('ion-tab-bar');
  await expect(bar).toHaveClass(/ios27-enable-gesture/);
  const button = bar.locator('ion-tab-button').nth(1);
  await button.hover();
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.up();
  const samples = await button.evaluate((el) => {
    const native = el.shadowRoot!.querySelector('[part="native"]')!;
    const lens = document.querySelector('body > ion-tab-button.ion-cloned-element')!;
    const animations = [...lens.getAnimations(), ...native.getAnimations()];
    animations.forEach((a) => a.pause());
    const duration = Number(
      lens
        .getAnimations()
        .find((a) => Number(a.effect?.getTiming().duration) > 600)!
        .effect!.getTiming().duration,
    );
    return [300, duration - 200, duration - 100, duration - 1].map((time) => {
      animations.forEach((a) => (a.currentTime = time));
      return { opacity: Number(getComputedStyle(lens).opacity), color: getComputedStyle(native).backgroundColor };
    });
  });
  expect(samples[0].opacity).toBeCloseTo(1);
  expect(samples[0].color).toBe('rgba(0, 0, 0, 0)');
  expect(samples[1].opacity).toBeCloseTo(1);
  expect(samples[2].opacity).toBeCloseTo(0.5);
  expect(samples[2].color).toBe('rgba(0, 0, 0, 0.36)');
  expect(samples[3].opacity).toBeLessThan(0.01);
});

for (const count of [2, 4]) {
  test(`a short tap keeps the ${count}-tab platter expanding after release`, async ({ page }) => {
    await page.goto('/main/index');
    const bar = page.locator('ion-tab-bar');
    await expect(bar).toHaveClass(/ios27-enable-gesture/);
    if (count === 2) await bar.evaluate((el) => [...el.children].slice(2).forEach((child) => child.remove()));
    const rest = (await bar.boundingBox())!;
    const button = (await bar.locator('ion-tab-button').nth(1).boundingBox())!;
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.up();
    const samples = await bar.evaluate((el) => {
      const animation = el.getAnimations().find((a) => Number(a.effect?.getTiming().duration) > 600)!;
      animation.pause();
      return [0, 50, 283, 417, 17, 34, 67, 83, 100].map((time) => {
        animation.currentTime = time;
        const box = el.getBoundingClientRect();
        return { width: box.width, height: box.height };
      });
    });
    expect(samples[1].width).toBeGreaterThan(samples[0].width);
    expect(samples[1].width - rest.width).toBeCloseTo(8.65, 1);
    expect(samples[1].height / rest.height).toBeCloseTo(samples[1].width / rest.width, 4);
    expect(samples[2].width - rest.width).toBeCloseTo(-0.82, 1);
    expect(samples[3].width).toBeCloseTo(rest.width, 1);
    // Decelerate into the peak, then accelerate out instead of a linear cusp.
    const expanding = [samples[0], samples[4], samples[5], samples[1]].map((sample) => sample.width);
    expect((expanding[1] - expanding[0]) / 17).toBeGreaterThan((expanding[2] - expanding[1]) / 17);
    expect((expanding[2] - expanding[1]) / 17).toBeGreaterThan((expanding[3] - expanding[2]) / 16);
    expect(samples[6].width - rest.width).toBeCloseTo(8.46, 1);
    expect(samples[7].width - rest.width).toBeCloseTo(7.73, 1);
    expect(samples[8].width - rest.width).toBeCloseTo(6.66, 1);
    expect((samples[1].width - samples[6].width) / 17).toBeLessThan((samples[6].width - samples[7].width) / 16);
  });
}

for (const distance of [1, 3]) {
  test(`short transfer across ${distance} tabs uses tap dimensions`, async ({ page }) => {
    await page.goto('/main/index');
    const bar = page.locator('ion-tab-bar');
    await expect(bar).toHaveClass(/ios27-enable-gesture/);
    const button = bar.locator('ion-tab-button').nth(distance);
    const rest = (await button.boundingBox())!;
    await page.mouse.move(rest.x + rest.width / 2, rest.y + rest.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.up();
    const lens = page.locator('body > ion-tab-button.ion-cloned-element');
    const native = lens.locator('[part="native"]');
    await expect
      .poll(() =>
        native.evaluate((el) =>
          el.getAnimations().some((a) => Number(a.effect?.getTiming().duration) > 600 && Number(a.effect?.getTiming().duration) < 800),
        ),
      )
      .toBe(true);
    const samples = await native.evaluate((el) => {
      const animation = el
        .getAnimations()
        .find((a) => Number(a.effect?.getTiming().duration) > 600 && Number(a.effect?.getTiming().duration) < 800)!;
      animation.pause();
      const elapsed = 800 - Number(animation.effect!.getTiming().duration);
      return [133, 233, 500, 799].map((time) => {
        animation.currentTime = time - elapsed;
        const box = el.getBoundingClientRect();
        return { width: box.width, height: box.height };
      });
    });
    expect(samples[0].width - rest.width).toBeCloseTo(29.84, 1);
    expect(samples[1].height - rest.height).toBeCloseTo(7.87, 1);
    expect(samples[2].width - rest.width).toBeCloseTo(-5.05 * (1 + 0.75 * (distance - 1)), 0);
    expect(samples[2].height - rest.height).toBeCloseTo(3.89 * (1 + 0.5 * (distance - 1)), 0);
    expect(samples[3].width).toBeCloseTo(rest.width, 1);
  });
}

for (const dark of [false, true]) {
  for (const changed of [false, true]) {
    test(`glass gradually hands off to selection: dark=${dark}, changed=${changed}`, async ({ page }) => {
      await page.goto('/main/index');
      await page.evaluate((value) => document.documentElement.classList.toggle('ion-palette-dark', value), dark);
      const bar = page.locator('ion-tab-bar');
      await expect(bar).toHaveClass(/ios27-enable-gesture/);
      const button = bar.locator('ion-tab-button').nth(changed ? 1 : 0);
      const box = (await button.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(300);
      await page.mouse.up();
      const native = button.locator('[part="native"]');
      await expect.poll(() => native.evaluate((el) => el.getAnimations().some((a) => a.effect?.getTiming().duration === 450))).toBe(true);
      const samples = await button.evaluate((el) => {
        const target = el.shadowRoot!.querySelector('[part="native"]')!;
        const lens = document.querySelector('body > ion-tab-button.ion-cloned-element')!;
        const animations = [
          ...lens.getAnimations(),
          ...target.getAnimations(),
          ...lens.shadowRoot!.querySelector('[part="native"]')!.getAnimations(),
        ];
        animations.forEach((a) => a.pause());
        return [250, 350, 449].map((time) => {
          animations.forEach((a) => {
            a.currentTime = time;
          });
          const color = getComputedStyle(target)
            .backgroundColor.match(/[\d.]+/g)!
            .map(Number);
          return { glass: Number(getComputedStyle(lens).opacity), selection: color.length === 4 ? color[3] : 1, rgb: color.slice(0, 3) };
        });
      });
      expect(samples[0].glass).toBeCloseTo(1);
      expect(samples[0].selection).toBeCloseTo(0);
      expect(samples[1].glass).toBeCloseTo(0.5);
      const opacity = dark ? 0.72 : 0.095;
      expect(Math.abs(samples[1].selection - opacity / 2)).toBeLessThan(1 / 255);
      expect(samples[2].glass).toBeLessThan(0.01);
      expect(Math.abs(samples[2].selection - opacity)).toBeLessThan(0.005);
      expect(samples[2].rgb).toEqual(dark ? [0, 0, 0] : [16, 16, 16]);
      await button.evaluate((el) => {
        const lens = document.querySelector('body > ion-tab-button.ion-cloned-element')!;
        [
          ...lens.getAnimations(),
          ...el.shadowRoot!.querySelector('[part="native"]')!.getAnimations(),
          ...lens.shadowRoot!.querySelector('[part="native"]')!.getAnimations(),
        ].forEach((a) => a.finish());
      });
      await expect(page.locator('body > ion-tab-button.ion-cloned-element')).toBeHidden();
      await expect(bar).not.toHaveClass(/ios27-animated/);
      const finalColor = await native.evaluate((el) =>
        getComputedStyle(el)
          .backgroundColor.match(/[\d.]+/g)!
          .map(Number),
      );
      expect(Math.abs(finalColor[3] - opacity)).toBeLessThan(1 / 255);
    });
  }
}

test('a fast drag commits the release position, including after reversing direction', async ({ page }) => {
  await page.goto('/main/index');
  const bar = page.locator('ion-tab-bar');
  await expect(bar).toHaveClass(/ios27-enable-gesture/);
  const buttons = bar.locator('ion-tab-button');
  const first = (await buttons.first().boundingBox())!;
  const middle = (await buttons.nth(1).boundingBox())!;
  const last = (await buttons.last().boundingBox())!;
  await page.mouse.move(middle.x + middle.width / 2, middle.y + middle.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2);
  await page.waitForTimeout(30);
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(buttons.first()).toHaveClass(/tab-selected/);
  await expect(page.locator('body > ion-tab-button.ion-cloned-element')).toBeHidden();
});

test('a short tap completes its initial stretch before release', async ({ page }) => {
  await page.goto('/main/index');
  const bar = page.locator('ion-tab-bar');
  await expect(bar).toHaveClass(/ios27-enable-gesture/);
  const target = (await bar.locator('ion-tab-button').nth(1).boundingBox())!;
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.up();
  const lens = page.locator('body > ion-tab-button.ion-cloned-element');
  await expect(lens).toBeVisible();
  await expect
    .poll(() => lens.locator('[part="native"]').evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a))
    .toBeGreaterThan(1.2);
  await expect(lens).toBeHidden();
  await expect(bar.locator('ion-tab-button').nth(1)).toHaveClass(/tab-selected/);
});

test('transfer stretches horizontally before vertically and stays centered vertically', async ({ page }) => {
  await page.goto('/main/index');
  const bar = page.locator('ion-tab-bar');
  await expect(bar).toHaveClass(/ios27-enable-gesture/);
  const source = (await bar.locator('ion-tab-button').first().boundingBox())!;
  const target = (await bar.locator('ion-tab-button').nth(1).boundingBox())!;
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
  await page.mouse.down();
  const lens = page.locator('body > ion-tab-button.ion-cloned-element');
  await expect(lens).toBeVisible();
  const samples = await lens.evaluate((el) => {
    const native = el.shadowRoot!.querySelector('[part="native"]')!;
    const animations = [...el.getAnimations(), ...native.getAnimations()];
    animations.forEach((a) => a.pause());
    return [0, 133, 467, 900].map((time) => {
      animations.forEach((a) => {
        a.currentTime = time;
      });
      const rect = native.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
  });
  expect(samples[0].width).toBeCloseTo(source.width, 1);
  expect(samples[1].width).toBeGreaterThan(samples[2].width);
  expect(samples[1].height).toBeLessThan(samples[2].height);
  for (const sample of samples) expect(sample.y + sample.height / 2).toBeCloseTo(source.y + source.height / 2, 1);
  await page.mouse.up();
  await expect(lens).toBeHidden();
});

test('drag speed changes lens proportions and stopping rebounds to the held size', async ({ page }) => {
  const peaks: number[] = [];
  for (const delay of [60, 10]) {
    await page.goto('/main/index');
    const bar = page.locator('ion-tab-bar');
    await expect(bar).toHaveClass(/ios27-enable-gesture/);
    const button = (await bar.locator('ion-tab-button').first().boundingBox())!;
    const x = button.x + button.width / 2;
    const y = button.y + button.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(950);
    const native = page.locator('body > ion-tab-button.ion-cloned-element [part="native"]');
    for (let step = 1; step <= 8; step++) {
      await page.mouse.move(x + step * (delay === 10 ? 16 : 8), y);
      await page.waitForTimeout(delay);
      const startScale = await native.evaluate((el) => {
        const animation = el.getAnimations().find((a) => a.effect?.getTiming().duration === 500);
        if (!animation) return null;
        const frame = (animation.effect as KeyframeEffect).getKeyframes()[0];
        return new DOMMatrixReadOnly(frame.transform as string).a;
      });
      // Replacing an in-flight animation must retain its scale, not restart at 1.
      if (startScale !== null) expect(startScale).toBeGreaterThan(1.1);
    }
    const samples = await native.evaluate((el) => {
      const animation = el.getAnimations().find((a) => a.effect?.getTiming().duration === 500)!;
      animation.pause();
      return [100, 220, 500].map((time) => {
        animation.currentTime = time;
        const box = el.getBoundingClientRect();
        return { width: box.width, height: box.height, center: box.x + box.width / 2 };
      });
    });
    expect(samples[0].width).toBeGreaterThan(samples[2].width);
    expect(samples[0].height).toBeLessThan(samples[2].height);
    expect(samples[1].width).toBeLessThan(samples[2].width);
    expect(samples[1].height).toBeGreaterThan(samples[2].height);
    // WebKit rounds transformed bounds independently; allow subpixel edge rounding.
    for (const sample of samples) expect(Math.abs(sample.center - samples[2].center)).toBeLessThan(0.1);
    peaks.push(samples[0].width - samples[2].width);
    await page.mouse.up();
    await expect(page.locator('body > ion-tab-button.ion-cloned-element')).toBeHidden();
  }
  expect(peaks[1]).toBeGreaterThan(peaks[0] + 3);
});

test('horizontal touch dragging is not cancelled by browser panning', async ({ page, browserName }) => {
  // CDP sends real touch input through browser gesture arbitration, unlike dispatchEvent.
  test.skip(browserName !== 'chromium', 'Touch input injection requires CDP');
  await page.goto('/main/index');
  const bar = page.locator('ion-tab-bar');
  await expect(bar).toHaveClass(/ios27-enable-gesture/);
  await bar.evaluate((el) => {
    el.setAttribute('data-pointer-cancels', '0');
    el.addEventListener('pointercancel', () => el.setAttribute('data-pointer-cancels', '1'));
  });
  const box = (await bar.locator('ion-tab-button').first().boundingBox())!;
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  const cdp = await page.context().newCDPSession(page);
  const lens = page.locator('body > ion-tab-button.ion-cloned-element');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const delta of [20, 40, 80, 100, 60]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + delta, y }] });
    await expect(lens).toBeVisible();
    await expect
      .poll(async () => {
        const rect = (await lens.boundingBox())!;
        return Math.abs(rect.x + rect.width / 2 - (x + delta));
      })
      .toBeLessThanOrEqual(1);
  }
  await expect(bar).toHaveAttribute('data-pointer-cancels', '0');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(lens).toBeHidden();
  await expect(bar.locator('ion-tab-button').nth(1)).toHaveClass(/tab-selected/);
});

for (const start of [0, 1]) {
  test(`dragged glass follows the pointer from tab ${start}`, async ({ page }) => {
    await page.goto('/main/index');
    const bar = page.locator('ion-tab-bar');
    await expect(bar).toHaveClass(/ios27-enable-gesture/);
    const button = (await bar.locator('ion-tab-button').nth(start).boundingBox())!;
    const x = button.x + button.width / 2;
    const y = button.y + button.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(50);
    const lens = page.locator('body > ion-tab-button.ion-cloned-element');
    for (const delta of [20, 40, 60, 30]) {
      await page.mouse.move(x + delta, y);
      await expect
        .poll(async () => {
          const box = (await lens.boundingBox())!;
          return Math.abs(box.x + box.width / 2 - (x + delta));
        })
        .toBeLessThanOrEqual(1);
    }
    await page.mouse.up();
    await expect(lens).toBeHidden();
  });
}

test('dragging interrupts transfer immediately and selects the tab under the pointer', async ({ page }) => {
  await page.goto('/main/index');
  const bar = page.locator('ion-tab-bar');
  await expect(bar).toHaveClass(/ios27-enable-gesture/);
  const buttons = bar.locator('ion-tab-button');
  const from = (await buttons.nth(1).boundingBox())!;
  const to = (await buttons.last().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(60);
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(from.x + from.width / 2 + ((to.x - from.x) * step) / 8, to.y + to.height / 2);
    await page.waitForTimeout(20);
  }
  await expect(buttons.last()).toHaveClass(/ion-activated/);
  const lens = page.locator('body > ion-tab-button.ion-cloned-element');
  expect(await lens.evaluate((el) => el.getAnimations().some((a) => a.effect?.getTiming().duration === 900))).toBe(false);
  await page.mouse.up();
  await expect(buttons.last()).toHaveClass(/tab-selected/);
  await expect(lens).toBeHidden();
});

test('a new press interrupts release without clearing the new gesture', async ({ page }) => {
  await page.goto('/main/index');
  const bar = page.locator('ion-tab-bar');
  await expect(bar).toHaveClass(/ios27-enable-gesture/);
  const button = bar.locator('ion-tab-button').first();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await expect(bar).toHaveClass(/ios27-animated/);
  await expect(page.locator('body > ion-tab-button.ion-cloned-element')).toBeVisible();
  await page.mouse.up();
  await expect(bar).not.toHaveClass(/ios27-animated/);
});

for (const count of [2, 4]) {
  test(`${count} tabs expand by a fixed amount and return with the lens`, async ({ page }) => {
    await page.goto('/main/index');
    const bar = page.locator('ion-tab-bar');
    await expect(bar).toHaveClass(/ios27-enable-gesture/);
    if (count === 2) await bar.evaluate((el) => [...el.children].slice(2).forEach((button) => button.remove()));
    const rest = (await bar.boundingBox())!;
    const button = bar.locator('ion-tab-button').first();
    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(async () => (await bar.boundingBox())!.width).toBeCloseTo(rest.width + 14.14, 1);
    expect((await bar.boundingBox())!.x + (await bar.boundingBox())!.width / 2).toBeCloseTo(rest.x + rest.width / 2, 1);
    const lens = page.locator('body > ion-tab-button.ion-cloned-element');
    await expect(lens).toBeVisible();
    await expect
      .poll(() => lens.locator('[part="native"]').evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).d))
      .toBeGreaterThan(1.1);
    await page.mouse.up();
    await expect(button).not.toHaveClass(/ion-activated/);
    const native = lens.locator('[part="native"]');
    await expect.poll(() => native.evaluate((el) => el.getAnimations().some((a) => a.effect?.getTiming().duration === 450))).toBe(true);
    const scales = await native.evaluate((el) => {
      const animation = el.getAnimations().find((a) => a.effect?.getTiming().duration === 450)!;
      animation.pause();
      return [0, 200, 267, 450].map((time) => {
        animation.currentTime = time;
        const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        return matrix.d;
      });
    });
    expect(scales[0]).toBeGreaterThan(1);
    expect(scales[1]).toBeLessThan(scales[0]);
    expect(scales[2]).toBeLessThan(1);
    expect(scales[3]).toBeCloseTo(1, 3);
    await native.evaluate((el) => el.getAnimations().forEach((a) => a.finish()));
    await expect(lens).toBeHidden();
    await expect.poll(async () => (await bar.boundingBox())!.width).toBeCloseTo(rest.width, 1);
  });
}
