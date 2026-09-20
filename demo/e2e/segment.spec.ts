import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 402, height: 874 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/main/index/segment');
  await expect(page.locator('app-segment ion-segment').first()).toHaveClass(/ios27-enable-gesture/);
});

test('toolbar resting geometry follows native sizing', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment').first();
  const box = (await segment.boundingBox())!;
  expect(box.height).toBeCloseTo(48, 0);
  const button = segment.locator('ion-segment-button').first();
  expect((await button.boundingBox())!.height).toBeCloseTo(44, 0);
});

for (const color of ['primary', 'light']) {
  test(`${color} toolbar keeps Ionic's segment contrast contract`, async ({ page }) => {
    const segment = page.locator(`app-segment ion-toolbar[color="${color}"] ion-segment:not([color])`);
    const checked = segment.locator('ion-segment-button.segment-button-checked');
    const unchecked = segment.locator('ion-segment-button:not(.segment-button-checked)');

    await checked.scrollIntoViewIfNeeded();
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
      const lens = segment.locator('.ios27-segment-lens');
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
}

test('colored toolbar indicator defaults remain publicly customizable', async ({ page }) => {
  const toolbar = page.locator('app-segment ion-toolbar[color="light"]').filter({
    has: page.locator('ion-segment:not([color])'),
  });
  const segment = toolbar.locator('ion-segment:not([color])');
  const checked = segment.locator('ion-segment-button.segment-button-checked');
  const indicator = checked.locator('[part="indicator-background"]');
  const lens = segment.locator('.ios27-segment-lens');
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

for (const color of ['primary', 'secondary']) {
  test(`${color} keeps Ionic segment colors independent from its toolbar`, async ({ page }) => {
    const segment = page.locator(`app-segment ion-segment[color="${color}"]`);
    const button = segment.locator('ion-segment-button').first();
    await button.scrollIntoViewIfNeeded();
    const indicatorColor = 'rgb(255, 255, 255)';
    await expect(button.locator('[part="indicator-background"]')).toHaveCSS('background-color', indicatorColor);
    await expect(button.locator('[part="native"]')).toHaveCSS('color', 'rgb(0, 0, 0)');
    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const lens = segment.locator('.ios27-segment-lens');
    await expect(lens).toBeVisible();
    const matches = await lens.evaluate((el, expected) => {
      el.getAnimations().forEach((animation) => {
        animation.pause();
        animation.currentTime = 0;
      });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      context.fillStyle = expected;
      context.fillRect(0, 0, 1, 1);
      const base = Array.from(context.getImageData(0, 0, 1, 1).data);
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(el).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).every((value, index) => Math.abs(value - base[index]) <= 1);
    }, indicatorColor);
    expect(matches).toBe(true);
    await page.mouse.up();
    await segment.evaluate((el) =>
      el
        .querySelector('.ios27-segment-lens')!
        .getAnimations()
        .forEach((animation) => animation.finish()),
    );
    await expect(lens).toBeHidden();
    await segment.locator('ion-segment-button').last().click();
    await expect(lens).toBeHidden();
    await expect(segment.locator('ion-segment-button').last().locator('[part="indicator-background"]')).toHaveCSS(
      'background-color',
      indicatorColor,
    );
    const checked = segment.locator('ion-segment-button').last();
    await checked.evaluate((el) => el.style.setProperty('--color-checked', 'rgb(12, 34, 56)'));
    await expect(checked.locator('[part="native"]')).toHaveCSS('color', 'rgb(12, 34, 56)');

    await page.evaluate(() => document.documentElement.classList.add('ion-palette-dark'));
    await expect
      .poll(() =>
        button.locator('[part="indicator-background"]').evaluate((el) => {
          const context = document.createElement('canvas').getContext('2d')!;
          context.fillStyle = getComputedStyle(el).backgroundColor;
          context.fillRect(0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data);
        }),
      )
      .toEqual([90, 91, 96, 255]);
  });
}

for (const dark of [false, true]) {
  test(`compact segment surfaces remain flat in ${dark ? 'dark' : 'light'} mode`, async ({ page }) => {
    await page.evaluate((enabled) => document.documentElement.classList.toggle('ion-palette-dark', enabled), dark);
    for (const selector of ['ion-segment[aria-label="Content segment"]', 'app-segment ion-segment.segment-expand']) {
      const segment = page.locator(selector);
      await expect(segment).toHaveCSS('background-image', 'none');
      await expect(segment).toHaveCSS('box-shadow', 'none');
      await expect(segment).toHaveCSS('backdrop-filter', 'none');
      await segment.evaluate((el) => el.style.setProperty('--background', 'rgb(12, 34, 56)'));
      await expect(segment).toHaveCSS('background-color', 'rgb(12, 34, 56)');
    }
    const toolbar = page.locator('app-segment ion-segment').first();
    await expect(toolbar).toHaveCSS('background-image', 'none');
    await expect(toolbar).toHaveCSS('backdrop-filter', 'none');
    await expect(toolbar).toHaveCSS('box-shadow', 'none');
    const indicator = toolbar.locator('ion-segment-button').first().locator('[part="indicator-background"]');
    await expect
      .poll(async () =>
        indicator.evaluate((el) => {
          const context = document.createElement('canvas').getContext('2d')!;
          context.fillStyle = getComputedStyle(el).backgroundColor;
          context.fillRect(0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data);
        }),
      )
      .toEqual(dark ? [90, 91, 96, 255] : [255, 255, 255, 255]);
  });
}

test('pressed glass can extend outside the segment without adding layout padding', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment').first();
  const before = await segment.evaluate((el) => ({ height: el.offsetHeight, padding: getComputedStyle(el).padding }));
  const button = segment.locator('ion-segment-button').first();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(segment.locator('.ios27-segment-lens')).toBeVisible();
  await expect(segment).toHaveCSS('contain', 'layout style');
  const toolbar = segment.locator('..');
  await expect(toolbar).toHaveCSS('contain', 'layout style');
  await expect(toolbar.locator('[part="container"]')).toHaveCSS('overflow', 'visible');
  await expect(toolbar.locator('[part="container"]')).toHaveCSS('contain', 'layout style');
  await expect
    .poll(() =>
      segment.evaluate((el) => el.querySelector('.ios27-segment-lens')!.getBoundingClientRect().height - el.getBoundingClientRect().height),
    )
    .toBeGreaterThan(4);
  expect(await segment.evaluate((el) => ({ height: el.offsetHeight, padding: getComputedStyle(el).padding }))).toEqual(before);
  await page.mouse.up();
});

test('toolbar press scales the container, without scaling the label twice', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment').first();
  const button = segment.locator('ion-segment-button').last();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => segment.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a)).toBeCloseTo(1.113, 2);
  expect(await button.locator('[part="native"]').evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a)).toBe(1);
  await page.mouse.up();
  await expect.poll(() => segment.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a)).toBe(1);
});

