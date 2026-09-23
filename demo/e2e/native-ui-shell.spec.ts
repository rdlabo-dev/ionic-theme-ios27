import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { compile, NodePackageImporter } from 'sass';
import { resolve } from 'node:path';
import * as overlayTypes from '../src/app/overlay-types';

const importer = new NodePackageImporter(resolve(__dirname, '../../'));

const mockNative = async (page: Page, fail = false, foldableRail = true) => {
  await page.addInitScript(
    ({ fail, foldableRail }) => {
      const state = {
        updates: [] as any[],
        sequence: 0,
        delay: 0,
        hang: false,
        rejectInactiveSearch: false,
        rejectAllSearch: false,
        rejectControlLabel: '',
        activate: (_event: any) => {},
        search: (_event: any) => {},
        metrics: (_event: any) => {},
      };
      Object.assign(window, {
        __nativeUIShell: state,
        CapacitorCustomPlatform: { name: 'ios' },
        Capacitor: {
          PluginHeaders: [
            {
              name: 'IonicNativeUIShell',
              methods: [
                { name: 'configure', rtype: 'promise' },
                { name: 'getWebViewMetrics', rtype: 'promise' },
                { name: 'update', rtype: 'promise' },
                { name: 'clear', rtype: 'promise' },
                { name: 'addListener' },
                { name: 'removeListener' },
              ],
            },
          ],
          nativePromise: async (_plugin: string, method: string, options: any) => {
            if (method === 'configure') return { supported: true, foldableRail };
            if (method === 'getWebViewMetrics') return { radius: 0 };
            state.updates.push(method === 'clear' ? { ...options, controls: [] } : options);
            if (state.hang && method === 'update') await new Promise(() => {});
            if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
            if (fail && method === 'update' && options.controls.length) throw new Error('Test native failure');
            return {
              revision: options.revision,
              rejectedSearches:
                state.rejectInactiveSearch || state.rejectAllSearch
                  ? options.controls
                      ?.filter((control: any) => control.search && (state.rejectAllSearch || control.search.available === false))
                      .map((control: any) => control.id)
                  : [],
              rejectedControls: state.rejectControlLabel
                ? options.controls
                    ?.filter((control: any) => control.items.some((item: any) => item.accessibilityLabel === state.rejectControlLabel))
                    .map((control: any) => control.id)
                : [],
            };
          },
          nativeCallback: (_plugin: string, method: string, options: any, callback: (event: any) => void) => {
            if (method === 'addListener') {
              if (options.eventName === 'search') state.search = callback;
              else if (options.eventName === 'activate') state.activate = callback;
              else if (options.eventName === 'webViewMetricsChange') state.metrics = callback;
            }
            return 'shell-listener';
          },
        },
      });
    },
    { fail, foldableRail },
  );
};

const activate = (page: Page, label: string, duplicate = false) =>
  page.evaluate(
    ({ label, duplicate }) => {
      const state = (window as any).__nativeUIShell;
      const snapshot = state.updates.findLast((value: any) =>
        value.controls.some((control: any) => control.items.some((item: any) => item.label === label || item.accessibilityLabel === label)),
      );
      const item = snapshot.controls
        .flatMap((control: any) => control.items)
        .find((item: any) => item.label === label || item.accessibilityLabel === label);
      const event = { id: item.id, revision: snapshot.revision, sequence: ++state.sequence };
      state.activate(event);
      if (duplicate) state.activate(event);
    },
    { label, duplicate },
  );

test('FAB keeps a complete native batch across staggered lists and measures each button', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  await expect(page.locator('ion-fab[data-native-ui-shell]')).toHaveCount(4);
  const state = () =>
    page.evaluate(() => {
      const fab = document.querySelector('ion-fab[horizontal=center]')!;
      const controls = (window as any).__nativeUIShell.updates.at(-1).controls;
      return controls.find((c: any) => c.kind === 'ion-fab' && c.items.length === 7);
    });
  const closed = await state();
  expect(closed.items.filter((i: any) => i.visible)).toHaveLength(1);
  expect(closed.items.every((i: any) => i.icon && i.closeIcon)).toBe(true);
  await fab.locator(':scope > ion-fab-button').evaluate((b: HTMLIonFabButtonElement) => b.click());
  await expect.poll(async () => (await state()).items.filter((i: any) => i.visible).length).toBe(7);
  const opened = await state();
  expect(opened.items.map((i: any) => i.id)).toEqual(closed.items.map((i: any) => i.id));
  const rects = await fab.locator('ion-fab-button').evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().toJSON()));
  for (let index = 0; index < rects.length; index++) {
    for (const key of ['x', 'y', 'width', 'height']) expect(opened.items[index][key]).toBeCloseTo(rects[index][key], 1);
  }
  await fab.evaluate((f: HTMLIonFabElement) => f.close());
  await expect.poll(async () => (await state()).items.filter((i: any) => i.visible).length).toBe(1);
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
});

test('FAB activation stays with Ionic and rejects hidden, disabled and duplicate actions', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  await fab.evaluate((element) => {
    (window as any).__fabClicks = 0;
    element.querySelector('ion-fab-list ion-fab-button')!.addEventListener('click', () => (window as any).__fabClicks++);
  });
  await activate(page, 'Up action');
  expect(await page.evaluate(() => (window as any).__fabClicks)).toBe(0);
  await activate(page, 'Center FAB actions', true);
  await expect.poll(() => fab.evaluate((element: HTMLIonFabElement) => element.activated)).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__nativeUIShell.updates
            .at(-1)
            .controls.find((c: any) => c.kind === 'ion-fab' && c.items.length === 7)
            .items.filter((i: any) => i.visible).length,
      ),
    )
    .toBe(7);
  await activate(page, 'Up action', true);
  expect(await page.evaluate(() => (window as any).__fabClicks)).toBe(1);
  await expect.poll(() => fab.evaluate((element: HTMLIonFabElement) => element.activated)).toBe(false);
  await fab.locator(':scope > ion-fab-button').evaluate((element: HTMLIonFabButtonElement) => (element.disabled = true));
  await activate(page, 'Center FAB actions');
  await expect.poll(() => fab.evaluate((element: HTMLIonFabElement) => element.activated)).toBe(false);
});

test('FAB reverses during stagger, keeps its cover, and ignores late hidden actions', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  const evidence = await fab.evaluate(async (element: HTMLIonFabElement) => {
    const main = element.querySelector('ion-fab-button')!;
    const children = Array.from(element.querySelectorAll('ion-fab-list ion-fab-button')) as HTMLIonFabButtonElement[];
    const before = children.map((b) => b.show);
    main.click();
    // Four lists show their first child immediately; second children follow later.
    await new Promise((r) => setTimeout(r, 15));
    const during = children.map((b) => b.show);
    const covered = element.hasAttribute('data-native-ui-shell');
    main.click();
    await new Promise((r) => setTimeout(r, 100));
    return { before, during, after: children.map((b) => b.show), covered, active: element.activated };
  });
  expect(evidence.before.every((show) => !show)).toBe(true);
  expect(evidence.during.some(Boolean) && evidence.during.some((show) => !show)).toBe(true);
  expect(evidence.after.every((show) => !show)).toBe(true);
  expect(evidence.covered).toBe(true);
  expect(evidence.active).toBe(false);
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  await page.evaluate(() => ((window as any).__nativeUIShell.delay = 120));
  await fab.evaluate((element: HTMLIonFabElement) => (element.activated = true));
  await fab.evaluate((element: HTMLIonFabElement) => {
    element.style.display = 'none';
  });
  await expect(fab).not.toHaveAttribute('data-native-ui-shell');
  await page.waitForTimeout(200);
  await expect(fab).not.toHaveAttribute('data-native-ui-shell');
});

test('FAB restores excluded groups and follows icon, list and theme changes', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  const child = fab.locator('ion-fab-list ion-fab-button').first();
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  for (const name of ['ionic-theme-disabled', 'ios-theme-disabled', 'ios26-disabled', 'ios-theme-shell-disabled']) {
    await child.evaluate((b, name) => b.classList.add(name), name);
    await expect(fab).not.toHaveAttribute('data-native-ui-shell');
    await child.evaluate((b, name) => b.classList.remove(name), name);
    await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  }
  await child.evaluate((b: HTMLIonFabButtonElement) => (b.color = 'primary'));
  await expect(fab).not.toHaveAttribute('data-native-ui-shell');
  await child.evaluate((b: HTMLIonFabButtonElement) => (b.color = undefined));
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  await fab.evaluate((element: HTMLIonFabElement) => (element.activated = true));
  await child.locator('ion-icon:not([part=close-icon])').evaluate((icon: HTMLIonIconElement) => (icon.name = 'document'));
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  await child.evaluate((b) => b.remove());
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.kind === 'ion-fab' && c.items.length === 6)?.items
            .length,
      ),
    )
    .toBe(6);
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  await page.goto('/main/index/floating-action-button-fixed');
  await expect(page.locator('ion-fab[data-native-ui-shell]')).toHaveCount(0);
});

test('FAB keeps custom main and list button scales on the Web', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  for (const selector of [':scope > ion-fab-button', 'ion-fab-list ion-fab-button']) {
    const button = fab.locator(selector).first();
    if (selector.startsWith('ion-fab-list')) {
      await activate(page, 'Center FAB actions');
      await expect.poll(() => button.evaluate((b: HTMLIonFabButtonElement) => b.show)).toBe(true);
    }
    for (const scale of [1.25, 0.75]) {
      await button.evaluate((b, scale) => (b.style.transform = `scale(${scale})`), scale);
      await expect(fab).not.toHaveAttribute('data-native-ui-shell');
      await expect(button).toHaveCSS('transform', `matrix(${scale}, 0, 0, ${scale}, 0, 0)`);
      await button.evaluate((b) => (b.style.transform = ''));
      await expect(fab).toHaveAttribute('data-native-ui-shell', '');
    }
  }
  await fab.locator(':scope > ion-fab-button').evaluate((b) => (b.style.transform = 'scale(0)'));
  await expect(fab).not.toHaveAttribute('data-native-ui-shell');
});

test('FAB keeps custom container and list motion on the Web and recovers after removal', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  await page.addStyleTag({ content: '@keyframes fab-review-move { to { transform: translateY(40px); } }' });
  for (const target of [fab, fab.locator('ion-fab-list').first()]) {
    await target.evaluate((element) => (element.style.animation = 'fab-review-move 1s linear infinite alternate'));
    await expect(fab).not.toHaveAttribute('data-native-ui-shell');
    await target.evaluate((element) => (element.style.animation = ''));
    await expect(fab).toHaveAttribute('data-native-ui-shell', '');
    await target.evaluate((element) => (element.style.transition = 'transform 1s linear'));
    await expect(fab).not.toHaveAttribute('data-native-ui-shell');
    await target.evaluate((element) => (element.style.transition = ''));
    await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  }
  await activate(page, 'Center FAB actions');
  await expect.poll(() => fab.locator('ion-fab-list ion-fab-button.fab-button-show').count()).toBe(6);
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
});

test('FAB uses measured positions after RTL and viewport changes', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  for (const width of [402, 440]) {
    let rtlIcon = '';
    await page.setViewportSize({ width, height: 874 });
    for (const direction of ['rtl', 'ltr']) {
      await page.evaluate((direction) => (document.documentElement.dir = direction), direction);
      await fab.evaluate((element: HTMLIonFabElement) => (element.activated = true));
      await expect
        .poll(() =>
          page.evaluate(() => {
            const control = (window as any).__nativeUIShell.updates
              .at(-1)
              .controls.find((c: any) => c.kind === 'ion-fab' && c.items.length === 7);
            if (!control || control.rtl !== (document.documentElement.dir === 'rtl') || control.items.some((i: any) => !i.visible))
              return false;
            const buttons = Array.from(document.querySelector('ion-fab[horizontal=center]')!.querySelectorAll('ion-fab-button'));
            return buttons.every((b, index) => {
              const rect = b.getBoundingClientRect(),
                item = control.items[index];
              return Math.abs(rect.x - item.x) < 1 && Math.abs(rect.y - item.y) < 1 && Math.abs(rect.width - item.width) < 1;
            });
          }),
        )
        .toBe(true);
      const icon = await page.evaluate(
        () =>
          (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.kind === 'ion-fab' && c.items.length === 7).items[2]
            .icon,
      );
      if (direction === 'rtl') rtlIcon = icon;
      else expect(icon).not.toBe(rtlIcon);
    }
  }
});

