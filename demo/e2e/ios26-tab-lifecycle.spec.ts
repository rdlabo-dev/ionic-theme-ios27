import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 402, height: 874 }, hasTouch: true });

type TabsCmp = {
  registeredGestures: { destroy: () => void }[];
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

/** Exercise the existing page lifecycle, without a test-only registration API. */
const registerViaTabs = async (page: Page, selector: string) => {
  return page.evaluate((sel) => {
    const host = document.querySelector('app-tabs');
    const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => TabsCmp } }).ng;
    const cmp = host && ng?.getComponent ? ng.getComponent(host) : null;
    if (!cmp?.ionViewDidEnter || !cmp.registeredGestures) {
      return { ok: false as const, reason: 'tabs component unavailable', registered: false as const };
    }
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return { ok: false as const, reason: 'target missing', registered: false as const };
    const before = cmp.registeredGestures.length;
    cmp.ionViewDidEnter();
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

const appendFixtureBar = async (
  page: Page,
  id: string,
  opts?: { disabledSecond?: boolean; optOutClass?: string; count?: number; withFab?: boolean },
) => {
  await page.evaluate(
    ({ barId, disabledSecond, optOutClass, count, withFab, cssDriven }) => {
      document.querySelector(`#${barId}`)?.remove();
      const app = document.querySelector('app-tabs')!;
      const bar = document.createElement('ion-tab-bar') as HTMLElement & { selectedTab?: string };
      bar.id = barId;
      bar.classList.add('ios');
      bar.setAttribute('mode', 'ios');
      bar.style.cssText = 'position:fixed;left:12px;right:12px;top:120px;z-index:10000;';
      if (cssDriven) {
        bar.slot = 'bottom';
        bar.style.cssText = 'position:fixed;top:120px;bottom:auto;z-index:10000;';
      }
      if (optOutClass) bar.classList.add(optOutClass);
      bar.innerHTML = ['one', 'two', 'three', 'four', 'five']
        .slice(0, count)
        .map((tab, index) => {
          const disabled = disabledSecond && index === 1;
          return `<ion-tab-button class="ios${disabled ? ' tab-disabled' : ''}" tab="${tab}" mode="ios"${disabled ? ' disabled' : ''}>${tab[0].toUpperCase() + tab.slice(1)}</ion-tab-button>`;
        })
        .join('');
      bar.selectedTab = 'one';
      bar.addEventListener('ionTabButtonClick', ((event: CustomEvent<{ tab: string }>) => {
        bar.selectedTab = event.detail.tab;
      }) as EventListener);
      app.appendChild(bar);
      if (withFab) {
        const fab = document.createElement('ion-fab');
        fab.id = `${barId}-fab`;
        fab.setAttribute('mode', 'ios');
        fab.setAttribute('vertical', 'bottom');
        fab.setAttribute('horizontal', 'end');
        fab.style.cssText = 'position:fixed;top:120px;bottom:auto;z-index:10001;';
        fab.innerHTML = '<ion-fab-button mode="ios" aria-label="Search"></ion-fab-button>';
        app.append(fab);
      }
    },
    {
      barId: id,
      disabledSecond: !!opts?.disabledSecond,
      optOutClass: opts?.optOutClass ?? '',
      count: opts?.count ?? 3,
      withFab: !!opts?.withFab,
      cssDriven: opts?.count !== undefined,
    },
  );
  const bar = page.locator(`#${id}`);
  await waitHydrated(bar);
  if (opts?.withFab) await waitHydrated(page.locator(`#${id}-fab`));
  return bar;
};

test.describe('iOS26 tab gesture lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/main/index', { waitUntil: 'networkidle' });
    // Desktop Safari with touch is detected as iPad by Ionic. The 402pt fixture
    // represents an iPhone; select the intended platform before comparing sizes.
    await page.evaluate(() => {
      document.documentElement.classList.remove('plt-ipad');
      document.documentElement.classList.add('plt-iphone');
    });
    const bar = page.locator('ion-tab-bar#tab-bar-bottom');
    await waitHydrated(bar);
    await expect(bar).toHaveClass(/ios26-enable-gesture/);
    await expect(clones(page)).toHaveCount(1);
    expect(await getTabsComponent(page)).toBe(true);
  });

  test('Ionic background overrides survive selection effects', async ({ page }) => {
    const bar = await appendFixtureBar(page, 'tab-background');
    await registerViaTabs(page, '#tab-background');
    const buttons = bar.locator('ion-tab-button');
    await bar.evaluate((el) => {
      el.style.setProperty('--background', 'rgb(30, 60, 90)');
      el.querySelectorAll('ion-tab-button').forEach((button) => button.style.setProperty('--background', 'rgb(90, 60, 30)'));
    });
    for (const dark of [false, true]) {
      await page.evaluate((dark) => document.documentElement.classList.toggle('ion-palette-dark', dark), dark);
      expect(await bar.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(30, 60, 90)');
      await buttons.nth(dark ? 0 : 1).tap();
      await expect(bar).not.toHaveClass(/ios26-animated/);
      await expect(bar.locator('.tab-selected')).toHaveCSS('background-color', 'rgb(90, 60, 30)');
    }
  });

  // Native cell overlap is intentional. FAB placement comes from production CSS.
  for (const count of [1, 2, 3, 4, 5]) {
    test(`${count} tabs ${count < 5 ? 'with FAB' : 'without FAB'} retain geometry and selection`, async ({ page }) => {
      const id = `ios26-tabs-${count}`;
      const bar = await appendFixtureBar(page, id, { count, withFab: count < 5 });
      const registration = await registerViaTabs(page, `#${id}`);
      expect(registration.registered).toBe(true);
      const buttons = bar.locator('ion-tab-button');
      await expect(buttons).toHaveCount(count);
      const outer = (await bar.boundingBox())!;
      expect(outer.height).toBeCloseTo(62, 1);
      expect(outer.width).toBeCloseTo([102, 188, 274, 302, 360][count - 1], 1);
      const boxes = await Promise.all(Array.from({ length: count }, (_, index) => buttons.nth(index).boundingBox()));
      for (let index = 0; index < count; index++) {
        const box = boxes[index]!;
        expect(box.x).toBeGreaterThanOrEqual(outer.x + 3.9);
        expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width - 3.9);
        expect(box.height).toBeCloseTo(54, 1);
        if (index) expect(box.x).toBeGreaterThan(boxes[index - 1]!.x);
      }
      if (count < 5) {
        const fab = (await page.locator(`#${id}-fab`).boundingBox())!;
        expect(outer.x + outer.width).toBeLessThanOrEqual(fab.x);
      } else {
        await expect(page.locator(`#${id}-fab`)).toHaveCount(0);
      }
      await buttons.last().tap();
      await expect(buttons.last()).toHaveClass(/tab-selected/);
      await expect(bar.locator('.tab-selected')).toHaveCount(1);
      await expect(bar).not.toHaveClass(/ios26-animated/);
      await expect(bar.locator('.ion-activated, .ios26-tab-preview')).toHaveCount(0);
      if (registration.registered && 'index' in registration) await destroyRegisteredAt(page, registration.index);
      await expect(clones(page)).toHaveCount(1);
    });
  }

  // Layout safety across sizes matters; fractional native width discontinuities do not.
  for (const ipad of [false, true]) {
    for (const count of [4, 5]) {
      test(`${ipad ? 'iPad' : 'iPhone'} ${count}-tab cells fit narrow and roomy bars`, async ({ page }) => {
        await page.evaluate((ipad) => {
          document.documentElement.classList.toggle('plt-ipad', ipad);
          document.documentElement.classList.toggle('plt-iphone', !ipad);
        }, ipad);
        const bar = await appendFixtureBar(page, 'tab-width', { count });
        for (const width of [218, 360]) {
          await bar.evaluate((el, width) => {
            el.style.width = `${width - 8}px`;
            el.style.maxWidth = 'none';
          }, width);
          const outer = (await bar.boundingBox())!;
          const cells = await Promise.all((await bar.locator('ion-tab-button').all()).map((button) => button.boundingBox()));
          for (const [index, cell] of cells.entries()) {
            expect(cell!.width).toBeGreaterThanOrEqual(44);
            expect(cell!.width).toBeCloseTo(cells[0]!.width, 1);
            expect(cell!.x).toBeGreaterThanOrEqual(outer.x + 3.9);
            expect(cell!.x + cell!.width).toBeLessThanOrEqual(outer.x + outer.width - 3.9);
            if (index) expect(cell!.x).toBeGreaterThan(cells[index - 1]!.x);
          }
        }
        if (ipad) {
          await bar.evaluate((el) => {
            el.style.width = '500px';
            el.style.removeProperty('max-width');
          });
          expect((await bar.boundingBox())!.width).toBe(count === 4 ? 336 : 414);
        }
      });
    }
  }

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
    await expect(bar).not.toHaveClass(/ios26-animated/);
    await expect(clones(page)).toHaveCSS('display', 'none');
  });

  test('real routing settles the lens at the clicked tab, not the previous selection', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const target = page.locator('#tab-bar-bottom ion-tab-button[tab="docs"]');
    await target.click();
    await expect(page).toHaveURL(/\/main\/docs/);
    const end = await target.evaluate(async (target) => {
      const bar = target.parentElement!;
      const lens = document.querySelector<HTMLElement>('body > ion-tab-button.ion-cloned-element')!;
      const animations = [...lens.getAnimations(), ...bar.getAnimations()];
      if (!animations.length) throw new Error('Expected the tab selection animation');
      // Inspect convergence without sleeping through it or replaying native frame samples.
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = Number(animation.effect!.getComputedTiming().duration) - 1;
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const a = lens.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      animations.forEach((animation) => animation.play());
      return { dx: a.x + a.width / 2 - b.x - b.width / 2, width: b.width };
    });
    expect(Math.abs(end.dx)).toBeLessThan(end.width / 4);
    await expect(target).toHaveClass(/tab-selected/);
    await expect(page.locator('#tab-bar-bottom')).not.toHaveClass(/ios26-animated/);
  });

  test('real touch taps commit once per touch, including a rapid second tap', async ({ page }) => {
    const bar = await appendFixtureBar(page, 'ios26-tab-touch');
    expect((await registerViaTabs(page, '#ios26-tab-touch')).registered).toBe(true);
    await bar.evaluate((el) => {
      el.dataset['changes'] = '0';
      el.addEventListener('ionTabButtonClick', () => {
        el.dataset['changes'] = String(Number(el.dataset['changes']) + 1);
      });
    });
    for (const value of ['two', 'three']) {
      const target = bar.locator(`ion-tab-button[tab="${value}"]`);
      const rect = (await target.boundingBox())!;
      await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await expect(target).toHaveClass(/tab-selected/);
    }
    await expect(bar).toHaveAttribute('data-changes', '2');
    await expect(bar).not.toHaveClass(/ios26-animated/);
    await expect(bar).toHaveAttribute('data-changes', '2');
  });

  test('drag selects its destination once and keeps Ionic selection during the drag', async ({ page }) => {
    const bar = await appendFixtureBar(page, 'ios26-tab-drag');
    expect((await registerViaTabs(page, '#ios26-tab-drag')).registered).toBe(true);
    await bar.evaluate((el) => {
      el.dataset['changes'] = '0';
      el.addEventListener('ionTabButtonClick', () => {
        el.dataset['changes'] = String(Number(el.dataset['changes']) + 1);
      });
    });
    const first = bar.locator('ion-tab-button[tab="one"]');
    const last = bar.locator('ion-tab-button[tab="three"]');
    const a = (await first.boundingBox())!;
    const b = (await last.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await expect(first).toHaveClass(/tab-selected/);
    await expect(bar).toHaveAttribute('data-changes', '0');
    await page.mouse.up();
    await expect(last).toHaveClass(/tab-selected/);
    await expect(bar).toHaveAttribute('data-changes', '1');
    await expect(bar).not.toHaveClass(/ios26-animated/);
    await expect(bar).toHaveAttribute('data-changes', '1');
  });

  test('body lens uses viewport coordinates after scrolling and disappears on further scroll', async ({ page }) => {
    const bar = await appendFixtureBar(page, 'ios26-tab-scroll');
    expect((await registerViaTabs(page, '#ios26-tab-scroll')).registered).toBe(true);
    // ion-app establishes a containing block. This fixture specifically tests a
    // viewport-fixed bar, so move it outside that transformed app ancestor.
    await bar.evaluate((el) => document.body.append(el));
    await page.evaluate(() => {
      document.documentElement.style.cssText += ';overflow:auto;height:auto;';
      document.body.style.cssText += ';overflow:auto;height:2000px;position:static;';
      window.scrollTo(0, 300);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await bar.evaluate((el) => {
      el.style.top = '420px';
    });
    const first = bar.locator('ion-tab-button[tab="one"]');
    const rect = (await first.boundingBox())!;
    expect(rect.y).toBeGreaterThanOrEqual(0);
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await expect(bar).toHaveClass(/ios26-animated/);
    // Compare centers, not top-left corners: a held lens is larger than its cell.
    const offset = await bar.evaluate((el) => {
      const lens = Array.from(document.querySelectorAll('body > ion-tab-button.ion-cloned-element')).find(
        (node) => getComputedStyle(node).display !== 'none',
      )!;
      const a = lens.getBoundingClientRect();
      const b = el.querySelector('ion-tab-button')!.getBoundingClientRect();
      return {
        position: getComputedStyle(lens).position,
        dx: a.x + a.width / 2 - b.x - b.width / 2,
        dy: a.y + a.height / 2 - b.y - b.height / 2,
      };
    });
    expect(offset.position).toBe('fixed');
    expect(Math.abs(offset.dx)).toBeLessThan(1);
    expect(Math.abs(offset.dy)).toBeLessThan(1);
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect(bar).not.toHaveClass(/ios26-animated/);
    await page.mouse.move(8, 8);
    await page.mouse.up();
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