test('toolbar container follows the native press and release spring', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment').first();
  const box = (await segment.locator('ion-segment-button').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const press = await segment.evaluate((el) => {
    const transition = el.getAnimations().find((effect) => effect instanceof CSSTransition && effect.transitionProperty === 'transform')!;
    transition.pause();
    transition.currentTime = 200;
    const scale = new DOMMatrixReadOnly(getComputedStyle(el).transform).a;
    transition.finish();
    return scale;
  });
  expect(press).toBeCloseTo(1.122, 3);
  await page.waitForTimeout(220);
  await page.mouse.up();
  const release = await segment.evaluate((el) => {
    getComputedStyle(el).transform;
    const transition = el.getAnimations().find((effect) => effect instanceof CSSTransition && effect.transitionProperty === 'transform')!;
    transition.pause();
    return [150, 217, 367, 433, 517].map((time) => {
      transition.currentTime = time;
      return new DOMMatrixReadOnly(getComputedStyle(el).transform).a;
    });
  });
  for (const [index, scale] of [1, 0.9863, 1, 1.0016, 1].entries()) expect(release[index]).toBeCloseTo(scale, 3);
});

test('short taps preserve outward velocity and do not shorten the container return', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment').first();
  const box = (await segment.locator('ion-segment-button').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.up();
  const result = await segment.evaluate((el) => {
    const animation = el
      .getAnimations()
      .find((effect) => !(effect instanceof CSSTransition) && effect.effect?.getTiming().duration === 600)!;
    animation.pause();
    return [0, 83, 350, 599].map((time) => {
      animation.currentTime = time;
      return new DOMMatrixReadOnly(getComputedStyle(el).transform).a;
    });
  });
  expect(result[1]).toBeGreaterThan(result[0]);
  expect(result[2]).toBeLessThan(1);
  expect(result[3]).toBeCloseTo(1, 3);
});