test('unsupported search morph releases and restores a native fixed-slot FAB internally', async ({ page }) => {
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  await page.locator('app-album-page ion-searchbar').evaluate((bar) => bar.classList.add('searchbar-classic'));
  // Exercise the actual content fixed slot without changing the showcase layout.
  const fab = page.locator('app-album-page ion-fab');
  await fab.evaluate((element) => {
    element.querySelector('ion-fab-button')!.setAttribute('aria-label', 'Search albums');
    document.querySelector('app-album-page ion-content')!.append(element);
  });
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__nativeUIShell.updates
          .at(-1)
          .controls.some((c: any) => c.kind === 'ion-fab' && c.items.some((i: any) => i.accessibilityLabel === 'Search albums')),
      ),
    )
    .toBe(true);
  await activate(page, 'Search albums');
  await expect(fab).not.toHaveAttribute('data-native-ui-shell');
  await expect(page.locator('app-album-page ion-footer')).toHaveCSS('opacity', '1');
  await page.locator('app-album-page ion-footer ion-button').click();
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-shell', '');
});

test('foldable tabs request native adaptive rail placement', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index');
  const app = page.locator('ion-app');
  const bar = page.locator('ion-tab-bar');
  await expect(bar).toHaveAttribute('data-native-ui-shell', '');

  await app.evaluate((element) => element.classList.add('ios-theme-enable-foldable'));
  await expect(bar).toHaveAttribute('data-native-ui-shell', '');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__nativeUIShell.updates
          .at(-1)
          .controls.some((control: any) => control.kind === 'ion-tab-bar' && control.placement === 'foldable-rail'),
      ),
    )
    .toBe(true);

  await app.evaluate((element) => element.classList.remove('ios-theme-enable-foldable'));
  await expect(bar).toHaveAttribute('data-native-ui-shell', '');
  await expect(bar).toHaveClass(/ios27-enable-gesture/);
});

test('foldable back navigation requests native rail placement', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const app = page.locator('ion-app');
  const source = page.locator('app-native-ui-shell ion-back-button');
  const projection = page.locator('ion-app > ion-back-button.ios-theme-foldable-back-button-projection');
  await expect(source).toHaveAttribute('data-native-ui-shell', '');

  await app.evaluate((element) => element.classList.add('ios-theme-enable-foldable'));
  await expect(projection).toHaveCount(0);
  await expect(source).toHaveAttribute('data-native-ui-shell', '');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__nativeUIShell.updates
            .at(-1)
            .controls.some((control: any) => control.kind === 'ion-back-button' && control.placement === 'foldable-rail') &&
          !(window as any).__nativeUIShell.updates
            .at(-1)
            .controls.some((control: any) => control.items.some((item: any) => item.label === 'Cancel')),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__nativeUIShell.updates
          .at(-1)
          .controls.some(
            (control: any) =>
              control.kind === 'ion-button' &&
              control.placement === 'foldable-rail' &&
              control.items.some((item: any) => item.accessibilityLabel === 'Save'),
          ),
      ),
    )
    .toBe(true);

  await app.evaluate((element) => element.classList.remove('ios-theme-enable-foldable'));
  await expect(projection).toHaveCount(0);
  await expect(source).toHaveAttribute('data-native-ui-shell', '');
});

test('foldable toolbar sources are hidden before ownership and restored with their lifecycle', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-enable-foldable'));
  const source = page.locator('app-native-ui-shell ion-button[type=submit]');
  await expect(source).toHaveAttribute('data-native-ui-shell', '');
  await expect(source).toHaveClass(/ios-theme-native-ui-shell-prehidden/);

  const prehidden = await source.evaluate((element) => {
    element.removeAttribute('data-native-ui-shell');
    const style = getComputedStyle(element);
    return { position: style.position, visibility: style.visibility };
  });
  expect(prehidden).toEqual({ position: 'absolute', visibility: 'hidden' });

  const earlyBack = await page.locator('app-native-ui-shell ion-back-button').evaluate((element) => {
    element.removeAttribute('data-native-ui-shell');
    element.classList.remove('ios-theme-native-ui-shell-prehidden');
    const style = getComputedStyle(element);
    return { position: style.position, visibility: style.visibility };
  });
  expect(earlyBack).toEqual({ position: 'absolute', visibility: 'hidden' });

  const customBack = page.locator('app-native-ui-shell ion-back-button');
  await customBack.evaluate((element: HTMLIonBackButtonElement) => (element.color = 'primary'));
  await expect(customBack).not.toHaveAttribute('data-native-ui-shell', '');
  await expect(customBack).toHaveCSS('visibility', 'visible');
  const webOnlyBacks = await page.locator('app-native-ui-shell').evaluate((host) => {
    const content = host.querySelector('ion-content')!;
    const nested = document.createElement('ion-header');
    nested.innerHTML = '<ion-toolbar><ion-back-button></ion-back-button></ion-toolbar>';
    content.append(nested);
    const condensed = document.createElement('ion-header');
    condensed.setAttribute('collapse', 'condense');
    condensed.innerHTML = '<ion-toolbar><ion-back-button></ion-back-button></ion-toolbar>';
    host.append(condensed);
    return [nested.querySelector('ion-back-button')!, condensed.querySelector('ion-back-button')!].map(
      (back) => getComputedStyle(back).visibility,
    );
  });
  expect(webOnlyBacks).toEqual(['visible', 'visible']);

  const lateBackInitially = await page.locator('ion-app').evaluate((root) => {
    const header = document.createElement('ion-header');
    header.innerHTML = '<ion-toolbar><ion-back-button default-href="/main/index"></ion-back-button></ion-toolbar>';
    root.append(header);
    const back = header.querySelector('ion-back-button')!;
    back.setAttribute('data-late-back', '');
    return back.classList.contains('ios-theme-foldable-back-web-owned');
  });
  expect(lateBackInitially).toBe(false);
  const lateBack = page.locator('ion-back-button[data-late-back]');
  await expect(lateBack).toHaveClass(/ios-theme-native-ui-shell-prehidden/);
  await expect(lateBack).toHaveAttribute('data-native-ui-shell', '');
  await page.waitForTimeout(1600); // Past the unhydrated readiness timeout.
  await expect(lateBack).toHaveAttribute('data-native-ui-shell', '');
  await expect(lateBack).not.toHaveClass(/ios-theme-foldable-back-web-owned/);
  await lateBack.evaluate((element) => element.closest('ion-header')?.remove());

  await source.evaluate((element) => element.classList.add('ios-theme-shell-disabled'));
  await expect(source).toHaveCSS('visibility', 'visible');

  await page.evaluate(() => (window as any).nativeUIShell.destroy());
  await expect(source).not.toHaveClass(/ios-theme-native-ui-shell-prehidden/);
  await expect(source).toHaveCSS('visibility', 'visible');
});

test('rejected foldable control returns to an operable Web source', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-enable-foldable'));
  const save = page.locator('app-native-ui-shell ion-button[type=submit]');
  await expect(save).toHaveAttribute('data-native-ui-shell', '');
  await page.evaluate(() => {
    (window as any).__nativeUIShell.rejectControlLabel = 'Save';
    window.dispatchEvent(new Event('nativeUIShellRefresh'));
  });
  await expect(save).not.toHaveAttribute('data-native-ui-shell', '');
  await expect(save).not.toHaveClass(/ios-theme-native-ui-shell-prehidden/);
  await expect(save).toHaveCSS('visibility', 'visible');
  await save.click();
  await expect(page.locator('[data-save-count]')).toHaveText('1');
});

test('foldable rail remains native while its Ionic menu is open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  await page.locator('app-native-ui-shell ion-menu-button').evaluate((element: HTMLIonMenuButtonElement) => (element.autoHide = false));
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-enable-foldable'));
  const menu = page.locator('ion-menu');
  const menuSource = page.locator('app-native-ui-shell ion-menu-button').locator('..');
  const backSource = page.locator('app-native-ui-shell ion-back-button');
  const saveSource = page.locator('app-native-ui-shell ion-button[type=submit]');
  const cancelSource = page.locator('app-native-ui-shell ion-button').filter({ hasText: 'Cancel' });
  const actionGroup = page.locator('app-native-ui-shell ion-buttons[data-glass-group]');
  const tabs = page.locator('ion-tab-bar');
  for (const source of [menuSource, backSource, saveSource, tabs]) await expect(source).toHaveAttribute('data-native-ui-shell', '');
  await expect(cancelSource).not.toHaveAttribute('data-native-ui-shell', '');
  await expect(cancelSource).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const controls = (window as any).__nativeUIShell.updates.at(-1)?.controls ?? [];
        const demoActions = (control: any) =>
          control.items.filter((item: any) => ['GitHub', 'Refresh'].includes(item.accessibilityLabel)).length;
        return {
          groups: controls.filter((control: any) => control.kind === 'ion-buttons' && demoActions(control) === 2).length,
          individuals: controls.filter((control: any) => control.kind === 'ion-button' && demoActions(control) > 0).length,
        };
      }),
    )
    .toEqual({ groups: 1, individuals: 0 });

  await actionGroup.evaluate((element) => {
    const cancel = document.createElement('ion-button') as HTMLIonButtonElement;
    cancel.classList.add('ios');
    cancel.fill = 'clear';
    cancel.textContent = 'Cancel mixed action';
    element.prepend(cancel);
  });
  const mixedCancel = actionGroup.locator('ion-button').filter({ hasText: 'Cancel mixed action' });
  const mixedIcons = actionGroup.locator('ion-button').filter({ has: page.locator('ion-icon') });
  await expect(actionGroup).not.toHaveAttribute('data-native-ui-shell');
  await expect(mixedIcons).toHaveCount(2);
  await expect(mixedIcons.nth(0)).toHaveAttribute('data-native-ui-shell', '');
  await expect(mixedIcons.nth(1)).toHaveAttribute('data-native-ui-shell', '');
  await expect(mixedCancel).not.toHaveAttribute('data-native-ui-shell');
  await expect(mixedCancel).toBeVisible();
  await expect.poll(() => mixedCancel.evaluate((element) => getComputedStyle(element).visibility)).toBe('visible');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const controls = (window as any).__nativeUIShell.updates.at(-1)?.controls ?? [];
        const demoActions = (control: any) =>
          control.items.filter((item: any) => ['GitHub', 'Refresh'].includes(item.accessibilityLabel)).length;
        return {
          groups: controls.filter((control: any) => control.kind === 'ion-buttons' && demoActions(control) === 2).length,
          individuals: controls.filter((control: any) => control.kind === 'ion-button' && demoActions(control) > 0).length,
        };
      }),
    )
    .toEqual({ groups: 1, individuals: 0 });
  const nativeSaveDisabled = () =>
    page.evaluate(
      () =>
        (window as any).__nativeUIShell.updates
          .at(-1)
          .controls.flatMap((control: any) => control.items)
          .find((item: any) => item.accessibilityLabel === 'Save')?.disabled,
    );
  const nativeActionsDisabled = () =>
    page.evaluate(() =>
      (window as any).__nativeUIShell.updates
        .at(-1)
        .controls.flatMap((control: any) => control.items)
        .filter((item: any) => ['GitHub', 'Refresh'].includes(item.accessibilityLabel))
        .map((item: any) => item.disabled),
    );
  await actionGroup.evaluate((element: HTMLElement) => (element.style.pointerEvents = 'none'));
  await activate(page, 'menu');
  await expect(menu).toHaveClass(/show-menu/);
  await expect.poll(nativeActionsDisabled).toEqual([true, true]);
  await actionGroup.evaluate((element: HTMLElement) => (element.style.pointerEvents = ''));
  await expect.poll(nativeActionsDisabled).toEqual([false, false]);
  await expect.poll(() => mixedCancel.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
  await mixedCancel.evaluate((element) => element.remove());
  await expect(actionGroup).toHaveAttribute('data-native-ui-shell', '');
  await saveSource.evaluate((element: HTMLElement) => (element.style.pointerEvents = 'none'));
  await actionGroup.evaluate((element: HTMLElement) => (element.style.pointerEvents = 'none'));
  await expect.poll(nativeSaveDisabled).toBe(true);
  await expect.poll(nativeActionsDisabled).toEqual([true, true]);
  await expect(menu).toHaveClass(/show-menu/);
  await expect
    .poll(() => menu.evaluate((element) => element.shadowRoot?.querySelector('[part~="container"]')?.getBoundingClientRect().left))
    .toBe(0);
  await expect.poll(nativeSaveDisabled).toBe(true);
  await expect.poll(nativeActionsDisabled).toEqual([true, true]);
  await saveSource.evaluate((element: HTMLElement) => (element.style.pointerEvents = ''));
  await actionGroup.evaluate((element: HTMLElement) => (element.style.pointerEvents = ''));
  await expect.poll(nativeSaveDisabled).toBe(false);
  await expect.poll(nativeActionsDisabled).toEqual([false, false]);
  await expect.poll(() => cancelSource.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
  for (const source of [menuSource, backSource, saveSource, tabs]) await expect(source).toHaveAttribute('data-native-ui-shell', '');
  await expect(cancelSource).toBeVisible();
  await activate(page, 'Save');
  await expect(page.locator('[data-save-count]')).toHaveText('1');
  // Placement is selected when this page enters, not re-evaluated from later content.
  await cancelSource.evaluate((element) => {
    element.setAttribute('data-morphed-cancel', '');
    element.textContent = '';
    const icon = document.createElement('ion-icon');
    icon.setAttribute('slot', 'icon-only');
    icon.setAttribute('name', 'checkmark');
    element.append(icon);
  });
  const morphedCancel = page.locator('app-native-ui-shell ion-button[data-morphed-cancel]');
  await expect(morphedCancel).not.toHaveAttribute('data-native-ui-shell', '');
  await expect(morphedCancel).not.toHaveClass(/ios-theme-native-ui-shell-prehidden/);
  await expect(morphedCancel).toBeVisible();
});

