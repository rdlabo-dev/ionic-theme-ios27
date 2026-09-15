import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 402, height: 874 }, hasTouch: true });

type TabsCmp = {
  registeredGestures: { destroy: () => void }[];
  registerEffects: (targets: Iterable<HTMLElement>) => void;
  ionViewDidEnter: () => void;
};

const clones = (page: Page) => page.locator('body > ion-tab-button.ion-cloned-element');

const waitHydrated = async (root: Locator) => {
  await expect(root).toBeVisible();
  await root.evaluate(async (el) => {
    const nodes = [el, ...Array.from(el.querySelectorAll('*'))] as Array<HTMLElement & { componentOnReady?: () => Promise<unknown> }>;
    await Promise.all(nodes.map((node) => node.componentOnReady?.() ?? Promise.resolve()));
  });
  await expect.poll(async () => root.evaluate((el) => el.classList.contains('hydrated'))).toBe(true);
};

const getTabsComponent = async (page: Page) => {
  return page.evaluate(() => {
    const host = document.querySelector('app-tabs');
    const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => TabsCmp } }).ng;
    if (!host || !ng?.getComponent) return null;
    return !!ng.getComponent(host);
  });
};

/** Register via TabsPage.registerEffects; returns whether a new handle was pushed. */
const registerViaTabs = async (page: Page, selector: string) => {
  return page.evaluate((sel) => {
    const host = document.querySelector('app-tabs');
    const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => TabsCmp } }).ng;
    const cmp = host && ng?.getComponent ? ng.getComponent(host) : null;
    if (!cmp?.registerEffects || !cmp.registeredGestures) {
      return { ok: false as const, reason: 'tabs component unavailable', registered: false as const };
    }
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return { ok: false as const, reason: 'target missing', registered: false as const };
    const before = cmp.registeredGestures.length;
    cmp.registerEffects([el]);
    const after = cmp.registeredGestures.length;
    if (after <= before) {
      return { ok: true as const, registered: false as const };
    }
    return { ok: true as const, registered: true as const, index: after - 1 };
  }, selector);
};

const destroyRegisteredAt = async (page: Page, index: number) => {
  await page.evaluate((i) => {
    const host = document.querySelector('app-tabs');
    const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => TabsCmp } }).ng;
    const cmp = host && ng?.getComponent ? ng.getComponent(host) : null;
    const handle = cmp?.registeredGestures?.[i];
    handle?.destroy();
    if (cmp?.registeredGestures && i >= 0 && i < cmp.registeredGestures.length) {
      cmp.registeredGestures.splice(i, 1);
    }
  }, index);
};

const appendFixtureBar = async (page: Page, id: string, opts?: { disabledSecond?: boolean; optOutClass?: string }) => {
  await page.evaluate(
    ({ barId, disabledSecond, optOutClass }) => {
      document.querySelector(`#${barId}`)?.remove();
      const app = document.querySelector('ion-app') ?? document.body;
      const bar = document.createElement('ion-tab-bar') as HTMLElement & { selectedTab?: string };
      bar.id = barId;
      bar.classList.add('ios');
      bar.setAttribute('mode', 'ios');
      bar.style.cssText = 'position:fixed;left:12px;right:12px;top:120px;z-index:10000;';
      if (optOutClass) bar.classList.add(optOutClass);
      bar.innerHTML = `
        <ion-tab-button class="ios" tab="one" mode="ios">One</ion-tab-button>
        <ion-tab-button class="ios${disabledSecond ? ' tab-disabled' : ''}" tab="two" mode="ios"${disabledSecond ? ' disabled' : ''}>Two</ion-tab-button>
        <ion-tab-button class="ios" tab="three" mode="ios">Three</ion-tab-button>
      `;
      bar.selectedTab = 'one';
      bar.addEventListener('ionTabButtonClick', ((event: CustomEvent<{ tab: string }>) => {
        bar.selectedTab = event.detail.tab;
      }) as EventListener);
      app.appendChild(bar);
    },
    { barId: id, disabledSecond: !!opts?.disabledSecond, optOutClass: opts?.optOutClass ?? '' },
  );
  const bar = page.locator(`#${id}`);
  await waitHydrated(bar);
  return bar;
};