test('plain segments use 32px and keep their outer bounds on press without registration', async ({ page }) => {
  await page.evaluate(() => {
    const segment = document.createElement('ion-segment');
    segment.setAttribute('mode', 'ios');
    segment.setAttribute('value', 'new');
    segment.id = 'plain-segment';
    segment.style.cssText = 'position:fixed;left:40px;top:300px;width:130px;z-index:99999';
    segment.innerHTML =
      '<ion-segment-button value="new"><ion-label>New</ion-label></ion-segment-button><ion-segment-button value="replied"><ion-label>Replied</ion-label></ion-segment-button>';
    document.body.append(segment);
  });
  const segment = page.locator('#plain-segment');
  await expect(segment).toHaveClass(/hydrated/);
  const box = (await segment.boundingBox())!;
  expect(box.height).toBeCloseTo(32, 0);
  const indicator = segment.locator('ion-segment-button').first().locator('[part="indicator-background"]');
  expect((await indicator.boundingBox())!.height).toBeCloseTo(28, 0);
  await segment.locator('ion-segment-button').last().tap();
  await expect.poll(() => segment.evaluate((el) => (el as HTMLIonSegmentElement).value)).toBe('replied');
  expect((await segment.boundingBox())!.width).toBeCloseTo(box.width, 1);
});

test('expanded segments account for both safe areas', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment.segment-expand');
  const before = (await segment.boundingBox())!.width;
  await segment.evaluate((el) => {
    el.style.setProperty('--ion-safe-area-left', '10px');
    el.style.setProperty('--ion-safe-area-right', '30px');
  });
  expect((await segment.boundingBox())!.width).toBeCloseTo(before - 40, 0);
});

test('disabled segments retain their selection', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment.segment-disabled');
  const buttons = segment.locator('ion-segment-button');
  const box = (await buttons.last().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(buttons.first()).toHaveClass(/segment-button-checked/);
  await expect(buttons.last()).not.toHaveClass(/segment-button-checked/);
});

test('indicator radius remains customizable', async ({ page }) => {
  const button = page.locator('app-segment ion-segment-button').first();
  await button.evaluate((el) => el.style.setProperty('--border-radius', '8px'));
  await expect(button.locator('[part="indicator-background"]')).toHaveCSS('border-radius', '8px');
});

test('registered taps emit one value change in each direction', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment').first();
  await segment.evaluate((el) => {
    el.dataset['changes'] = '0';
    el.addEventListener('ionChange', () => (el.dataset['changes'] = String(Number(el.dataset['changes']) + 1)));
  });
  for (const [index, value, count] of [
    [1, 'segment', '1'],
    [0, 'default', '2'],
  ] as const) {
    await segment.locator('ion-segment-button').nth(index).tap();
    await expect.poll(() => segment.evaluate((el) => (el as HTMLIonSegmentElement).value)).toBe(value);
    await expect(segment).not.toHaveClass(/ios27-animated/);
    await expect(segment).toHaveAttribute('data-changes', count);
  }
});

test('content segment remains unscaled with registered effects', async ({ page }) => {
  const segment = page.locator('ion-segment[aria-label="Content segment"]');
  const rect = (await segment.boundingBox())!;
  const button = segment.locator('ion-segment-button').nth(1);
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(350);
  expect((await segment.boundingBox())!.width).toBeCloseTo(rect.width, 1);
  expect((await segment.boundingBox())!.height).toBeCloseTo(32, 0);
  await page.mouse.up();
  await expect(segment).not.toHaveClass(/ios27-animated/);
});

test('reduced motion skips the optional gesture effect', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const segment = page.locator('app-segment ion-segment').first();
  await expect(segment).toHaveClass(/hydrated/);
  await segment.locator('ion-segment-button').last().tap();
  await expect.poll(() => segment.evaluate((el) => (el as HTMLIonSegmentElement).value)).toBe('segment');
  await expect(segment).not.toHaveClass(/ios27-enable-gesture/);
  expect(await segment.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a)).toBe(1);
});

test('scrollable segments retain their horizontal scrolling', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment.segment-scrollable');
  await segment.scrollIntoViewIfNeeded();
  const scroll = await segment.evaluate((el) => {
    el.scrollLeft = 100;
    return { left: el.scrollLeft, overflow: getComputedStyle(el).overflowX };
  });
  expect(scroll.left).toBeGreaterThan(0);
  expect(scroll.overflow).not.toBe('visible');
});