test('foldable controls stay operable on Web when the native side rail is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNative(page, false, false);
  await page.goto('/main/index/native-ui-shell');
  await page.locator('app-native-ui-shell ion-menu-button').evaluate((element: HTMLIonMenuButtonElement) => (element.autoHide = false));
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-enable-foldable'));

  const projection = page.locator('ion-app > ion-back-button.ios-theme-foldable-back-button-projection');
  const menuProjection = page.locator('ion-app > ion-menu-button.ios-theme-foldable-toolbar-projection');
  const saveProjection = page.locator('ion-app > ion-button.ios-theme-foldable-toolbar-projection[aria-label=Save]');
  await expect(projection).toBeVisible();
  await expect(menuProjection).toBeVisible();
  await expect(saveProjection).toBeVisible();
  await expect(page.locator('ion-tab-bar')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).nativeUIShell.getStatus().projected)).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__nativeUIShell.updates.every((snapshot: any) =>
          snapshot.controls.every((control: any) => control.placement !== 'foldable-rail'),
        ),
      ),
    )
    .toBe(true);

  await menuProjection.click();
  await expect(page.locator('ion-menu')).toHaveClass(/show-menu/);
  await expect(projection).toBeVisible();
  await expect(menuProjection).toBeVisible();
  await expect(saveProjection).toBeVisible();
  await expect(page.locator('ion-tab-bar')).toBeVisible();
  await saveProjection.click();
  await expect(page.locator('[data-save-count]')).toHaveText('1');

  await page.evaluate(() => {
    const outlet = document.querySelector('ion-tabs ion-router-outlet')!;
    (window as any).__foldableBackCloneMoved = false;
    new MutationObserver(() => {
      if (outlet.querySelector(':scope > ion-back-button.ion-cloned-element')) (window as any).__foldableBackCloneMoved = true;
    }).observe(outlet, { childList: true });
  });
  await projection.click();
  await expect(page).toHaveURL(/\/main\/index$/);
  expect(await page.evaluate(() => (window as any).__foldableBackCloneMoved)).toBe(false);
});

test('native click preserves external form submit, disabled, and duplicate protection', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const button = page.locator('app-native-ui-shell ion-button[type=submit]');
  await expect(button).toHaveAttribute('data-native-ui-shell', '');
  await expect(button.locator('button')).toHaveCSS('visibility', 'hidden');
  await activate(page, 'Save', true);
  await expect(page.locator('[data-save-count]')).toHaveText('1');
  await page.getByRole('button', { name: 'disabled: false', exact: true }).click();
  await expect(button).toHaveJSProperty('disabled', true);
  await activate(page, 'Save');
  await expect(page.locator('[data-save-count]')).toHaveText('1');
  await expect.poll(() => page.evaluate(() => (window as any).nativeUIShell.getStatus().projected)).toBeGreaterThan(0);
  await page.waitForTimeout(200);
  const count = await page.evaluate(() => (window as any).__nativeUIShell.updates.length);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as any).__nativeUIShell.updates.length)).toBe(count);
});

test('ancestor display, element opt-out aliases and non-glass fills restore Web', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const button = page.locator('app-native-ui-shell ion-button[type=submit]');
  const toolbar = button.locator('xpath=ancestor::ion-toolbar[1]');
  await expect(button).toHaveAttribute('data-native-ui-shell', '');
  await page.getByRole('button', { name: 'Parent hidden: false', exact: true }).click();
  await expect(button).not.toHaveAttribute('data-native-ui-shell');
  await page.getByRole('button', { name: 'Parent hidden: true', exact: true }).click();
  await expect(button).toHaveAttribute('data-native-ui-shell', '');
  for (const name of ['ios-theme-disabled', 'ios26-disabled', 'ionic-theme-disabled']) {
    await toolbar.evaluate((element, name) => element.classList.add(name), name);
    await expect(button).not.toHaveAttribute('data-native-ui-shell');
    await toolbar.evaluate((element, name) => element.classList.remove(name), name);
    await expect(button).toHaveAttribute('data-native-ui-shell', '');
  }
  for (const name of ['ios-theme-disabled', 'ios26-disabled', 'ionic-theme-disabled']) {
    await button.evaluate((element, name) => element.classList.add(name), name);
    await expect(button).not.toHaveAttribute('data-native-ui-shell');
    await button.evaluate((element, name) => element.classList.remove(name), name);
    await expect(button).toHaveAttribute('data-native-ui-shell', '');
  }
  await page
    .locator('app-native-ui-shell ion-buttons[slot=end] ion-button')
    .filter({ hasText: 'Cancel' })
    .evaluate((element) => element.remove());
  await expect(button).toHaveAttribute('data-native-ui-shell', '');
  for (const fill of ['clear', 'solid', 'outline']) {
    await page.getByRole('button', { name: `fill: ${fill}`, exact: true }).click();
    await expect(button).not.toHaveAttribute('data-native-ui-shell');
    await expect(button.locator('button')).toHaveCSS('visibility', 'visible');
    await page.getByRole('button', { name: 'fill: default', exact: true }).click();
    await expect(button).toHaveAttribute('data-native-ui-shell', '');
  }
});

test('shell opt-out restores the element and descendants while preserving Web glass', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const button = page.locator('app-native-ui-shell ion-button[type=submit]');
  const tabs = page.locator('ion-tab-bar');
  const glass = () =>
    button.locator('button').evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, filter: style.backdropFilter, radius: style.borderRadius };
    });
  await expect(button).toHaveAttribute('data-native-ui-shell', '');
  const original = await glass();
  expect(original.filter).toContain('blur');
  for (const target of [
    button,
    button.locator('..'),
    page.locator('app-native-ui-shell > ion-header'),
    page.locator('app-native-ui-shell'),
  ]) {
    await target.evaluate((element) => element.classList.add('ios-theme-shell-disabled'));
    await expect(button).not.toHaveAttribute('data-native-ui-shell');
    await expect(target.locator('[data-native-ui-shell]')).toHaveCount(0);
    await expect(button.locator('button')).toHaveCSS('visibility', 'visible');
    expect(await glass()).toEqual(original);
    await expect(tabs).toHaveAttribute('data-native-ui-shell', '');
    await target.evaluate((element) => element.classList.remove('ios-theme-shell-disabled'));
    await expect(button).toHaveAttribute('data-native-ui-shell', '');
  }
  await page.locator('html').evaluate((element) => element.classList.add('ios-theme-shell-disabled'));
  await expect(page.locator('[data-native-ui-shell]')).toHaveCount(0);
  await button.click();
  await expect(page.locator('[data-save-count]')).toHaveText('1');
  await page.locator('html').evaluate((element) => element.classList.remove('ios-theme-shell-disabled'));
  await expect(tabs).toHaveAttribute('data-native-ui-shell', '');
});

test('shell opt-out in shared surface children keeps the whole surface on Web', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const button = page.locator('app-native-ui-shell ion-button[type=submit]');
  for (const [surfaceSelector, childSelector] of [
    ['[data-glass-group]', 'ion-button'],
    ['[data-glass-group]', 'ion-icon'],
    ['app-native-ui-shell ion-segment', 'ion-segment-button'],
    ['app-native-ui-shell ion-segment', 'ion-label'],
    ['ion-tab-bar', 'ion-tab-button'],
    ['ion-tab-bar', 'ion-icon'],
  ]) {
    const surface = page.locator(surfaceSelector);
    const child = surface.locator(childSelector).first();
    await expect(surface).toHaveAttribute('data-native-ui-shell', '');
    await child.evaluate((element) => element.classList.add('ios-theme-shell-disabled'));
    await expect(surface).not.toHaveAttribute('data-native-ui-shell');
    await expect(surface.locator('[data-native-ui-shell]')).toHaveCount(0);
    await expect(child).toHaveCSS('visibility', 'visible');
    await expect(button).toHaveAttribute('data-native-ui-shell', '');
    await child.evaluate((element) => element.classList.remove('ios-theme-shell-disabled'));
    await expect(surface).toHaveAttribute('data-native-ui-shell', '');
  }
});

test('shell opt-out cannot be bypassed by searchable tab integration', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  const tabs = page.locator('ion-tab-bar');
  const search = () => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.search)?.search);
  await expect.poll(async () => (await search())?.trigger.accessibilityLabel).toBe('Search');
  for (const target of [
    footer,
    footer.locator('ion-toolbar'),
    footer.locator('ion-searchbar'),
    footer.locator('input.searchbar-input'),
    footer.locator('ion-buttons[slot=start] ion-button'),
    page.locator('app-album-page ion-fab'),
    page.locator('app-album-page ion-fab-button'),
  ]) {
    await expect(footer).toHaveAttribute('data-native-ui-shell', '');
    await expect.poll(search).toBeTruthy();
    await target.evaluate((element) => element.classList.add('ios-theme-shell-disabled'));
    await expect(footer).not.toHaveAttribute('data-native-ui-shell');
    await expect.poll(search).toBeUndefined();
    await expect(tabs).toHaveAttribute('data-native-ui-shell', '');
    await target.evaluate((element) => element.classList.remove('ios-theme-shell-disabled'));
    await expect(footer).toHaveAttribute('data-native-ui-shell', '');
    await expect.poll(search).toBeTruthy();
  }
});

test('shell opt-out retires active search without losing input or accepting late native events', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  const bar = footer.locator('ion-searchbar');
  const search = () => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.search)?.search);
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  await page.evaluate(() => {
    const state = (window as any).__nativeUIShell;
    const snapshot = state.updates.at(-1);
    state.activate({
      id: snapshot.controls.find((c: any) => c.search).search.trigger.id,
      revision: snapshot.revision,
      sequence: ++state.sequence,
    });
  });
  await expect.poll(async () => (await search())?.active).toBe(true);
  await page.evaluate(() => {
    const state = (window as any).__nativeUIShell;
    const snapshot = state.updates.at(-1);
    const search = snapshot.controls.find((c: any) => c.search).search;
    const event = {
      id: search.id,
      valueVersion: search.valueVersion,
      revision: snapshot.revision,
      phase: 'input',
      value: '日本',
      composing: false,
    };
    state.search({ ...event, sequence: ++state.sequence });
    state.lateSearch = () => state.search({ ...event, value: 'stale', sequence: ++state.sequence });
  });
  await expect(bar).toHaveJSProperty('value', '日本');
  await bar.evaluate((element) => element.classList.add('ios-theme-shell-disabled'));
  await expect(footer).not.toHaveAttribute('data-native-ui-shell');
  await expect.poll(search).toBeUndefined();
  await page.evaluate(() => (window as any).__nativeUIShell.lateSearch());
  await expect(bar).toHaveJSProperty('value', '日本');
  await bar.evaluate((element) => element.classList.remove('ios-theme-shell-disabled'));
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  await expect.poll(async () => (await search())?.value).toBe('日本');
});

