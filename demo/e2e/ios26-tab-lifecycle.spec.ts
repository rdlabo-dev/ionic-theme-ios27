import { expect, test, type Locator, type Page } from '@playwright/test';
import widthFixture from '../native-parity/fixtures/tabs-width-ios26.json';

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

const appendFixtureBar = async (
  page: Page,
  id: string,
  opts?: { disabledSecond?: boolean; optOutClass?: string; count?: number; withFab?: boolean },
) => {
  await page.evaluate(
    ({ barId, disabledSecond, optOutClass, count, withFab, cssDriven }) => {
      document.querySelector(`#${barId}`)?.remove();
      const app = document.querySelector('ion-app') ?? document.body;
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
    const bar = page.locator('ion-tab-bar#tab-bar-bottom');
    await waitHydrated(bar);
    await expect(bar).toHaveClass(/ios26-enable-gesture/);
    await expect(clones(page)).toHaveCount(1);
    expect(await getTabsComponent(page)).toBe(true);
  });

  // Cursor Auto supplied the fixture/ownership outline. Native cell overlap is
  // allowed for every count; FAB placement must come from production CSS.
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
      if (count <= 3) expect(outer.width).toBeCloseTo([102, 188, 274][count - 1], 1);
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

  for (const count of [1, 2, 3, 4, 5]) {
    test(`measured ${count}-tab native cell geometry matches width fixtures`, async ({ page }) => {
      const bar = await appendFixtureBar(page, `ios26-tab-width-${count}`, { count });
      for (const entry of widthFixture.cases.filter((c) => c.count === count)) {
        await bar.evaluate((el, outerWidth) => {
          el.style.width = `${outerWidth - 8}px`;
          el.style.maxWidth = 'none';
        }, entry.outerWidth);
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        const rects = await bar.evaluate((el) => {
          const origin = el.getBoundingClientRect();
          return Array.from(el.children)
            .filter((node): node is HTMLElement => node.matches('ion-tab-button'))
            .map((button) => {
              const native = button.shadowRoot?.querySelector('[part="native"]');
              if (!native) throw new Error('native part missing');
              const rect = native.getBoundingClientRect();
              return [rect.x - origin.x, rect.y - origin.y, rect.width, rect.height];
            });
        });
        expect(rects.length).toBe(entry.cells.length);
        for (let index = 0; index < entry.cells.length; index++) {
          for (let column = 0; column < 4; column++) {
            expect(
              Math.abs(rects[index][column] - entry.cells[index][column]),
              `${count} tabs, outer ${entry.outerWidth}, cell ${index}, coordinate ${column}`,
            ).toBeLessThanOrEqual(0.05);
          }
        }
      }
    });
  }

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
    // Cursor Auto's suggested ownership regression: a visual preview must not
    // remove Ionic's selection before the real browser click.
    await expect(bar.locator('ion-tab-button[tab="index"]')).toHaveClass(/tab-selected/);
    await expect(target).not.toHaveClass(/tab-selected/);
    await expect(target).toHaveAttribute('data-clicks', '0');
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
    await expect(bar).not.toHaveClass(/ios26-animated/);
    await expect(clones(page)).toHaveCSS('display', 'none');
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

  test('a second queued pointerdown flushes the first released session', async ({ page }) => {
    const bar = await appendFixtureBar(page, 'ios26-tab-queued');
    expect((await registerViaTabs(page, '#ios26-tab-queued')).registered).toBe(true);
    await bar.evaluate((el) => {
      el.dataset['changes'] = '0';
      el.addEventListener('ionTabButtonClick', () => {
        el.dataset['changes'] = String(Number(el.dataset['changes']) + 1);
      });
      for (const [index, value] of ['two', 'three'].entries()) {
        const target = el.querySelector(`ion-tab-button[tab="${value}"]`)!;
        const rect = target.getBoundingClientRect();
        const init = {
          bubbles: true,
          composed: true,
          isPrimary: true,
          pointerId: index + 20,
          pointerType: 'touch',
          button: 0,
          clientX: rect.x + rect.width / 2,
          clientY: rect.y + rect.height / 2,
        };
        target.dispatchEvent(new PointerEvent('pointerdown', init));
        target.dispatchEvent(new PointerEvent('pointerup', init));
      }
    });
    await expect(bar.locator('ion-tab-button[tab="three"]')).toHaveClass(/tab-selected/);
    await expect(bar).toHaveAttribute('data-changes', '2');
    await expect(bar).not.toHaveClass(/ios26-animated/);
    await expect(bar).toHaveAttribute('data-changes', '2');
  });

  for (const reason of ['blur', 'resize', 'native', 'reduced-motion'] as const) {
    test(`${reason} during hold cancels only the visual effect`, async ({ page }) => {
      const bar = page.locator('#tab-bar-bottom');
      const second = bar.locator('ion-tab-button[tab="docs"]');
      const box = (await second.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect(bar).toHaveClass(/ios26-animated/);
      await expect(bar.locator('ion-tab-button[tab="index"]')).toHaveClass(/tab-selected/);
      if (reason === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'reduce' });
      else if (reason === 'native') await bar.evaluate((el) => el.setAttribute('data-native-ui-shell', ''));
      else await page.evaluate((event) => window.dispatchEvent(new Event(event)), reason);
      await expect(bar).not.toHaveClass(/ios26-animated/);
      await expect(clones(page)).toHaveCSS('display', 'none');
      await page.mouse.move(8, 8);
      await page.mouse.up();
      await expect(bar.locator('ion-tab-button[tab="index"]')).toHaveClass(/tab-selected/);
      await expect(second).not.toHaveClass(/tab-selected/);
    });
  }

  test('measured three-item geometry and additive held expansion', async ({ page }) => {
    const bar = await appendFixtureBar(page, 'ios26-tab-geometry');
    await bar.evaluate((el) => {
      el.style.width = '266px';
      el.style.right = 'auto';
    });
    expect((await registerViaTabs(page, '#ios26-tab-geometry')).registered).toBe(true);
    const first = bar.locator('ion-tab-button[tab="one"]');
    const second = bar.locator('ion-tab-button[tab="two"]');
    const outer = (await bar.boundingBox())!;
    const initial = (await first.boundingBox())!;
    const target = (await second.boundingBox())!;
    expect(outer.width).toBeCloseTo(274, 1);
    expect(outer.height).toBeCloseTo(62, 1);
    expect(initial.width).toBeCloseTo(94, 1);
    expect(initial.height).toBeCloseTo(54, 1);
    expect(target.x - initial.x).toBeCloseTo(86, 1);
    // Use a selected-item hold here. Transferring to a different item is still
    // rebounding at 700ms and must not be asserted as an already-settled lens.
    await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
    await page.mouse.down();
    await bar.evaluate((el) => {
      const lens = Array.from(document.querySelectorAll('body > ion-tab-button.ion-cloned-element')).find(
        (node) => getComputedStyle(node).display !== 'none',
      )!;
      for (const animation of [...el.getAnimations(), ...lens.getAnimations()]) {
        animation.pause();
        animation.currentTime = 700;
      }
    });
    const held = await bar.evaluate((el) => {
      const lens = Array.from(document.querySelectorAll('body > ion-tab-button.ion-cloned-element')).find(
        (node) => getComputedStyle(node).display !== 'none',
      )!;
      const a = el.getBoundingClientRect();
      const b = lens.getBoundingClientRect();
      const target = el.querySelector('ion-tab-button[tab="one"]')!.getBoundingClientRect();
      return {
        barWidth: a.width,
        width: b.width / (a.width / 274),
        height: b.height / (a.width / 274),
        dx: b.x + b.width / 2 - target.x - target.width / 2,
        dy: b.y + b.height / 2 - target.y - target.height / 2,
      };
    });
    expect(held.barWidth).toBeCloseTo(288.1379, 1);
    expect(held.width).toBeGreaterThan(109);
    expect(held.width).toBeLessThan(111);
    expect(held.height).toBeGreaterThan(69);
    expect(held.height).toBeLessThan(71);
    expect(Math.abs(held.dx)).toBeLessThan(0.3);
    expect(Math.abs(held.dy)).toBeLessThan(0.3);
    await page.mouse.up();
    await expect(first).toHaveClass(/tab-selected/);
    await expect(bar).not.toHaveClass(/ios26-animated/);
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
    expect((await registerViaTabs(page, '#ios26-tab-scroll')).registered).toBe(true);
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
