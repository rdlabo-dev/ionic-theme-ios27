import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 402, height: 874 }, hasTouch: true });

const appendFixtures = async (page: Page, markup: string) => {
  await page.evaluate((html) => {
    document.querySelector('#ios26-segment-parity-fixture')?.remove();
    const app = document.querySelector('ion-app');
    if (!app) {
      throw new Error('ion-app not found');
    }
    const wrap = document.createElement('div');
    wrap.id = 'ios26-segment-parity-fixture';
    wrap.style.cssText = 'position:fixed;top:120px;left:16px;right:16px;z-index:10000;padding:12px;background:rgba(255,255,255,0.96);';
    wrap.innerHTML = html;
    app.appendChild(wrap);
  }, markup);
};

const waitSegmentReady = async (segment: Locator) => {
  await expect(segment).toBeVisible();
  await segment.evaluate(async (el) => {
    const host = el as HTMLElement & { componentOnReady?: () => Promise<unknown> };
    await host.componentOnReady?.();
  });
  await expect.poll(async () => segment.evaluate((el) => el.classList.contains('hydrated'))).toBe(true);
  await segment.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
};

const trackIonChange = async (segment: Locator) => {
  await segment.evaluate((el) => {
    el.dataset['changes'] = '0';
    el.addEventListener('ionChange', () => {
      el.dataset['changes'] = String(Number(el.dataset['changes'] ?? '0') + 1);
    });
  });
};

const rootScale = async (segment: Locator) => segment.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);

test.describe('iOS26 ion-segment candidate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/main/index/segment', { waitUntil: 'networkidle' });
    const toolbar = page.locator('app-segment ion-header ion-segment').first();
    await expect(toolbar).toHaveClass(/hydrated/);
    await expect(toolbar).toHaveClass(/ios26-enable-gesture/);
  });

  test('default resting geometry is 31×27 outside toolbar', async ({ page }) => {
    await appendFixtures(
      page,
      `<ion-segment id="plain" mode="ios" value="a" style="width:160px;">
        <ion-segment-button value="a"><ion-label>A</ion-label></ion-segment-button>
        <ion-segment-button value="b"><ion-label>B</ion-label></ion-segment-button>
      </ion-segment>`,
    );
    const segment = page.locator('#plain');
    await waitSegmentReady(segment);
    expect((await segment.boundingBox())!.height).toBeCloseTo(31, 0);
    expect((await segment.locator('ion-segment-button').first().boundingBox())!.height).toBeCloseTo(27, 0);
  });

  test('toolbar resting geometry is 48×44 on demo header', async ({ page }) => {
    const segment = page.locator('app-segment ion-header ion-segment').first();
    await expect(segment).toHaveClass(/hydrated/);
    expect((await segment.boundingBox())!.height).toBeCloseTo(48, 0);
    expect((await segment.getByRole('tab').first().boundingBox())!.height).toBeCloseTo(44, 0);
  });

  test('press does not grow the segment root', async ({ page }) => {
    const segment = page.locator('app-segment ion-header ion-segment').first();
    const before = (await segment.boundingBox())!;
    const tab = segment.getByRole('tab').first();
    const box = (await tab.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(300);
    expect(await rootScale(segment)).toBeCloseTo(1, 3);
    const held = (await segment.boundingBox())!;
    expect(held.width).toBeCloseTo(before.width, 1);
    expect(held.height).toBeCloseTo(before.height, 1);
    await page.mouse.up();
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

  test('disabled segment does not change on tap', async ({ page }) => {
    const segment = page.locator('app-segment .section-example ion-segment.segment-disabled');
    await expect(segment).toHaveClass(/hydrated/);
    await trackIonChange(segment);
    const before = await segment.evaluate((el) => (el as HTMLIonSegmentElement).value);
    await segment.getByRole('tab').last().tap({ force: true });
    expect(await segment.evaluate((el) => (el as HTMLIonSegmentElement).value)).toBe(before);
    await expect(segment).toHaveAttribute('data-changes', '0');
    await expect(segment.locator('ion-segment-button').first()).toHaveClass(/segment-button-checked/);
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
});