test('segment preserves numeric values and emits only user changes', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const segment = page.locator('app-native-ui-shell ion-segment');
  await expect(segment).toHaveAttribute('data-native-ui-shell', '');
  await activate(page, 'Two');
  await expect(segment).toHaveJSProperty('value', 2);
  await expect(page.locator('[data-changes]')).toHaveText('1');
  await activate(page, 'Three');
  await expect(segment).toHaveJSProperty('value', 2);
  await page.getByRole('button', { name: 'Select One programmatically' }).click();
  await expect(segment).toHaveJSProperty('value', 'one');
  await expect(page.locator('[data-changes]')).toHaveText('1');
});

test('modal suspension, tab hiding and destroy restore ownership', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const button = page.locator('app-native-ui-shell ion-button[type=submit]');
  const tabs = page.locator('ion-tab-bar');
  await expect(button).toHaveAttribute('data-native-ui-shell', '');
  await expect(tabs).toHaveAttribute('data-native-ui-shell', '');
  await page.getByRole('button', { name: 'Open modal', exact: true }).click();
  await expect(page.locator('[data-native-ui-shell]')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1)))
    .toMatchObject({ controls: [], transitionDuration: 0 });
  await page.getByRole('button', { name: 'Close modal', exact: true }).click();
  await expect(button).toHaveAttribute('data-native-ui-shell', '');
  await tabs.evaluate((element) => (element.style.display = 'none'));
  await expect(tabs).not.toHaveAttribute('data-native-ui-shell');
  await tabs.evaluate((element) => element.style.removeProperty('display'));
  await expect(tabs).toHaveAttribute('data-native-ui-shell', '');
  await page.evaluate(() => (window as any).nativeUIShell.destroy());
  await expect(page.locator('[data-native-ui-shell]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('[data-save-count]')).toHaveText('1');
});

test('delayed response cannot reclaim a hidden source', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const button = page.locator('app-native-ui-shell ion-button[type=submit]');
  await expect(button).toHaveAttribute('data-native-ui-shell', '');
  await page.evaluate(() => ((window as any).__nativeUIShell.delay = 150));
  await button.evaluate((element) => (element.querySelector('[data-label]')!.textContent = '変更'));
  await page.getByRole('button', { name: 'Parent hidden: false', exact: true }).click();
  await expect(button).not.toHaveAttribute('data-native-ui-shell');
  await page.waitForTimeout(350);
  await expect(button).not.toHaveAttribute('data-native-ui-shell');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__nativeUIShell.updates
          .at(-1)
          .controls.some((control: any) => control.items.some((item: any) => item.label === '変更')),
      ),
    )
    .toBe(false);
});

test('native refresh during a pending acknowledgement resends unchanged controls', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  // This test needs a static snapshot; tab-selection icon animation is tested separately.
  await page.locator('ion-tab-bar').evaluate((element) => element.remove());
  await expect(page.locator('app-native-ui-shell ion-button[type=submit]')).toHaveAttribute('data-native-ui-shell', '');
  await expect
    .poll(() => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).controls.some((c: any) => c.kind === 'ion-tab-bar')))
    .toBe(false);
  const revision = await page.evaluate(() => {
    const state = (window as any).__nativeUIShell;
    state.delay = 500;
    window.dispatchEvent(new Event('nativeUIShellRefresh'));
    return state.updates.at(-1).revision;
  });
  await expect.poll(() => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).revision)).toBeGreaterThan(revision);
  const pending = await page.evaluate(() => {
    const state = (window as any).__nativeUIShell;
    const snapshot = state.updates.at(-1);
    window.dispatchEvent(new Event('nativeUIShellRefresh'));
    return snapshot;
  });
  await expect.poll(() => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).revision)).toBeGreaterThan(pending.revision);
  const refreshed = await page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1));
  expect(refreshed.controls).toEqual(pending.controls);
  await expect(page.locator('app-native-ui-shell ion-button[type=submit]')).toHaveAttribute('data-native-ui-shell', '');
});

test('native failure leaves Web form usable', async ({ page }) => {
  await mockNative(page, true);
  await page.goto('/main/index/native-ui-shell');
  await expect.poll(() => page.evaluate(() => (window as any).nativeUIShell?.getStatus().state)).toBe('stopped');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('[data-save-count]')).toHaveText('1');
});

test('native tab clicks use Ionic navigation and selected state', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const tabs = page.locator('ion-tab-bar');
  await expect(tabs).toHaveAttribute('data-native-ui-shell', '');
  await activate(page, 'Settings');
  await expect(page).toHaveURL(/\/main\/settings/);
  await expect(page.locator('ion-tab-button[tab="settings"]')).toHaveJSProperty('selected', true);
  await expect(tabs).not.toHaveAttribute('data-native-ui-shell'); // This demo hides tabs on Settings.
});

test('100 hide/show cycles leave stable ownership and destroy stops updates', async ({ page }) => {
  test.setTimeout(90000);
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const button = page.locator('app-native-ui-shell ion-button[type=submit]');
  await expect(button).toHaveAttribute('data-native-ui-shell', '');
  const initial = await page.evaluate(() => (window as any).nativeUIShell.getStatus().projected);
  for (let index = 0; index < 100; index++) {
    await button.evaluate((element) => (element.parentElement!.hidden = true));
    await expect(button).not.toHaveAttribute('data-native-ui-shell');
    await button.evaluate((element) => (element.parentElement!.hidden = false));
    await expect(button).toHaveAttribute('data-native-ui-shell', '');
  }
  expect(await page.evaluate(() => (window as any).nativeUIShell.getStatus().projected)).toBe(initial);
  await page.evaluate(() => (window as any).nativeUIShell.destroy());
  const updates = await page.evaluate(() => (window as any).__nativeUIShell.updates.length);
  await button.evaluate((element) => element.setAttribute('fill', 'clear'));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__nativeUIShell.updates.length)).toBe(updates);
  await expect(page.locator('[data-native-ui-shell]')).toHaveCount(0);
});

test('ion-icon SVGs project and update when their name changes', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const button = page.locator('app-native-ui-shell ion-button[type=submit]');
  await expect(button).toHaveAttribute('data-native-ui-shell', '');
  const nativeIcon = () =>
    button.evaluate(() => {
      const snapshot = (window as any).__nativeUIShell.updates.at(-1);
      return snapshot.controls.flatMap((control: any) => control.items).find((item: any) => item.accessibilityLabel === 'Save')?.icon;
    });
  await expect.poll(nativeIcon).toMatch(/^iVBOR/);
  const original = await nativeIcon();
  await button.locator('ion-icon').evaluate((element: HTMLIonIconElement) => {
    element.name = 'star';
  });
  await expect.poll(nativeIcon).not.toBe(original);
  await expect.poll(nativeIcon).toMatch(/^iVBOR/);
  await expect(button).toHaveAttribute('data-native-ui-shell', '');
});

test('clear ion-buttons share one glass surface and keep independent actions', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const group = page.locator('[data-glass-group]');
  const github = group.locator('ion-button').nth(0);
  const refresh = group.locator('ion-button').nth(1);
  const projectedGroup = () =>
    page.evaluate(() =>
      (window as any).__nativeUIShell.updates
        .at(-1)
        .controls.find(
          (control: any) => control.kind === 'ion-buttons' && control.items.some((item: any) => item.accessibilityLabel === 'GitHub'),
        ),
    );
  await expect(group).toHaveAttribute('data-native-ui-shell', '');
  await expect(group.locator('[data-native-ui-shell]')).toHaveCount(0);
  await expect(github.locator('button')).toHaveCSS('visibility', 'hidden');
  const native = await projectedGroup();
  expect(native.items).toHaveLength(2);
  expect(native.items.map((item: any) => item.accessibilityLabel)).toEqual(['GitHub', 'Refresh']);
  for (const item of native.items) expect(item.icon).toMatch(/^iVBOR/);
  await activate(page, 'GitHub', true);
  await expect(page.locator('ion-title').filter({ hasText: 'Actions:' })).toHaveText('Actions: 1 / 0');
  await expect.poll(async () => (await projectedGroup())?.items.length).toBe(2);
  await activate(page, 'Refresh');
  await expect(page.locator('ion-title').filter({ hasText: 'Actions:' })).toHaveText('Actions: 1 / 1');

  await refresh.evaluate((element: HTMLIonButtonElement) => {
    element.disabled = true;
  });
  await expect.poll(async () => (await projectedGroup())?.items[1].disabled).toBe(true);
  await activate(page, 'Refresh');
  await expect(page.locator('ion-title').filter({ hasText: 'Actions:' })).toHaveText('Actions: 1 / 1');
  await refresh.evaluate((element: HTMLIonButtonElement) => {
    element.disabled = false;
  });

  for (const target of [group, github]) {
    await target.evaluate((element) => element.classList.add('ionic-theme-disabled'));
    await expect(group).not.toHaveAttribute('data-native-ui-shell');
    await expect(github.locator('button')).toHaveCSS('visibility', 'visible');
    await target.evaluate((element) => element.classList.remove('ionic-theme-disabled'));
    await expect(group).toHaveAttribute('data-native-ui-shell', '');
  }
  await group.evaluate((element) => {
    element.style.display = 'none';
  });
  await expect(group).not.toHaveAttribute('data-native-ui-shell');
  await expect.poll(projectedGroup).toBeUndefined();
  await group.evaluate((element) => element.style.removeProperty('display'));
  await expect(group).toHaveAttribute('data-native-ui-shell', '');

  await refresh.evaluate((element: HTMLIonButtonElement) => {
    element.fill = 'solid';
  });
  await expect(group).not.toHaveAttribute('data-native-ui-shell');
  await expect(refresh.locator('button')).toHaveCSS('visibility', 'visible');
  await refresh.evaluate((element: HTMLIonButtonElement) => {
    element.fill = 'clear';
  });
  await expect(group).toHaveAttribute('data-native-ui-shell', '');
  await refresh.evaluate((element) => element.remove());
  await expect(group).not.toHaveAttribute('data-native-ui-shell');
  await expect(github.locator('button')).toHaveCSS('visibility', 'visible');
});

test('theme-disabled ion-buttons project eligible buttons independently', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  await page.locator('[data-glass-group]').evaluate((group) => {
    group.classList.add('ionic-theme-disabled');
    group.querySelectorAll<HTMLIonButtonElement>('ion-button').forEach((button) => (button.fill = 'default'));
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const controls = (window as any).__nativeUIShell.updates.at(-1)?.controls ?? [];
        const isDemoAction = (control: any) => control.items.some((item: any) => ['GitHub', 'Refresh'].includes(item.accessibilityLabel));
        return {
          buttons: controls.filter((control: any) => control.kind === 'ion-button' && isDemoAction(control)).length,
          groups: controls.filter((control: any) => control.kind === 'ion-buttons' && isDemoAction(control)).length,
        };
      }),
    )
    .toEqual({ buttons: 2, groups: 0 });
});

