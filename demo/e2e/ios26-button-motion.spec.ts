import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 402, height: 874 }, hasTouch: true });

const WIDTHS = [44, 80, 140, 220] as const;

type ButtonPageCmp = {
  registeredGestures: { destroy: () => void }[];
  ionViewDidEnter: () => void;
};

const buttonPage = async (page: Page) => {
  const result = await page.evaluate(() => {
    const host = document.querySelector('app-button');
    const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => ButtonPageCmp } }).ng;
    if (!host || !ng?.getComponent) return { ok: false as const, reason: 'ng.getComponent unavailable' };
    const cmp = ng.getComponent(host);
    if (!cmp?.registeredGestures || !cmp.ionViewDidEnter) return { ok: false as const, reason: 'button page unavailable' };
    return { ok: true as const };
  });
  expect(result.ok, 'reason' in result ? result.reason : '').toBe(true);
};

const reregister = async (page: Page) => {
  await page.evaluate(() => {
    const host = document.querySelector('app-button')!;
    const cmp = (window as unknown as { ng: { getComponent: (el: Element) => ButtonPageCmp } }).ng.getComponent(host);
    cmp.ionViewDidEnter();
  });
};

const appendFixtures = async (page: Page, markup: string) => {
  await page.evaluate((html) => {
    document.querySelector('#ios26-button-motion-fixture')?.remove();
    const host = document.querySelector('app-button');
    if (!host) throw new Error('app-button not found');
    const wrap = document.createElement('div');
    wrap.id = 'ios26-button-motion-fixture';
    wrap.style.cssText =
      'position:fixed;top:120px;left:16px;right:16px;z-index:10000;padding:12px;display:flex;flex-wrap:wrap;gap:12px;background:rgba(255,255,255,0.96);';
    wrap.innerHTML = html;
    host.appendChild(wrap);
  }, markup);
  await expect.poll(() => page.locator('#ios26-button-motion-fixture ion-button:not(.hydrated)').count()).toBe(0);
  await reregister(page);
};

const waitButtonReady = async (button: Locator) => {
  await expect(button).toBeVisible();
  await button.evaluate(async (el) => {
    const host = el as HTMLElement & { componentOnReady?: () => Promise<unknown> };
    await host.componentOnReady?.();
  });
  await expect.poll(async () => button.evaluate((el) => el.classList.contains('hydrated'))).toBe(true);
  await expect.poll(async () => button.evaluate((el) => el.classList.contains('ios26-enable-gesture'))).toBe(true);
  await button.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
};

const surfaceScale = (button: Locator) =>
  button.evaluate((el) => {
    const native = el.shadowRoot?.querySelector<HTMLElement>('[part="native"]');
    if (!native) throw new Error('native part missing');
    return parseFloat(getComputedStyle(native).scale) || 1;
  });

const surfaceWidth = (button: Locator) =>
  button.evaluate((el) => {
    const native = el.shadowRoot?.querySelector<HTMLElement>('[part="native"]');
    if (!native) throw new Error('native part missing');
    return native.offsetWidth;
  });

const hostBox = async (button: Locator) => {
  const box = await button.boundingBox();
  if (!box) throw new Error('button has no box');
  return box;
};

const pointerHold = async (page: Page, button: Locator, ms: number) => {
  const box = await hostBox(button);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
};