for (const direction of ['ltr', 'rtl']) {
  test(`registered dragging preserves selection in ${direction}`, async ({ page }) => {
    const segment = page.locator('app-segment ion-segment').first();
    await segment.evaluate((el, dir) => el.setAttribute('dir', dir), direction);
    const buttons = segment.locator('ion-segment-button');
    const start = (await buttons.first().boundingBox())!;
    const end = (await buttons.last().boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    // Ionic processes one move per frame; give each sample a rendering frame.
    for (let step = 1; step <= 5; step++) {
      const x = start.x + start.width / 2 + ((end.x + end.width / 2 - start.x - start.width / 2) * step) / 5;
      await page.mouse.move(x, end.y + end.height / 2);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    }
    await page.mouse.up();
    await expect(segment).not.toHaveClass(/ios27-animated/);
    await expect.poll(() => segment.evaluate((el) => (el as HTMLIonSegmentElement).value)).toBe('segment');
    await expect(buttons.last()).toHaveClass(/segment-button-checked/);
  });
}

test('unselected press stays at the old selection until release', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment').first();
  const buttons = segment.locator('ion-segment-button');
  const box = (await buttons.last().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await expect(buttons.first()).toHaveClass(/segment-button-checked/);
  await expect(segment.locator('.ios27-segment-lens')).toBeHidden();
  expect(await segment.evaluate((el) => (el as HTMLIonSegmentElement).value)).toBe('default');
  await page.mouse.up();
  await expect(segment.locator('.ios27-segment-lens')).toBeVisible();
  await expect(segment).not.toHaveClass(/ios27-animated/);
});

test('selected short tap completes one press and returns without changing value', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment').first();
  await segment.evaluate((el) => {
    const start = performance.now();
    el.dataset['peak'] = '0';
    const sample = () => {
      const lens = el.querySelector<HTMLElement>('.ios27-segment-lens')!;
      if (!lens.hidden) {
        const scale = el.getBoundingClientRect().width / el.offsetWidth;
        el.dataset['peak'] = String(Math.max(Number(el.dataset['peak']), lens.getBoundingClientRect().width / scale));
      }
      if (performance.now() - start < 1100) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const button = segment.locator('ion-segment-button').first();
  const width = await button.evaluate((el) => el.clientWidth - 4);
  await button.tap();
  await expect.poll(() => segment.evaluate((el) => Number(el.dataset['peak']))).toBeGreaterThan(width + 20);
  await expect(segment).not.toHaveClass(/ios27-animated/);
  expect(await segment.evaluate((el) => (el as HTMLIonSegmentElement).value)).toBe('default');
});

test('selection motion follows native position and deformation milestones', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment').first();
  await segment.evaluate((el) => {
    el.style.width = '138px';
    el.addEventListener(
      'ionChange',
      () => {
        const start = performance.now();
        const frames: { t: number; x: number; w: number; h: number }[] = [];
        const sample = () => {
          const lens = el.querySelector<HTMLElement>('.ios27-segment-lens')!;
          const outer = el.getBoundingClientRect();
          const scale = outer.width / el.offsetWidth;
          const box = lens.getBoundingClientRect();
          if (!lens.hidden)
            frames.push({
              t: performance.now() - start,
              x: (box.x + box.width / 2 - outer.x) / scale,
              w: box.width / scale,
              h: box.height / scale,
            });
          if (performance.now() - start < 900) requestAnimationFrame(sample);
          else el.dataset['frames'] = JSON.stringify(frames);
        };
        requestAnimationFrame(sample);
      },
      { once: true },
    );
  });
  const rest = await segment
    .locator('ion-segment-button')
    .last()
    .evaluate((el) => ({ width: el.clientWidth - 4, height: el.clientHeight }));
  await segment.locator('ion-segment-button').last().tap();
  await expect(segment).toHaveAttribute('data-frames', /\[/);
  const frames = JSON.parse((await segment.getAttribute('data-frames'))!) as { t: number; x: number; w: number; h: number }[];
  // Native deformation is additive. Account for the resting inset of the host context.
  for (const [time, x, width, height] of [
    [200, 92, 90, 49.5],
    [500, 105, 58, 42.5],
    [700, 103.6, 60.5, 40.4],
  ]) {
    const measured = frames.reduce((a, b) => (Math.abs(b.t - time) < Math.abs(a.t - time) ? b : a));
    expect(Math.abs(measured.x - x), JSON.stringify(measured)).toBeLessThan(4);
    expect(Math.abs(measured.w - (width + rest.width - 61))).toBeLessThan(5);
    expect(Math.abs(measured.h - (height + rest.height - 40))).toBeLessThan(3);
  }
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`moving lens keeps its reflective border and measured bounds in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.evaluate((dark) => document.documentElement.classList.toggle('ion-palette-dark', dark), colorScheme === 'dark');
    const segment = page.locator('app-segment ion-segment').first();
    await segment.locator('ion-segment-button').last().tap();
    const lens = segment.locator('.ios27-segment-lens');
    await expect(lens).toBeVisible();
    const styles = await lens.evaluate((el) => {
      const animation = el.getAnimations()[0];
      animation.pause();
      animation.currentTime = 200;
      const style = getComputedStyle(el);
      const edge = getComputedStyle(el.querySelector('.ios27-segment-edge')!);
      const scale = new DOMMatrixReadOnly(getComputedStyle(el.parentElement!).transform).a;
      return {
        border: parseFloat(edge.borderTopWidth),
        shadow: edge.boxShadow,
        sizing: style.boxSizing,
        width: el.getBoundingClientRect().width / scale,
        cssWidth: parseFloat(style.width),
      };
    });
    expect(styles.border).toBeGreaterThan(0);
    expect(styles.shadow).not.toBe('none');
    expect(styles.sizing).toBe('border-box');
    expect(styles.width).toBeCloseTo(styles.cssWidth, 1);
  });
}

for (const dark of [false, true]) {
  for (const change of [false, true]) {
    test(`lens blends into the selected surface on ${change ? 'selection' : 'release'} in ${dark ? 'dark' : 'light'} mode`, async ({
      page,
    }) => {
      await page.evaluate((enabled) => document.documentElement.classList.toggle('ion-palette-dark', enabled), dark);
      const segment = page.locator('app-segment ion-segment').first();
      const button = segment.locator('ion-segment-button').nth(change ? 1 : 0);
      await button.evaluate((el) => el.style.setProperty('--indicator-color', 'rgba(20, 90, 180, 0.25)'));
      await button.tap();
      const duration = change ? 800 : 650;
      await expect
        .poll(() => segment.evaluate((el) => el.querySelector('.ios27-segment-lens')?.getAnimations()[0]?.effect?.getTiming().duration))
        .toBe(duration);
      const samples = await segment.evaluate((el, total) => {
        const lens = el.querySelector<HTMLElement>('.ios27-segment-lens')!;
        const indicator = el.querySelector('ion-segment-button.segment-button-checked')!.shadowRoot!.querySelector('[part="indicator"]')!;
        const edge = lens.querySelector('.ios27-segment-edge')!;
        const animations = [...lens.getAnimations({ subtree: true }), ...indicator.getAnimations()];
        animations.forEach((animation) => animation.pause());
        return [200, 100, 1].map((remaining) => {
          animations.forEach((animation) => (animation.currentTime = total - remaining));
          return [
            Number(getComputedStyle(lens).opacity),
            Number(getComputedStyle(indicator).opacity),
            Number(getComputedStyle(edge).opacity),
          ];
        });
      }, duration);
      expect(samples[0][0]).toBeCloseTo(1);
      expect(samples[1][0]).toBeCloseTo(0.5);
      expect(samples[2][0]).toBeLessThan(0.01);
      for (const [lens, indicator, edge] of samples) {
        expect(lens + indicator).toBeCloseTo(1);
        expect(edge).toBeCloseTo(0, 6);
      }
      await segment.evaluate((el) => el.querySelector('.ios27-segment-lens')!.getAnimations()[0].finish());
      await expect(segment.locator('.ios27-segment-lens')).toBeHidden();
      await expect(button.locator('[part="indicator"]')).toHaveCSS('opacity', '1');
    });
  }
}

test('glass edge starts transparent and grows with the press deformation', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment').first();
  const box = (await segment.locator('ion-segment-button').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(segment.locator('.ios27-segment-lens')).toBeVisible();
  await expect.poll(() => segment.locator('.ios27-segment-edge').evaluate((el) => el.getAnimations().length)).toBe(1);
  const samples = await segment.evaluate((el) => {
    const edge = el.querySelector('.ios27-segment-edge')!;
    const effect = edge.getAnimations()[0];
    effect.pause();
    return [0, 33, 100, 233].map((time) => {
      effect.currentTime = time;
      return Number(getComputedStyle(edge).opacity);
    });
  });
  expect(samples[0]).toBe(0);
  expect(samples[1]).toBeCloseTo(0.133, 2);
  expect(samples[2]).toBeCloseTo(0.67, 2);
  expect(samples[3]).toBeCloseTo(1);
  await page.mouse.up();
});

test('programmatic selection clears an in-flight lens without emitting ionChange', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment').first();
  await segment.evaluate((el) => {
    el.dataset['changes'] = '0';
    el.addEventListener('ionChange', () => (el.dataset['changes'] = String(Number(el.dataset['changes']) + 1)));
  });
  await segment.locator('ion-segment-button').last().tap();
  await expect(segment.locator('.ios27-segment-lens')).toBeVisible();
  await segment.evaluate((el) => ((el as HTMLIonSegmentElement).value = 'default'));
  await expect(segment.locator('.ios27-segment-lens')).toBeHidden();
  await expect(segment.locator('ion-segment-button').first()).toHaveClass(/segment-button-checked/);
  await expect(segment).toHaveAttribute('data-changes', '1');
});

test('reduced motion changes clear an in-flight lens', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment').first();
  const button = segment.locator('ion-segment-button').first();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(segment.locator('.ios27-segment-lens')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(segment.locator('.ios27-segment-lens')).toBeHidden();
  await page.mouse.up();
  await expect(segment).not.toHaveClass(/ios27-segment-pressed|ios27-animated/);
});

test('pointer cancellation clears the visual state', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment').first();
  await segment.evaluate((el) =>
    el.addEventListener('pointerdown', (event) => (el.dataset['pointer'] = String(event.pointerId)), { once: true }),
  );
  const box = (await segment.locator('ion-segment-button').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(segment.locator('.ios27-segment-lens')).toBeVisible();
  const pointerId = Number(await segment.getAttribute('data-pointer'));
  await segment.dispatchEvent('pointercancel', { pointerId });
  await expect(segment.locator('.ios27-segment-lens')).toBeHidden();
  await page.mouse.up();
  await expect(segment).not.toHaveClass(/ios27-segment-pressed|ios27-animated/);
});

test('rapid reselection settles to the final Ionic value', async ({ page }) => {
  const segment = page.locator('app-segment ion-segment').first();
  for (const index of [1, 0, 1, 0, 1]) {
    await segment.locator('ion-segment-button').nth(index).tap();
    await page.waitForTimeout(60);
  }
  await expect(segment).not.toHaveClass(/ios27-animated/);
  await expect(segment.locator('.ios27-segment-lens')).toBeHidden();
  expect(await segment.evaluate((el) => (el as HTMLIonSegmentElement).value)).toBe('segment');
});

test('stylesheet overrides apply to colored selection and destination lens', async ({ page }) => {
  await page.addStyleTag({
    content: `
    ion-segment-button { --indicator-color: rgb(12, 34, 56); --color-checked: rgb(65, 43, 21); }
    ion-segment-button:last-of-type { --indicator-color: rgb(210, 30, 40); --border-radius: 8px; }
  `,
  });
  const segment = page.locator('app-segment ion-segment[color="primary"]');
  const first = segment.locator('ion-segment-button').first();
  await segment
    .locator('ion-segment-button')
    .last()
    .evaluate((el) => el.style.setProperty('--border-radius', '8px'));
  await expect(first.locator('[part="indicator-background"]')).toHaveCSS('background-color', 'rgb(12, 34, 56)');
  await expect(first.locator('[part="native"]')).toHaveCSS('color', 'rgb(65, 43, 21)');
  await segment.locator('ion-segment-button').last().tap();
  const lens = segment.locator('.ios27-segment-lens');
  await expect(lens).toBeVisible();
  const appearance = await lens.evaluate((el) => {
    const animation = el.getAnimations().find((a) => (a.effect as KeyframeEffect).getKeyframes().some((f) => f.width))!;
    animation.pause();
    animation.currentTime = 799;
    const style = getComputedStyle(el);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    return { color: Array.from(ctx.getImageData(0, 0, 1, 1).data), radius: style.borderRadius };
  });
  expect(appearance.radius).toBe('8px');
  expect(appearance.color.slice(0, 3)).toEqual([210, 30, 40]);
});