test('all demo pages keep projection consistent through consecutive navigation', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 440, height: 956 });
  await mockNative(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/main/index');
  // Read actual routes so new demo pages are included automatically.
  const { readFileSync } = await import('node:fs');
  const routes = Array.from(readFileSync('src/app/index/index.routes.ts', 'utf8').matchAll(/path: '([^']+)'/g), (match) => match[1]);
  const settled = async () => {
    await expect
      .poll(() =>
        page.evaluate(() =>
          document
            .getAnimations()
            .some(
              (animation) =>
                animation.playState === 'running' &&
                (animation.effect as KeyframeEffect)?.target instanceof Element &&
                ((animation.effect as KeyframeEffect).target as Element).classList.contains('ion-page'),
            ),
        ),
      )
      .toBe(false);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const status = (window as any).nativeUIShell.getStatus();
          const snapshot = (window as any).__nativeUIShell.updates.at(-1);
          return (
            status.state !== 'stopped' &&
            status.projected === snapshot?.controls.reduce((count: number, control: any) => count + (control.search?.available ? 3 : 1), 0)
          );
        }),
      )
      .toBe(true);
    await expect(
      page.locator(
        '.ion-page-hidden [data-native-ui-shell], ion-content ion-toolbar [data-native-ui-shell], [data-native-ui-shell] [data-native-ui-shell]',
      ),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll('ion-icon[name]'))
            .filter((icon) => !icon.closest('.ion-page-hidden') && icon.getBoundingClientRect().width > 0)
            .filter((icon) => !icon.shadowRoot?.querySelector('svg'))
            .map((icon) => icon.getAttribute('name')),
        ),
      )
      .toEqual([]);
  };
  const back = async () => {
    await settled();
    const hasNativeBack = await page.evaluate(() =>
      (window as any).__nativeUIShell.updates.at(-1).controls.some((control: any) => control.kind === 'ion-back-button'),
    );
    if (hasNativeBack) await activate(page, 'back');
    else
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('ion-back-button'))
          .find((element) => !element.closest('.ion-page-hidden, ion-content'))!
          .click(),
      );
  };
  await settled();
  for (const route of routes) {
    await test.step(route, async () => {
      await page.getByRole('button', { name: route === 'native-ui-shell' ? 'native-ui-shell (Experimental)' : route, exact: true }).click();
      await expect(page).toHaveURL(`/main/index/${route}`);
      await settled();
      await back();
      await expect(page).toHaveURL('/main/index');
      await settled();
    });
  }
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole('button', { name: 'button', exact: true }).click();
    await expect(page).toHaveURL('/main/index/button');
    await page.getByRole('button', { name: 'Push', exact: true }).click();
    await expect(page).toHaveURL('/main/index/action-sheet');
    await back();
    await expect(page).toHaveURL('/main/index/button');
    await back();
    await expect(page).toHaveURL('/main/index');
  }
  for (const [label, path] of [
    ['Docs', 'docs'],
    ['Library', 'album'],
    ['Index', 'index'],
    ['Docs', 'docs'],
    ['Library', 'album'],
    ['Index', 'index'],
    ['Settings', 'settings'],
  ]) {
    await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-shell', '');
    await activate(page, label);
    await expect(page).toHaveURL(`/main/${path}`);
    await settled();
  }
  await expect(page.locator('ion-tab-bar')).not.toHaveAttribute('data-native-ui-shell');
  expect(errors).toEqual([]);
});

test('demo overlay variants retire native controls and restore them after dismissal', async ({ page }) => {
  test.setTimeout(180000);
  await mockNative(page);
  const types = overlayTypes;
  const cases: [string, string, string[]][] = [
    ['action-sheet', 'ion-action-sheet', types.actionSheetTypes],
    ['alert', 'ion-alert', types.alertTypes],
    ['modal', 'ion-modal', types.modalTypes],
    ['toast', 'ion-toast', [...types.toastTypes, ...types.colorTypes]],
    ['progress-indicators', 'ion-loading', types.loadingTypes],
    ...types.selectTypes.map((type) => ['select', `ion-${type}`, [type]] as [string, string, string[]]),
  ];
  for (const [route, tag, variants] of cases) {
    for (const type of variants) {
      await test.step(`${route}:${type}`, async () => {
        if (route === 'modal') {
          // Use the normal UI path; a query parameter is inherited by the modal's own route.
          await page.goto('/main/index/modal');
          await page.getByRole('button', { name: `present:${type}`, exact: true }).click();
        } else if (route === 'select') {
          // Popovers need the real click event to anchor their presentation.
          await page.goto('/main/index/select');
          await page.locator(`ion-select.select-${type}`).click();
        } else await page.goto(`/main/index/${route}?type=${type}`);
        const overlay = page.locator(`${tag}:not(.overlay-hidden)`).last();
        await expect(overlay).toBeVisible();
        await expect(page.locator('[data-native-ui-shell]')).toHaveCount(0);
        await overlay.evaluate((element: HTMLElement & { dismiss(): Promise<boolean> }) => element.dismiss());
        await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-shell', '');
        expect(await page.evaluate(() => (window as any).nativeUIShell.getStatus().state)).not.toBe('stopped');
      });
    }
  }
});

test('shared tabs stay native throughout navigation and delayed page updates', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 440, height: 956 });
  await mockNative(page);
  await page.goto('/main/index');
  const tabs = page.locator('ion-tab-bar');
  await expect(tabs).toHaveAttribute('data-native-ui-shell', '');
  await tabs.evaluate((element) => {
    const state = (window as any).__nativeUIShell;
    state.updates = [];
    state.delay = 100;
    state.tabRetirements = 0;
    state.retirementDetails = [];
    element.addEventListener('nativeUIShellChange', () => {
      if (!element.hasAttribute('data-native-ui-shell')) {
        state.tabRetirements++;
        state.retirementDetails.push({ path: location.pathname, tabs: element.outerHTML });
      }
    });
  });
  // A second tab content change during the first acknowledgement must retain its cover.
  await tabs
    .locator('ion-label')
    .first()
    .evaluate((label) => (label.textContent = 'Index pending'));
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__nativeUIShell.updates
          .at(-1)
          ?.controls.some((control: any) => control.items.some((item: any) => item.label === 'Index pending')),
      ),
    )
    .toBe(true);
  await tabs
    .locator('ion-label')
    .first()
    .evaluate((label) => (label.textContent = 'Index'));
  for (const route of ['native-ui-shell', 'button', 'segment', 'native-ui-shell']) {
    await page.getByRole('button', { name: route === 'native-ui-shell' ? 'native-ui-shell (Experimental)' : route, exact: true }).click();
    await expect(page).toHaveURL(`/main/index/${route}`);
    if (route === 'native-ui-shell') {
      const save = page.locator('app-native-ui-shell ion-button[type=submit]');
      await expect(save).toHaveAttribute('data-native-ui-shell', '');
      await save.evaluate((element) => {
        element.querySelector('[data-label]')!.textContent = '更新中';
      });
      await expect
        .poll(() =>
          page.evaluate(() =>
            (window as any).__nativeUIShell.updates
              .at(-1)
              .controls.some((control: any) => control.items.some((item: any) => item.label === '更新中')),
          ),
        )
        .toBe(true);
      // Change the page again while the native response is still pending.
      await save.evaluate((element) => {
        element.parentElement!.hidden = true;
      });
      await expect(save).not.toHaveAttribute('data-native-ui-shell');
    }
    await page.goBack();
    await expect(page).toHaveURL('/main/index');
    await expect(tabs).toHaveAttribute('data-native-ui-shell', '');
  }
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({
    retirements: (window as any).__nativeUIShell.tabRetirements,
    details: (window as any).__nativeUIShell.retirementDetails,
    ids: (window as any).__nativeUIShell.updates.map(
      (snapshot: any) => snapshot.controls.find((control: any) => control.kind === 'ion-tab-bar')?.id,
    ),
  }));
  expect(state.retirements, JSON.stringify(state.details)).toBe(0);
  expect(state.ids.length).toBeGreaterThan(4);
  expect(state.ids.every((id: string | undefined) => !!id && id === state.ids[0])).toBe(true);
});

test('native tabs carry position anchors for both slots and text directions', async ({ page }) => {
  await mockNative(page);
  await page.setViewportSize({ width: 440, height: 956 });
  await page.goto('/main/index');
  const tabs = page.locator('ion-tab-bar');
  await expect(tabs).toHaveAttribute('data-native-ui-shell', '');
  for (const direction of ['ltr', 'rtl']) {
    for (const slot of ['top', 'bottom']) {
      for (const position of ['start', 'center', 'end']) {
        await tabs.evaluate(
          (element, state) => {
            element.dir = state.direction;
            element.slot = state.slot;
            element.classList.remove('tab-bar-position-start', 'tab-bar-position-center', 'tab-bar-position-end');
            element.classList.add(`tab-bar-position-${state.position}`);
          },
          { direction, slot, position },
        );
        const x = position === 'center' ? 0.5 : (position === 'start') === (direction === 'ltr') ? 0 : 1;
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (window as any).__nativeUIShell.updates.at(-1)?.controls.find((control: any) => control.kind === 'ion-tab-bar')
                  ?.tabBarAnchor,
            ),
          )
          .toEqual({ x, y: slot === 'bottom' ? 1 : 0 });
        const native = await page.evaluate(() =>
          (window as any).__nativeUIShell.updates.at(-1).controls.find((control: any) => control.kind === 'ion-tab-bar'),
        );
        const dom = await tabs.boundingBox();
        expect(native.x).toBeCloseTo(dom!.x, 1);
        expect(native.y).toBeCloseTo(dom!.y, 1);
      }
    }
  }
});

test('tab icons use selection tint only for text-colored SVGs', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index');
  const tabs = page.locator('ion-tab-bar');
  await expect(tabs).toHaveAttribute('data-native-ui-shell', '');
  const items = () =>
    page.evaluate(
      () => (window as any).__nativeUIShell.updates.at(-1)?.controls.find((control: any) => control.kind === 'ion-tab-bar')?.items,
    );
  await expect.poll(async () => (await items())?.every((item: any) => item.iconTemplate)).toBe(true);
  await tabs
    .locator('ion-icon')
    .first()
    .evaluate((icon) => {
      icon.shadowRoot!.querySelector('svg')!.innerHTML =
        '<path fill="red" d="M0 0h256v512H0z"/><path fill="blue" d="M256 0h256v512H256z"/>';
    });
  await expect.poll(async () => (await items())?.[0]?.iconTemplate).toBe(false);
  expect((await items()).slice(1).every((item: any) => item.iconTemplate)).toBe(true);
});

test('menu button toggles its Ionic menu and follows autoHide, disabled and split pane', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const menu = page.locator('ion-menu');
  const button = page.locator('app-native-ui-shell ion-menu-button');
  await button.evaluate((element: HTMLIonMenuButtonElement) => (element.autoHide = true));
  const surface = button.locator('..');
  await expect(surface).toHaveAttribute('data-native-ui-shell', '');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.kind === 'ion-menu-button')?.items[0].icon?.length ??
          0,
      ),
    )
    .toBeGreaterThan(0);
  await menu.evaluate((element: HTMLIonMenuElement) => {
    element.menuId = 'native-menu';
  });
  await button.evaluate((element: HTMLIonMenuButtonElement) => {
    element.menu = 'native-menu';
  });
  for (let i = 0; i < 3; i++) {
    await activate(page, 'menu');
    await expect(menu).toHaveClass(/show-menu/);
    await expect(page.locator('[data-native-ui-shell]')).toHaveCount(0);
    await expect.poll(() => menu.evaluate((element: HTMLIonMenuElement) => element.isOpen())).toBe(true);
    await menu.evaluate((element: HTMLIonMenuElement) => element.close());
    await expect(surface).toHaveAttribute('data-native-ui-shell', '');
  }
  await button.evaluate((element: HTMLIonMenuButtonElement) => {
    element.disabled = true;
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.kind === 'ion-menu-button')?.items[0].disabled,
      ),
    )
    .toBe(true);
  await activate(page, 'menu');
  await expect(menu).not.toHaveClass(/show-menu/);
  await button.evaluate((element: HTMLIonMenuButtonElement) => {
    element.disabled = false;
  });
  await menu.evaluate((element: HTMLIonMenuElement) => {
    element.disabled = true;
  });
  await expect(button).toHaveClass(/menu-button-hidden/);
  await expect(surface).not.toHaveAttribute('data-native-ui-shell', '');
  await button.evaluate((element: HTMLIonMenuButtonElement) => {
    element.autoHide = false;
  });
  await expect(surface).toHaveAttribute('data-native-ui-shell', '');
  await activate(page, 'menu');
  await expect(menu).not.toHaveClass(/show-menu/);
  await menu.evaluate((element: HTMLIonMenuElement) => {
    element.disabled = false;
  });
  await button.evaluate((element: HTMLIonMenuButtonElement) => {
    element.autoHide = true;
  });
  await page.locator('ion-split-pane').evaluate((element: HTMLIonSplitPaneElement) => {
    element.when = '(min-width: 600px)';
  });
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(button).toHaveClass(/menu-button-hidden/);
  await expect(surface).not.toHaveAttribute('data-native-ui-shell', '');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(surface).toHaveAttribute('data-native-ui-shell', '');
});

