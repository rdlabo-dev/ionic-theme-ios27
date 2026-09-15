import { expect, test, type Locator, type Page } from '@playwright/test';

/** Theme resting knob: `--knob-width` × `--knob-size` (see `src/styles/components/ion-range.scss`). */
const REST_W = 37;
const REST_H = 24;
/** Single-thumb press uses `scale(1.55)` → 37×1.55 / 24×1.55. */
const HELD_W = 37 * 1.55;
const HELD_H = 24 * 1.55;

test.use({ viewport: { width: 402, height: 874 } });

const appendFixtures = async (page: Page, markup: string) => {
  await page.evaluate((html) => {
    document.querySelector('#ios26-range-parity-fixture')?.remove();
    const app = document.querySelector('ion-app');
    if (!app) {
      throw new Error('ion-app not found');
    }
    const wrap = document.createElement('div');
    wrap.id = 'ios26-range-parity-fixture';
    wrap.style.cssText = 'position:fixed;top:96px;left:16px;right:16px;z-index:10000;padding:12px;background:rgba(255,255,255,0.96);';
    wrap.innerHTML = html;
    app.appendChild(wrap);
  }, markup);
};

const waitRangeReady = async (range: Locator) => {
  await expect(range).toBeVisible();
  await range.evaluate(async (el) => {
    const host = el as HTMLElement & { componentOnReady?: () => Promise<unknown> };
    await host.componentOnReady?.();
  });
  await expect.poll(async () => range.evaluate((el) => el.classList.contains('hydrated'))).toBe(true);
  await range.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
};

const knob = (range: Locator, part = 'knob') => range.locator(`[part~="${part}"]`).first();

const knobBox = async (range: Locator, part = 'knob') => {
  const box = await knob(range, part).boundingBox();
  if (!box) {
    throw new Error(`knob part "${part}" has no bounding box`);
  }
  return box;
};

const pointerDownOnKnob = async (page: Page, range: Locator, part = 'knob') => {
  // Hit the visual knob (not injected `.range-pressed`). Host `:active` drives single-thumb CSS.
  const box = await knobBox(range, part);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
};

test.describe('iOS26 ion-range parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/main/index/range', { waitUntil: 'networkidle' });
    // Demo page ships list + `.section-example` ranges; fixtures stay isolated on `ion-app`.
    await expect(page.getByRole('slider', { name: 'Range with ticks', exact: true })).toBeVisible();
  });

  for (const dir of ['ltr', 'rtl'] as const) {
    for (const edge of ['min', 'max'] as const) {
      test(`${dir} ${edge} enlarged thumb keeps resting outer edge within 1px`, async ({ page }) => {
        const value = edge === 'min' ? 0 : 100;
        await appendFixtures(
          page,
          `<ion-range id="edge" aria-label="Edge range" dir="${dir}" value="${value}" style="width:320px;display:block;"></ion-range>`,
        );
        const range = page.locator('#edge');
        await waitRangeReady(range);
        await expect(range).toHaveClass(edge === 'min' ? /range-value-min/ : /range-value-max/);

        const rest = await knobBox(range);
        const restOuter = (() => {
          // Physical outer edge that endpoint translate is meant to pin.
          if (dir === 'ltr') {
            return edge === 'min' ? rest.x : rest.x + rest.width;
          }
          return edge === 'min' ? rest.x + rest.width : rest.x;
        })();

        await pointerDownOnKnob(page, range);
        await expect.poll(async () => (await knobBox(range)).width).toBeCloseTo(HELD_W, 1);
        const held = await knobBox(range);
        const heldOuter = (() => {
          if (dir === 'ltr') {
            return edge === 'min' ? held.x : held.x + held.width;
          }
          return edge === 'min' ? held.x + held.width : held.x;
        })();
        expect(Math.abs(heldOuter - restOuter)).toBeLessThanOrEqual(1);
        await page.mouse.up();
      });
    }
  }

  test('dual-knob press expands only the active thumb vertically; width stays 37 (co-located endpoints)', async ({ page }) => {
    await appendFixtures(
      page,
      `<ion-range id="dual" aria-label="Dual knobs" dual-knobs="true" style="width:320px;display:block;"></ion-range>`,
    );
    const range = page.locator('#dual');
    await waitRangeReady(range);
    // Co-located endpoints (Ionic default dual ratios are both 0).
    await range.evaluate((el) => {
      (el as HTMLIonRangeElement).value = { lower: 0, upper: 0 };
    });
    await range.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    const restA = await knobBox(range, 'knob-a');
    const restB = await knobBox(range, 'knob-b');
    expect(restA.width).toBeCloseTo(REST_W, 1);
    expect(restB.width).toBeCloseTo(REST_W, 1);

    // Dual styles key off Ionic `.range-pressed-*` (not `:active`). Gesture threshold is 10px.
    const start = await knobBox(range, 'knob-a');
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2, { steps: 2 });
    // The threshold-crossing event starts the gesture; the next move selects
    // the active knob. Keep both endpoints close to their coincident origin.
    await page.mouse.move(start.x + start.width / 2 + 14, start.y + start.height / 2);

    await expect(range).toHaveClass(/range-pressed/);
    await expect
      .poll(async () => Math.max((await knobBox(range, 'knob-a')).height, (await knobBox(range, 'knob-b')).height))
      .toBeCloseTo(HELD_H, 1);

    const heldA = await knobBox(range, 'knob-a');
    const heldB = await knobBox(range, 'knob-b');
    expect(heldA.width).toBeCloseTo(REST_W, 1);
    expect(heldB.width).toBeCloseTo(REST_W, 1);

    const heights = [heldA.height, heldB.height].sort((a, b) => a - b);
    expect(heights[0]).toBeCloseTo(REST_H, 1);
    expect(heights[1]).toBeCloseTo(HELD_H, 1);

    await page.mouse.up();
  });
});