test.describe('iOS26 tab gesture lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/main/index', { waitUntil: 'networkidle' });
    const bar = page.locator('ion-tab-bar#tab-bar-bottom');
    await waitHydrated(bar);
    await expect(bar).toHaveClass(/ios26-enable-gesture/);
    await expect(clones(page)).toHaveCount(1);
    expect(await getTabsComponent(page)).toBe(true);
  });

  test('tap commits selection with a single click', async ({ page }) => {
    const bar = page.locator('ion-tab-bar#tab-bar-bottom');
    const target = bar.locator('ion-tab-button[tab="docs"]');
    await target.evaluate((el) => {
      el.dataset['clicks'] = '0';
      el.addEventListener('click', () => {
        el.dataset['clicks'] = String(Number(el.dataset['clicks'] ?? '0') + 1);
      });
    });
    const box = (await target.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect(target).toHaveClass(/tab-selected/);
    await expect.poll(async () => Number(await target.getAttribute('data-clicks'))).toBe(1);
    await page.waitForTimeout(300);
    expect(Number(await target.getAttribute('data-clicks'))).toBe(1);
  });

  test('pointercancel restores selection and never commits a click', async ({ page }) => {
    const bar = page.locator('ion-tab-bar#tab-bar-bottom');
    const first = bar.locator('ion-tab-button[tab="index"]');
    const second = bar.locator('ion-tab-button[tab="docs"]');
    await expect(first).toHaveClass(/tab-selected/);
    await second.evaluate((el) => {
      el.dataset['clicks'] = '0';
      el.addEventListener('click', () => {
        el.dataset['clicks'] = String(Number(el.dataset['clicks'] ?? '0') + 1);
      });
    });
    const box = (await second.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(bar).toHaveClass(/ios26-animated/);
    await page.evaluate(() => {
      document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true, pointerId: 1 }));
    });
    // Release away from the tab so Playwright does not synthesize a click on the cancelled target.
    await page.mouse.move(8, 8);
    await page.mouse.up();
    await page.waitForTimeout(250);
    await expect(first).toHaveClass(/tab-selected/);
    await expect(second).not.toHaveClass(/tab-selected/);
    await expect(second).toHaveAttribute('data-clicks', '0');
    await expect(bar.locator('.ion-activated')).toHaveCount(0);
  });

  test('duplicate registerEffect is a no-op', async ({ page }) => {
    const result = await page.evaluate(() => {
      const host = document.querySelector('app-tabs');
      const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => TabsCmp } }).ng;
      const cmp = host && ng?.getComponent ? ng.getComponent(host) : null;
      if (!cmp?.registeredGestures || !cmp.ionViewDidEnter) {
        return { ok: false as const, reason: 'tabs component unavailable' };
      }
      const beforeClones = document.querySelectorAll('body > ion-tab-button.ion-cloned-element').length;
      const beforeGestures = cmp.registeredGestures.length;
      const beforeClass = document.querySelector('ion-tab-bar')?.classList.contains('ios26-enable-gesture') ?? false;
      cmp.ionViewDidEnter();
      const afterClones = document.querySelectorAll('body > ion-tab-button.ion-cloned-element').length;
      const afterGestures = cmp.registeredGestures.length;
      const afterClass = document.querySelector('ion-tab-bar')?.classList.contains('ios26-enable-gesture') ?? false;
      return { ok: true as const, beforeClones, afterClones, beforeGestures, afterGestures, beforeClass, afterClass };
    });
    expect(result.ok, 'reason' in result ? result.reason : '').toBe(true);
    if (!result.ok) return;
    expect(result.beforeClass).toBe(true);
    expect(result.afterClass).toBe(true);
    expect(result.afterClones).toBe(result.beforeClones);
    // ionViewDidEnter pushes only when register returns a handle; duplicate must not add another.
    expect(result.afterGestures).toBe(result.beforeGestures);
  });

  test('two bars own independent clones', async ({ page }) => {
    const fixture = await appendFixtureBar(page, 'ios26-tab-lifecycle-bar-b');
    const result = await registerViaTabs(page, '#ios26-tab-lifecycle-bar-b');
    expect(result.ok, 'reason' in result ? result.reason : '').toBe(true);
    if (!result.ok) return;
    expect(result.registered).toBe(true);
    const clonesState = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('body > ion-tab-button.ion-cloned-element'));
      const second = document.querySelector<HTMLElement>('#ios26-tab-lifecycle-bar-b');
      return {
        count: nodes.length,
        distinct: new Set(nodes).size,
        secondHasGesture: second?.classList.contains('ios26-enable-gesture') ?? false,
      };
    });
    expect(clonesState.count).toBe(2);
    expect(clonesState.distinct).toBe(2);
    expect(clonesState.secondHasGesture).toBe(true);
    await expect(fixture).toHaveClass(/ios26-enable-gesture/);
    await expect(clones(page)).toHaveCount(2);
    if ('index' in result && typeof result.index === 'number') {
      await destroyRegisteredAt(page, result.index);
    }
    await expect(clones(page)).toHaveCount(1);
  });

  test('disabled tab does not take selection', async ({ page }) => {
    // Tear down the shell bar so the fixture owns the only gesture under test.
    await page.evaluate(() => {
      const host = document.querySelector('app-tabs');
      const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => TabsCmp } }).ng;
      const cmp = host && ng?.getComponent ? ng.getComponent(host) : null;
      cmp?.registeredGestures?.forEach((gesture) => gesture.destroy());
      if (cmp?.registeredGestures) cmp.registeredGestures.length = 0;
    });
    const bar = await appendFixtureBar(page, 'ios26-tab-lifecycle-disabled', { disabledSecond: true });
    const registered = await registerViaTabs(page, '#ios26-tab-lifecycle-disabled');
    expect(registered.ok, 'reason' in registered ? registered.reason : '').toBe(true);
    expect(registered.registered).toBe(true);
    await expect(bar).toHaveClass(/ios26-enable-gesture/);
    const first = bar.locator('ion-tab-button[tab="one"]');
    const disabled = bar.locator('ion-tab-button[tab="two"]');
    await disabled.click({ force: true });
    await expect(first).toHaveClass(/tab-selected/);
    await expect(disabled).not.toHaveClass(/tab-selected/);
    await expect(bar.locator('.ion-activated')).toHaveCount(0);
  });

  test('opt-out and reduced-motion skip registration', async ({ page }) => {
    for (const optOut of ['ios-theme-disabled', 'ios26-disabled'] as const) {
      const bar = await appendFixtureBar(page, `ios26-tab-lifecycle-${optOut}`, { optOutClass: optOut });
      const registered = await registerViaTabs(page, `#ios26-tab-lifecycle-${optOut}`);
      expect(registered.ok, 'reason' in registered ? registered.reason : '').toBe(true);
      expect(registered.registered).toBe(false);
      await expect(bar).not.toHaveClass(/ios26-enable-gesture/);
    }

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await appendFixtureBar(page, 'ios26-tab-lifecycle-reduced');
    const registered = await registerViaTabs(page, '#ios26-tab-lifecycle-reduced');
    expect(registered.ok, 'reason' in registered ? registered.reason : '').toBe(true);
    expect(registered.registered).toBe(false);
    await expect(reduced).not.toHaveClass(/ios26-enable-gesture/);
  });

  test('repeated destroy removes the clone and does not leak listeners', async ({ page }) => {
    const before = await clones(page).count();
    expect(before).toBe(1);
    const result = await page.evaluate(() => {
      const host = document.querySelector('app-tabs');
      const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => TabsCmp } }).ng;
      const cmp = host && ng?.getComponent ? ng.getComponent(host) : null;
      if (!cmp?.registeredGestures?.length) return { ok: false as const, reason: 'no registered gesture' };
      const handle = cmp.registeredGestures[0];
      handle.destroy();
      handle.destroy();
      handle.destroy();
      cmp.registeredGestures.length = 0;
      return {
        ok: true as const,
        clones: document.querySelectorAll('body > ion-tab-button.ion-cloned-element').length,
        hasGesture: document.querySelector('ion-tab-bar')?.classList.contains('ios26-enable-gesture') ?? false,
      };
    });
    expect(result.ok, 'reason' in result ? result.reason : '').toBe(true);
    if (!result.ok) return;
    expect(result.clones).toBe(0);
    expect(result.hasGesture).toBe(false);
    await expect(clones(page)).toHaveCount(0);
  });

  test('destroy during press prevents later commit callbacks', async ({ page }) => {
    const bar = page.locator('ion-tab-bar#tab-bar-bottom');
    const first = bar.locator('ion-tab-button[tab="index"]');
    const second = bar.locator('ion-tab-button[tab="docs"]');
    await expect(first).toHaveClass(/tab-selected/);
    await second.evaluate((el) => {
      el.dataset['clicks'] = '0';
      el.addEventListener('click', () => {
        el.dataset['clicks'] = String(Number(el.dataset['clicks'] ?? '0') + 1);
      });
    });
    const box = (await second.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(bar).toHaveClass(/ios26-animated/);
    await page.evaluate(() => {
      const host = document.querySelector('app-tabs');
      const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => TabsCmp } }).ng;
      const cmp = host && ng?.getComponent ? ng.getComponent(host) : null;
      cmp?.registeredGestures?.forEach((gesture) => gesture.destroy());
      if (cmp?.registeredGestures) cmp.registeredGestures.length = 0;
    });
    await page.mouse.move(8, 8);
    await page.mouse.up();
    await page.waitForTimeout(400);
    await expect(first).toHaveClass(/tab-selected/);
    await expect(second).not.toHaveClass(/tab-selected/);
    await expect(second).toHaveAttribute('data-clicks', '0');
    await expect(bar).not.toHaveClass(/ios26-enable-gesture|ios26-animated/);
    await expect(clones(page)).toHaveCount(0);
  });
});