test('menu button projects slot icons and shared glass, restoring excluded surfaces', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const button = page.locator('app-native-ui-shell ion-menu-button');
  const surface = button.locator('..');
  await expect(surface).toHaveAttribute('data-native-ui-shell', '');
  const original = await page.evaluate(
    () => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.kind === 'ion-menu-button').items[0].icon,
  );
  await button.evaluate((element) => {
    element.innerHTML = '<ion-icon name="heart"></ion-icon>';
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.kind === 'ion-menu-button')?.items[0].icon,
      ),
    )
    .not.toBe(original);
  await expect(surface).toHaveAttribute('data-native-ui-shell', '');
  await surface.evaluate((element) => {
    const extra = document.createElement('ion-button');
    extra.fill = 'clear';
    extra.textContent = 'Extra';
    extra.addEventListener('click', () => {
      (window as any).__menuExtra = true;
    });
    element.append(extra);
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__nativeUIShell.updates
            .at(-1)
            .controls.find((c: any) => c.kind === 'ion-buttons' && c.items.some((i: any) => i.label === 'Extra'))?.items.length,
      ),
    )
    .toBe(2);
  await activate(page, 'Extra');
  await expect.poll(() => page.evaluate(() => (window as any).__menuExtra)).toBe(true);
  await activate(page, 'menu');
  await expect(page.locator('ion-menu')).toHaveClass(/show-menu/);
  await expect.poll(() => page.locator('ion-menu').evaluate((element: HTMLIonMenuElement) => element.isOpen())).toBe(true);
  await page.locator('ion-menu').evaluate((element: HTMLIonMenuElement) => element.close());
  await expect(surface).toHaveAttribute('data-native-ui-shell', '');
  await surface.evaluate((element) => element.querySelector('ion-button')!.remove());
  for (const target of [surface, button]) {
    await target.evaluate((element) => element.classList.add('ionic-theme-disabled'));
    await expect(surface).not.toHaveAttribute('data-native-ui-shell', '');
    await target.evaluate((element) => element.classList.remove('ionic-theme-disabled'));
    await expect(surface).toHaveAttribute('data-native-ui-shell', '');
  }
  await surface.evaluate((element: HTMLElement) => {
    element.style.display = 'none';
  });
  await expect(surface).not.toHaveAttribute('data-native-ui-shell', '');
  await surface.evaluate((element: HTMLElement) => {
    element.style.display = '';
  });
  await expect(surface).toHaveAttribute('data-native-ui-shell', '');
  await button.evaluate((element: HTMLIonMenuButtonElement) => {
    element.type = 'submit';
  });
  await expect(surface).not.toHaveAttribute('data-native-ui-shell', '');
  await button.evaluate((element: HTMLIonMenuButtonElement) => {
    element.type = 'button';
  });
  await expect(surface).toHaveAttribute('data-native-ui-shell', '');
  await button.evaluate((element) => {
    const parent = element.parentElement!;
    parent.replaceWith(element);
  });
  await expect(button).not.toHaveAttribute('data-native-ui-shell', '');
  await expect(button.locator('button')).toHaveCSS('visibility', 'visible');
});

test('replacing a projected searchbar retires old input and binds the new field', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  const bar = footer.locator('ion-searchbar');
  const config = () => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.search)?.search);
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  await bar.evaluate((element: HTMLIonSearchbarElement) => element.setFocus());
  await expect.poll(async () => (await config())?.active).toBe(true);
  const previous = await config();
  await bar.evaluate((old: HTMLIonSearchbarElement) => {
    const state = (window as any).__nativeUIShell;
    const snapshot = state.updates.at(-1);
    const search = snapshot.controls.find((c: any) => c.search).search;
    const event = { id: search.id, revision: snapshot.revision, valueVersion: search.valueVersion, phase: 'input', composing: false };
    state.search({ ...event, value: 'old field', sequence: ++state.sequence });
    const replacement = document.createElement('ion-searchbar');
    for (const attribute of old.attributes) replacement.setAttribute(attribute.name, attribute.value);
    replacement.value = 'application initial value';
    (window as any).__retiredSearchbar = old;
    old.replaceWith(replacement);
    // Arrive before the observer can retire the old state: DOM identity must reject it.
    state.search({ ...event, value: 'stale input', sequence: ++state.sequence });
  });
  expect(await page.evaluate(() => (window as any).__retiredSearchbar.value)).toBe('old field');
  await expect
    .poll(async () => {
      const current = await config();
      return !!current && current.id !== previous.id && !current.active && current.value === 'application initial value';
    })
    .toBe(true);
  await bar.evaluate((element: HTMLIonSearchbarElement) => element.setFocus());
  await expect.poll(async () => (await config())?.focused).toBe(true);
  await page.evaluate(() => {
    const state = (window as any).__nativeUIShell;
    const snapshot = state.updates.at(-1);
    const search = snapshot.controls.find((c: any) => c.search).search;
    state.search({
      id: search.id,
      revision: snapshot.revision,
      valueVersion: search.valueVersion,
      phase: 'input',
      value: 'replacement input',
      composing: false,
      sequence: ++state.sequence,
    });
  });
  await expect(bar).toHaveJSProperty('value', 'replacement input');
  const session = await config();
  await bar.locator('input.searchbar-input').evaluate((input) => input.replaceWith(input.cloneNode(true)));
  await expect
    .poll(async () => {
      const current = await config();
      return !!current && current.id !== session.id && !current.active && current.value === 'replacement input';
    })
    .toBe(true);
});

test('native search compensates keyboard tab hiding while respecting application visibility', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  const tabBar = page.locator('ion-tab-bar');
  const config = () => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.search)?.search);
  await page.addStyleTag({ content: 'ion-tab-bar.application-hidden { display: none !important; }' });
  for (const mode of ['inline', 'class']) {
    await expect(footer).toHaveAttribute('data-native-ui-shell', '');
    await page.evaluate(() => {
      const state = (window as any).__nativeUIShell;
      const snapshot = state.updates.at(-1);
      state.activate({
        id: snapshot.controls.find((c: any) => c.search).search.trigger.id,
        revision: snapshot.revision,
        sequence: ++state.sequence,
      });
    });
    await expect.poll(async () => (await config())?.active).toBe(true);
    expect((await config())?.focused).toBe(false);
    await tabBar.evaluate((element) => {
      window.dispatchEvent(new Event('keyboardWillShow'));
      element.classList.add('tab-bar-hidden');
    });
    await expect(tabBar).not.toHaveClass(/tab-bar-hidden/);
    await expect(footer).toHaveAttribute('data-native-ui-shell', '');
    await page.evaluate(() => {
      const state = (window as any).__nativeUIShell;
      const snapshot = state.updates.at(-1);
      const search = snapshot.controls.find((c: any) => c.search).search;
      state.search({
        id: search.id,
        revision: snapshot.revision,
        valueVersion: search.valueVersion,
        phase: 'focus',
        value: search.value,
        composing: false,
        sequence: ++state.sequence,
      });
    });
    await expect.poll(async () => (await config())?.focused).toBe(true);
    expect((await config())?.active).toBe(true);
    await tabBar.evaluate((element: HTMLElement, mode) => {
      if (mode === 'inline') element.style.display = 'none';
      else element.classList.add('application-hidden');
    }, mode);
    await expect(footer).not.toHaveAttribute('data-native-ui-shell');
    await expect.poll(config).toBeUndefined();
    await expect(tabBar).toHaveCSS('display', 'none');
    await tabBar.evaluate((element: HTMLElement) => {
      window.dispatchEvent(new Event('keyboardWillHide'));
      element.style.removeProperty('display');
      element.classList.remove('application-hidden', 'tab-bar-hidden');
    });
    await expect(footer).toHaveAttribute('data-native-ui-shell', '');
    await expect.poll(async () => (await config())?.active).toBe(false);
  }
});

test('search group keeps its covers, forwards Ionic events and preserves text on close', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  const config = () => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.search)?.search);
  expect((await config()).active).toBe(false);
  await footer.evaluate((element) => {
    const bar = element.querySelector('ion-searchbar')!;
    (window as any).__searchEvents = [];
    for (const name of ['ionFocus', 'ionInput', 'ionBlur', 'ionChange', 'ionClear', 'ionCancel']) {
      bar.addEventListener(name, (event: any) => (window as any).__searchEvents.push([name, event.detail?.value]));
    }
  });
  const action = async (close = false) =>
    page.evaluate((close) => {
      const state = (window as any).__nativeUIShell;
      const snapshot = state.updates.at(-1);
      const search = snapshot.controls.find((c: any) => c.search).search;
      state.activate({ id: close ? search.closeId : search.trigger.id, revision: snapshot.revision, sequence: ++state.sequence });
    }, close);
  await action();
  await expect.poll(async () => (await config()).active).toBe(true);
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  expect(page.url()).toContain('/main/album');
  const nativeEvent = async (phase: string, value: string, composing = false) =>
    page.evaluate(
      ({ phase, value, composing }) => {
        const state = (window as any).__nativeUIShell;
        const snapshot = state.updates.at(-1);
        state.search({
          id: snapshot.controls.find((c: any) => c.search).search.id,
          valueVersion: snapshot.controls.find((c: any) => c.search).search.valueVersion,
          revision: snapshot.revision,
          sequence: ++state.sequence,
          phase,
          value,
          composing,
        });
      },
      { phase, value, composing },
    );
  await footer.locator('ion-searchbar').evaluate((bar: HTMLIonSearchbarElement) => bar.setFocus());
  await nativeEvent('focus', '');
  await nativeEvent('input', 'にほん', true);
  await nativeEvent('input', '日本', false);
  await expect(footer.locator('ion-searchbar')).toHaveJSProperty('value', '日本');
  await action(true);
  await expect.poll(async () => (await config()).active).toBe(false);
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  expect(await page.evaluate(() => (window as any).__searchEvents.map((e: any) => e[0]))).toEqual([
    'ionFocus',
    'ionInput',
    'ionInput',
    'ionBlur',
    'ionChange',
  ]);
  await action();
  await expect.poll(async () => (await config()).active).toBe(true);
  expect((await config()).value).toBe('日本');
  await footer.locator('ion-searchbar').evaluate((bar: HTMLIonSearchbarElement) => {
    bar.value = 'external';
  });
  await expect.poll(async () => (await config()).value).toBe('external');
  await nativeEvent('focus', 'external');
  await nativeEvent('clear', 'external');
  await expect.poll(async () => (await config()).value).toBe('');
  expect(await page.evaluate(() => (window as any).__searchEvents.filter((e: any) => e[0] === 'ionClear').length)).toBe(1);
});

test('search retirement keeps the value, rejects late input and allows a fresh Web session', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  await page.locator('app-album-page ion-fab-button').evaluate((button: HTMLElement) => button.click());
  await expect
    .poll(() => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.search)?.search.active))
    .toBe(true);
  await footer.locator('ion-searchbar').evaluate((bar: HTMLIonSearchbarElement) => {
    bar.value = 'retained';
  });
  await footer.evaluate((element) => element.classList.add('ionic-theme-disabled'));
  await expect(footer).not.toHaveAttribute('data-native-ui-shell');
  await page.evaluate(() => {
    const state = (window as any).__nativeUIShell;
    const snapshot = state.updates.findLast((s: any) => s.controls.some((c: any) => c.search?.active));
    state.search({
      id: snapshot.controls.find((c: any) => c.search).search.id,
      valueVersion: snapshot.controls.find((c: any) => c.search).search.valueVersion,
      revision: snapshot.revision,
      sequence: ++state.sequence,
      phase: 'input',
      value: 'late',
      composing: false,
    });
  });
  await expect(footer.locator('ion-searchbar')).toHaveJSProperty('value', 'retained');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await footer.locator('ion-button').evaluate((button: HTMLElement) => button.click());
  await page.locator('app-album-page ion-fab-button').evaluate((button: HTMLElement) => button.click());
  await expect(footer).toHaveCSS('opacity', '1');
  await footer.locator('ion-button').click();
  await expect(footer).toHaveCSS('opacity', '0');
  await footer.evaluate((element) => element.classList.remove('ionic-theme-disabled'));
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  await expect
    .poll(() => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.search)?.search.active))
    .toBe(false);
  expect(errors).toEqual([]);
});