test.describe('iOS26 ion-button motion candidate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/main/index/button', { waitUntil: 'networkidle' });
    await expect(page.locator('app-button')).toBeVisible();
    await buttonPage(page);
  });

  for (const width of WIDTHS) {
    test(`held ${width}pt expands by (width+16)/width and keeps host geometry`, async ({ page }) => {
      await appendFixtures(
        page,
        `<ion-button id="w${width}" mode="ios" fill="default" style="width:${width}px;min-width:${width}px;margin:0;">Go</ion-button>`,
      );
      const button = page.locator(`#w${width}`);
      await waitButtonReady(button);
      const restW = await surfaceWidth(button);
      expect(restW).toBeCloseTo(width, 0);
      const before = await hostBox(button);
      const expected = (restW + 16) / restW;

      await pointerHold(page, button, 420);
      await expect.poll(async () => surfaceScale(button), { timeout: 2000 }).toBeCloseTo(expected, 2);
      const heldHost = await hostBox(button);
      expect(heldHost.width).toBeCloseTo(before.width, 1);
      expect(heldHost.height).toBeCloseTo(before.height, 1);
      expect(await surfaceWidth(button)).toBeCloseTo(restW, 1);

      await page.mouse.up();
      await expect.poll(async () => surfaceScale(button), { timeout: 2000 }).toBeCloseTo(1, 2);
    });
  }

  test('short tap fires exactly one click', async ({ page }) => {
    await appendFixtures(page, `<ion-button id="tap" mode="ios" fill="default">Tap</ion-button>`);
    const button = page.locator('#tap');
    await waitButtonReady(button);
    await button.evaluate((el) => {
      el.dataset['clicks'] = '0';
      el.addEventListener('click', () => {
        el.dataset['clicks'] = String(Number(el.dataset['clicks'] ?? '0') + 1);
      });
    });
    await button.tap();
    await expect(button).toHaveAttribute('data-clicks', '1');
    await expect.poll(async () => surfaceScale(button)).toBeCloseTo(1, 2);
  });

  test('disabled button does not animate', async ({ page }) => {
    await appendFixtures(page, `<ion-button id="dis" mode="ios" fill="default" disabled>Off</ion-button>`);
    const button = page.locator('#dis');
    await waitButtonReady(button);
    await pointerHold(page, button, 300);
    expect(await surfaceScale(button)).toBeCloseTo(1, 3);
    await page.mouse.up();
  });

  test('dark activated border does not abort the held or released spring', async ({ page }) => {
    await page.evaluate(() => document.documentElement.classList.add('ion-palette-dark'));
    await appendFixtures(page, '<ion-button id="dark-motion" mode="ios" fill="default" style="width:140px;margin:0">Glass</ion-button>');
    const button = page.locator('#dark-motion');
    await waitButtonReady(button);
    await pointerHold(page, button, 250);
    await expect(button).toHaveClass(/ios26-animated/);
    expect(await surfaceScale(button)).toBeGreaterThan(1.08);
    await page.mouse.up();
    await page.waitForTimeout(40);
    await expect(button).toHaveClass(/ios26-animated/);
    expect(await surfaceScale(button)).toBeGreaterThan(1.03);
    await expect.poll(() => surfaceScale(button)).toBeCloseTo(1, 2);
  });

  test('pointer cancel and window blur abort without lingering scale', async ({ page }) => {
    await appendFixtures(page, `<ion-button id="abort" mode="ios" fill="default">Abort</ion-button>`);
    const button = page.locator('#abort');
    await waitButtonReady(button);

    await pointerHold(page, button, 120);
    await expect.poll(async () => surfaceScale(button)).toBeGreaterThan(1.02);
    await page.evaluate(() => {
      document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, cancelable: true }));
    });
    await expect.poll(async () => surfaceScale(button)).toBeCloseTo(1, 2);

    await page.mouse.up();
    await pointerHold(page, button, 120);
    await expect.poll(async () => surfaceScale(button)).toBeGreaterThan(1.02);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(async () => surfaceScale(button)).toBeCloseTo(1, 2);
    await page.mouse.up();
  });

  test('reduced motion still registers but never animates', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload({ waitUntil: 'networkidle' });
    await appendFixtures(page, `<ion-button id="reduce" mode="ios" fill="default">Reduce</ion-button>`);
    const button = page.locator('#reduce');
    await waitButtonReady(button);
    await pointerHold(page, button, 300);
    expect(await surfaceScale(button)).toBeCloseTo(1, 3);
    await page.mouse.up();
    await button.tap();
    expect(await surfaceScale(button)).toBeCloseTo(1, 3);
  });

  test('destroy and re-register do not duplicate gesture class', async ({ page }) => {
    const result = await page.evaluate(() => {
      const host = document.querySelector('app-button');
      const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => ButtonPageCmp } }).ng;
      if (!host || !ng?.getComponent) return { ok: false as const, reason: 'ng.getComponent unavailable' };
      const cmp = ng.getComponent(host);
      if (!cmp?.registeredGestures || !cmp.ionViewDidEnter) return { ok: false as const, reason: 'button page unavailable' };
      const count = () => host.querySelectorAll('.ios26-enable-gesture').length;
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
      return { ok: true as const, before, afterDestroy, afterRegister, afterDuplicateAttempt, afterReregister };
    });
    expect(result.ok, 'reason' in result ? result.reason : '').toBe(true);
    if (!result.ok) return;
    expect(result.before).toBeGreaterThan(0);
    expect(result.afterDestroy).toBe(0);
    expect(result.afterRegister).toBe(result.before);
    expect(result.afterDuplicateAttempt).toBe(result.afterRegister);
    expect(result.afterReregister).toBe(result.afterRegister);
  });

  test('submit click ownership stays with Ionic', async ({ page }) => {
    await appendFixtures(
      page,
      `<form id="motion-form"><ion-button id="submit" mode="ios" fill="solid" color="primary" type="submit">Save</ion-button></form>`,
    );
    const button = page.locator('#submit');
    await waitButtonReady(button);
    await page.evaluate(() => {
      const form = document.querySelector('#motion-form')!;
      const btn = document.querySelector('#submit')!;
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        form.dataset['submits'] = String(Number(form.dataset['submits'] ?? '0') + 1);
      });
      btn.addEventListener('click', () => {
        btn.dataset['clicks'] = String(Number(btn.dataset['clicks'] ?? '0') + 1);
      });
      form.dataset['submits'] = '0';
      btn.dataset['clicks'] = '0';
    });
    await button.tap();
    await expect(button).toHaveAttribute('data-clicks', '1');
    await expect(page.locator('#motion-form')).toHaveAttribute('data-submits', '1');
  });
});