test('a cached search registration does not block a second page sharing the tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const first = page.locator('app-album-page:not([data-second]) ion-footer');
  await expect(first).toHaveAttribute('data-native-ui-shell', '');
  await page.locator('app-album-page').evaluate((element) => {
    // Keep the old registered DOM cached while the real page registers a new footer.
    const cached = element.cloneNode(false) as HTMLElement;
    cached.append(...Array.from(element.childNodes));
    cached.classList.add('ion-page-hidden');
    element.parentElement!.append(cached);
    element.innerHTML =
      '<ion-content>Second search page</ion-content><ion-fab vertical=bottom horizontal=end slot=fixed><ion-fab-button><ion-icon name=search></ion-icon></ion-fab-button></ion-fab><ion-footer translucent><ion-toolbar><ion-buttons slot=start><ion-button fill=default><ion-icon slot=icon-only></ion-icon></ion-button></ion-buttons><ion-searchbar></ion-searchbar></ion-toolbar></ion-footer>';
    element.setAttribute('data-second', '');
    element.dispatchEvent(new CustomEvent('ionViewWillEnter'));
    element.dispatchEvent(new CustomEvent('ionViewDidEnter'));
  });
  const second = page.locator('app-album-page[data-second] ion-footer');
  await expect(first).not.toHaveAttribute('data-native-ui-shell');
  await expect(second).toHaveAttribute('data-native-ui-shell', '');
  for (const showSecond of [false, true, false]) {
    await page
      .locator('app-album-page')
      .evaluateAll(
        (pages, showSecond) =>
          pages.forEach((element) => element.classList.toggle('ion-page-hidden', element.hasAttribute('data-second') !== showSecond)),
        showSecond,
      );
    await expect(showSecond ? second : first).toHaveAttribute('data-native-ui-shell', '');
    await expect(showSecond ? first : second).not.toHaveAttribute('data-native-ui-shell');
  }
});

test('a Leave sent before native Enter completes remains the final state', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    (window as any).__nativeUIShell.delay = 200;
    (document.querySelector('app-album-page ion-fab-button') as HTMLElement).click();
    (document.querySelector('app-album-page ion-footer ion-button') as HTMLElement).click();
  });
  await page.waitForTimeout(600);
  await expect
    .poll(() => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.search)?.search.active))
    .toBe(false);
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  expect(errors).toEqual([]);
});

test('app normalization wins over old native input while blur still terminates focus', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  await page.locator('app-album-page ion-fab-button').evaluate((button: HTMLElement) => button.click());
  await expect
    .poll(() => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.search)?.search.active))
    .toBe(true);
  await footer.locator('ion-searchbar').evaluate((bar: HTMLIonSearchbarElement) => {
    const state = (window as any).__nativeUIShell;
    const snapshot = state.updates.at(-1);
    const search = snapshot.controls.find((c: any) => c.search).search;
    const emit = (phase: string, value: string) =>
      state.search({
        id: search.id,
        revision: snapshot.revision,
        sequence: ++state.sequence,
        phase,
        value,
        composing: false,
        valueVersion: search.valueVersion,
      });
    bar.addEventListener(
      'ionInput',
      () => {
        bar.value = bar.value?.toUpperCase();
      },
      { once: true },
    );
    emit('focus', '');
    emit('input', 'normalized');
    emit('input', 'late');
    emit('blur', 'late');
  });
  await expect(footer.locator('ion-searchbar')).toHaveJSProperty('value', 'NORMALIZED');
  await expect
    .poll(() => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.search)?.search.focused))
    .toBe(false);
});

test('a lost search bridge releases Enter and keeps the current value in Web', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  await page.evaluate(() => {
    const page = document.querySelector('app-album-page')!;
    (page.querySelector('ion-searchbar') as HTMLIonSearchbarElement).value = 'bridge retained';
    (window as any).__nativeUIShell.hang = true;
    (page.querySelector('ion-fab-button') as HTMLElement).click();
  });
  await expect(footer).not.toHaveAttribute('data-native-ui-shell', { timeout: 10000 });
  await expect(footer).toHaveCSS('opacity', '1');
  await expect(footer.locator('ion-searchbar')).toHaveJSProperty('value', 'bridge retained');
  expect(await page.evaluate(() => (window as any).nativeUIShell.getStatus().state)).toBe('stopped');
  await footer.locator('ion-button').click();
  await expect(footer).toHaveCSS('opacity', '0');
});

test('a retained FAB accepts a second click while its current native update awaits acknowledgement', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  await page.evaluate(() => {
    (window as any).__nativeUIShell.delay = 500;
  });
  await activate(page, 'Center FAB actions');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__nativeUIShell.updates
          .at(-1)
          .controls.some((c: any) => c.kind === 'ion-fab' && c.items.length === 7 && c.items.filter((i: any) => i.visible).length > 1),
      ),
    )
    .toBe(true);
  await activate(page, 'Center FAB actions');
  await expect(fab).toHaveJSProperty('activated', false);
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
});

test('FAB keeps its cover while Stencil show and the rendered host class catch up', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  await activate(page, 'Center FAB actions');
  await expect(fab.locator('ion-fab-list').first().locator('ion-fab-button')).toHaveClass(/fab-button-show/);
  await fab.evaluate((element) => {
    const child = element.querySelector('ion-fab-list ion-fab-button') as HTMLIonFabButtonElement;
    // Hold the real Stencil intermediate state long enough to exercise a bridge update.
    Object.defineProperty(child, 'show', { configurable: true, get: () => true });
    child.classList.remove('fab-button-show');
    (window as any).__fabRetired = false;
    element.addEventListener('nativeUIShellChange', () => {
      if (!element.hasAttribute('data-native-ui-shell')) (window as any).__fabRetired = true;
    });
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__nativeUIShell.updates
          .at(-1)
          .controls.some((c: any) => c.kind === 'ion-fab' && c.items.length === 7 && c.items[1].visible === false),
      ),
    )
    .toBe(true);
  await activate(page, 'Center FAB actions');
  await expect(fab).toHaveJSProperty('activated', false);
  expect(await page.evaluate(() => (window as any).__fabRetired)).toBe(false);
});

test('native resume retires search even when WebKit visibility stayed visible', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  await footer.locator('ion-searchbar').evaluate(async (bar: HTMLIonSearchbarElement) => {
    bar.value = 'background';
    await bar.setFocus();
  });
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('nativeUIShellRefresh'), { retireSearch: true })));
  await expect
    .poll(() => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.search)?.search.active))
    .toBe(false);
  await expect(footer.locator('ion-searchbar')).toHaveJSProperty('value', 'background');
});

test('top fixed FAB counts safe area once while preserving edge placement', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  await page.locator('html').evaluate((el) => (el as HTMLElement).style.setProperty('--ion-safe-area-top', '62px'));
  const edge = page.locator('ion-fab.fab-vertical-top.fab-edge');
  await expect(edge).toHaveCSS('top', '10px');
  const measure = () =>
    edge.evaluate((fab) => {
      const content = fab.parentElement!;
      const button = fab.querySelector('ion-fab-button')!;
      const rect = button.getBoundingClientRect();
      return { y: rect.y + rect.height / 2, expected: content.getBoundingClientRect().y + 10 };
    });
  let rect = await measure();
  expect(rect.y).toBeCloseTo(rect.expected, 1);
  await expect(edge).toHaveAttribute('data-native-ui-shell', '');
  await page
    .locator('ion-content')
    .first()
    .evaluate((el: HTMLIonContentElement) => (el.fullscreen = false));
  await expect(edge).toHaveCSS('top', '10px');
  rect = await measure();
  expect(rect.y).toBeCloseTo(rect.expected, 1);
  await edge.evaluate((fab) => fab.closest('.ion-page')!.querySelector(':scope > ion-header')!.remove());
  await expect(edge).toHaveCSS('top', '62px');
});

for (const [kind, selector] of [
  ['ion-button', 'ion-button[type=submit]'],
  ['ion-back-button', 'ion-back-button'],
  ['ion-menu-button', 'ion-buttons:has(> ion-menu-button)'],
]) {
  test(`${kind} stays Web outside fixed header/footer toolbars`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockNative(page);
    await page.goto('/main/index/native-ui-shell');
    const source = page.locator(`app-native-ui-shell ${selector}`);
    await expect(source).toHaveAttribute('data-native-ui-shell', '');
    const id = await page.evaluate(
      (kind) => (window as any).__nativeUIShell.updates.at(-1).controls.find((c: any) => c.kind === kind).id,
      kind,
    );
    await source.evaluate((element) => {
      const zone = document.createElement('div');
      zone.style.cssText = 'position:fixed;top:330px;left:12px;width:300px;height:140px;z-index:200';
      element.closest('app-native-ui-shell')!.append(zone);
      (window as any).__placement = { element, parent: element.parentElement, next: element.nextSibling, slot: element.slot, zone };
    });
    for (const markup of [
      '<ion-header data-target></ion-header>',
      '<ion-footer data-target></ion-footer>',
      '<ion-toolbar data-target></ion-toolbar>',
      '<ion-content style="height:140px" data-target></ion-content>',
      '<ion-content style="height:140px"><ion-header><ion-toolbar data-target></ion-toolbar></ion-header></ion-content>',
      '<ion-header><ion-toolbar><ion-content style="height:140px" data-target></ion-content></ion-toolbar></ion-header>',
    ]) {
      await page.evaluate((markup) => {
        const { element, zone } = (window as any).__placement;
        // These destinations have no toolbar start slot; keep the Web control assigned.
        element.slot = '';
        zone.innerHTML = markup;
        zone.querySelector('[data-target]').append(element);
      }, markup);
      await expect(source).not.toHaveAttribute('data-native-ui-shell');
      await expect
        .poll(() => page.evaluate((id) => (window as any).__nativeUIShell.updates.at(-1).controls.some((c: any) => c.id === id), id))
        .toBe(false);
      await expect(source).toHaveCSS('visibility', 'visible');
      await page.evaluate(() => {
        const { element, parent, next, slot } = (window as any).__placement;
        parent.insertBefore(element, next);
        element.slot = slot;
      });
      await expect(source, `restored from ${markup}`).toHaveAttribute('data-native-ui-shell', '');
    }
    // A footer toolbar is supported too; do not accidentally restrict this to headers.
    await page.evaluate(() => {
      const { element, zone } = (window as any).__placement;
      zone.innerHTML = '<ion-footer><ion-toolbar></ion-toolbar></ion-footer>';
      zone.querySelector('ion-toolbar').append(element);
    });
    await expect(source).toHaveAttribute('data-native-ui-shell', '');
  });
}

test('FAB requires a real content fixed slot and recovers after relocation', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  for (const slot of ['', 'start']) {
    await fab.evaluate((element, slot) => element.setAttribute('slot', slot), slot);
    await expect(fab).not.toHaveAttribute('data-native-ui-shell');
    if (!slot) await expect(fab.locator(':scope > ion-fab-button')).toHaveCSS('visibility', 'visible');
    await fab.evaluate((element) => element.setAttribute('slot', 'fixed'));
    await expect(fab).toHaveAttribute('data-native-ui-shell', '');
  }
  await fab.evaluate((element) => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:absolute;inset:0;overflow:auto';
    element.replaceWith(wrapper);
    wrapper.append(element);
  });
  await expect(fab).not.toHaveAttribute('data-native-ui-shell');
  await fab.evaluate((element) => element.parentElement!.replaceWith(element));
  await expect(fab).toHaveAttribute('data-native-ui-shell', '');
});

test('search registration cannot bypass fixed placement restrictions', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  await footer.evaluate((footer) => {
    const page = footer.parentElement!;
    const fab = page.querySelector('ion-fab')!;
    const buttons = footer.querySelector('ion-buttons')!;
    (window as any).__searchPlacement = { page, footer, fab, buttons, toolbar: buttons.parentElement };
  });
  for (const placement of ['fab-slot', 'fab-wrapper', 'back-outside', 'footer-scroll']) {
    await page.evaluate((placement) => {
      const { page, footer, fab, buttons } = (window as any).__searchPlacement;
      if (placement === 'fab-slot') fab.removeAttribute('slot');
      if (placement === 'fab-wrapper') {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:absolute;inset:0;overflow:auto';
        fab.replaceWith(wrapper);
        wrapper.append(fab);
      }
      if (placement === 'back-outside') footer.append(buttons);
      if (placement === 'footer-scroll') page.querySelector('ion-content').append(footer);
    }, placement);
    await expect(footer).not.toHaveAttribute('data-native-ui-shell');
    await expect
      .poll(() => page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).controls.some((c: any) => c.search?.available)))
      .toBe(false);
    await page.evaluate((placement) => {
      const { page, footer, fab, buttons, toolbar } = (window as any).__searchPlacement;
      if (placement === 'fab-slot') fab.setAttribute('slot', 'fixed');
      if (placement === 'fab-wrapper') fab.parentElement.replaceWith(fab);
      if (placement === 'back-outside') toolbar.prepend(buttons);
      if (placement === 'footer-scroll') page.append(footer);
    }, placement);
    await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  }
});

for (const theme of ['light', 'class', 'system', 'always'] as const) {
  test(`native tabs and FABs follow the applied ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.emulateMedia({ colorScheme: 'light' });
    await mockNative(page);
    await page.goto('/main/index/floating-action-button');
    await expect(page.locator('ion-fab[data-native-ui-shell]')).toHaveCount(4);
    // Keep color-scheme and the OS independent from the actual theme stylesheet.
    await page.evaluate(() => {
      document.documentElement.classList.remove('ion-palette-dark');
      document.documentElement.style.colorScheme = 'normal';
    });
    if (theme !== 'light') {
      await page.addStyleTag({
        content: compile(resolve(__dirname, `../../src/styles/ionic-theme-ios27-dark-${theme}.scss`), { importers: [importer] }).css,
      });
    }
    for (const dark of [true, false, true]) {
      if (theme === 'class') {
        await page.evaluate((dark) => document.documentElement.classList.toggle('ion-palette-dark', dark), dark);
      } else {
        // System changes must update native appearance without DOM mutation or manual refresh.
        await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
      }
      const expected = theme === 'always' || (theme !== 'light' && dark);
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--ios26-glass-background-rgb').replace(/\s/g, ''),
          ),
        )
        .toBe(expected ? '62,62,62' : '255,255,255');
      await expect
        .poll(() =>
          page.evaluate(() => {
            const controls = (window as any).__nativeUIShell.updates.at(-1).controls;
            return ['ion-tab-bar', 'ion-fab'].map((kind) => controls.filter((c: any) => c.kind === kind).map((c: any) => c.dark));
          }),
        )
        .toEqual([[expected], [expected, expected, expected, expected]]);
    }
  });
}

test('native handoff crossfades visual opacity while transferring ownership once', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const segment = page.locator('app-native-ui-shell ion-segment');
  await expect(segment).toHaveAttribute('data-native-ui-shell', '');
  await expect(segment).toHaveCSS('visibility', 'hidden');
  await segment.evaluate((el) => el.classList.add('ios-theme-shell-disabled'));
  await expect(segment).toHaveAttribute('data-native-ui-shell-fading', '');
  await expect(segment).not.toHaveAttribute('data-native-ui-shell');
  const sample = async () =>
    segment.evaluate((el) => {
      const animation = el.getAnimations().find((effect) => effect.effect?.getTiming().duration === 180)!;
      animation.pause();
      animation.currentTime = 90;
      const result = {
        opacity: Number(getComputedStyle(el).opacity),
        pointerEvents: getComputedStyle(el).pointerEvents,
        hidden: el.getAttribute('aria-hidden'),
      };
      animation.finish();
      return result;
    });
  const web = await sample();
  expect(web.opacity).toBeCloseTo(0.5, 1);
  expect(web.pointerEvents).not.toBe('none');
  expect(web.hidden).not.toBe('true');
  await expect(segment).not.toHaveAttribute('data-native-ui-shell-fading');
  await segment.evaluate((el) => el.classList.remove('ios-theme-shell-disabled'));
  await expect(segment).toHaveAttribute('data-native-ui-shell', '');
  await expect(segment).toHaveAttribute('data-native-ui-shell-fading', '');
  const native = await sample();
  expect(native.opacity).toBeCloseTo(0.5, 1);
  expect(native.pointerEvents).toBe('none');
  expect(native.hidden).toBe('true');
  await expect(segment).toHaveCSS('visibility', 'hidden');
});

test('reduced motion hands off without a crossfade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const segment = page.locator('app-native-ui-shell ion-segment');
  await expect(segment).toHaveAttribute('data-native-ui-shell', '');
  await expect(segment).not.toHaveAttribute('data-native-ui-shell-fading');
  const duration = await page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).transitionDuration);
  expect(duration).toBe(0);
  await segment.evaluate((el) => el.classList.add('ios-theme-shell-disabled'));
  await expect(segment).not.toHaveAttribute('data-native-ui-shell');
  await expect(segment).toHaveCSS('opacity', '1');
});

test('tab switches hand off without a crossfade', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const segment = page.locator('app-native-ui-shell ion-segment');
  await expect(segment).toHaveAttribute('data-native-ui-shell', '');
  const before = await page.evaluate(() => (window as any).__nativeUIShell.updates.length);
  await activate(page, 'Docs');
  await expect(page).toHaveURL(/\/main\/docs/);
  await expect
    .poll(() =>
      page.evaluate(
        (start) =>
          (window as any).__nativeUIShell.updates
            .slice(start)
            .some(
              (update: any) => update.transitionDuration === 0 && !update.controls.some((control: any) => control.kind === 'ion-segment'),
            ),
        before,
      ),
    )
    .toBe(true);
  await expect(segment).not.toHaveAttribute('data-native-ui-shell-fading');
});

test('cancelling a handoff animation releases its temporary visibility override', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const segment = page.locator('app-native-ui-shell ion-segment');
  await expect(segment).toHaveAttribute('data-native-ui-shell', '');
  await expect(segment).toHaveCSS('visibility', 'hidden');
  await segment.evaluate((el) => el.classList.add('ios-theme-shell-disabled'));
  await expect(segment).toHaveAttribute('data-native-ui-shell-fading', '');
  await segment.evaluate((el) => el.getAnimations().forEach((animation) => animation.cancel()));
  await expect(segment).not.toHaveAttribute('data-native-ui-shell-fading');
  await expect(segment).toHaveCSS('opacity', '1');
  await expect(segment).toHaveCSS('visibility', 'visible');
});

for (const direction of ['ltr', 'rtl']) {
  for (const slot of ['start', 'end']) {
    test(`projects button icon spacing and asymmetric insets for ${slot} in ${direction}`, async ({ page }) => {
      await mockNative(page);
      await page.goto('/main/index/native-ui-shell');
      const button = page.locator('app-native-ui-shell ion-button[type="submit"]');
      await expect(button).toHaveAttribute('data-native-ui-shell', '');
      await button.evaluate(
        (el, { direction, slot }) => {
          el.style.direction = direction;
          el.style.setProperty('--padding-start', '10px');
          el.style.setProperty('--padding-end', '14px');
          const surface = el.shadowRoot!.querySelector<HTMLElement>('[part="native"]')!;
          surface.style.setProperty('border-inline-start-width', '2px', 'important');
          surface.style.setProperty('border-inline-end-width', '3px', 'important');
          const icon = el.querySelector('ion-icon')!;
          icon.slot = slot;
          icon.style.marginInlineStart = slot === 'start' ? '-3px' : '5px';
          icon.style.marginInlineEnd = slot === 'start' ? '5px' : '-3px';
        },
        { direction, slot },
      );
      await expect
        .poll(() =>
          page.evaluate(() => {
            const item = (window as any).__nativeUIShell.updates.at(-1)?.controls.find((control: any) => control.kind === 'ion-button')
              ?.items[0];
            return item && [item.imagePadding, item.contentInsetLeading, item.contentInsetTrailing];
          }),
        )
        .toEqual(slot === 'start' ? [5, 9, 17] : [5, 12, 14]);
    });
  }
}

for (const direction of ['ltr', 'rtl']) {
  test(`projects both icon-only back button margins in ${direction}`, async ({ page }) => {
    await mockNative(page);
    await page.goto('/main/index/native-ui-shell');
    const button = page.locator('app-native-ui-shell ion-back-button');
    await expect(button).toHaveAttribute('data-native-ui-shell', '');
    await button.evaluate((el, direction) => {
      el.style.direction = direction;
      el.style.setProperty('--padding-start', '10px');
      el.style.setProperty('--padding-end', '14px');
      el.style.setProperty('--icon-margin-start', '-6px');
      el.style.setProperty('--icon-margin-end', '2px');
      const surface = el.shadowRoot!.querySelector<HTMLElement>('[part="native"]')!;
      surface.style.setProperty('border-inline-start-width', '2px', 'important');
      surface.style.setProperty('border-inline-end-width', '3px', 'important');
    }, direction);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const item = (window as any).__nativeUIShell.updates.at(-1)?.controls.find((control: any) => control.kind === 'ion-back-button')
            ?.items[0];
          return item && [item.imagePadding, item.contentInsetLeading, item.contentInsetTrailing];
        }),
      )
      .toEqual([0, 6, 19]);
  });
}

test('rejected cached search is replaced by ordinary native tabs after navigation', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1210 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  await expect(page.locator('app-album-page ion-footer')).toHaveAttribute('data-native-ui-shell', '');
  await page.evaluate(() => ((window as any).__nativeUIShell.rejectInactiveSearch = true));
  await activate(page, 'Index');
  await expect(page).toHaveURL('/main/index');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const control = (window as any).__nativeUIShell.updates.at(-1)?.controls.find((c: any) => c.kind === 'ion-tab-bar');
        return !!control && !control.search;
      }),
    )
    .toBe(true);
  await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-shell', '');
  await activate(page, 'Docs');
  await expect(page).toHaveURL('/main/docs');
});

for (const invalidated of [false, true]) {
  test(`input received before acquisition acknowledgement is ${invalidated ? 'rejected after disabling' : 'delivered once'}`, async ({
    page,
  }) => {
    await mockNative(page);
    await page.goto('/main/index/native-ui-shell');
    const button = page.locator('app-native-ui-shell ion-button[type="submit"]');
    await expect(button).toHaveAttribute('data-native-ui-shell', '');
    await button.evaluate((el) => (el.parentElement!.hidden = true));
    await expect(button).not.toHaveAttribute('data-native-ui-shell');
    await page.evaluate(() => ((window as any).__nativeUIShell.delay = 1000));
    const previous = await page.evaluate(() => (window as any).__nativeUIShell.updates.at(-1).revision);
    await button.evaluate((el) => (el.parentElement!.hidden = false));
    await expect
      .poll(() =>
        page.evaluate((previous) => {
          const snapshot = (window as any).__nativeUIShell.updates.at(-1);
          return snapshot.revision > previous && snapshot.controls.some((c: any) => c.kind === 'ion-button');
        }, previous),
      )
      .toBe(true);
    await expect(button).not.toHaveAttribute('data-native-ui-shell');
    await activate(page, (await button.locator('[data-label]').textContent()) as string, true);
    await expect(page.locator('[data-save-count]')).toHaveText('0');
    if (invalidated) await button.evaluate((el: any) => (el.disabled = true));
    await page.evaluate(() => ((window as any).__nativeUIShell.delay = 0));
    if (invalidated) {
      await page.waitForTimeout(1200);
      await expect(page.locator('[data-save-count]')).toHaveText('0');
    } else {
      await expect(page.locator('[data-save-count]')).toHaveText('1');
    }
  });
}

test('rejected search retries when tab content changes without resizing', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1210 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  await page.evaluate(() => ((window as any).__nativeUIShell.rejectAllSearch = true));
  await page
    .locator('ion-tab-button ion-label')
    .first()
    .evaluate((el) => (el.textContent = 'Rejected'));
  await expect(footer).not.toHaveAttribute('data-native-ui-shell');
  const before = await page.locator('ion-tab-bar').boundingBox();
  await page.evaluate(() => ((window as any).__nativeUIShell.rejectAllSearch = false));
  await page
    .locator('ion-tab-button ion-label')
    .first()
    .evaluate((el) => (el.textContent = 'Index'));
  await expect(footer).toHaveAttribute('data-native-ui-shell', '');
  expect(await page.locator('ion-tab-bar').boundingBox()).toEqual(before);
});
