import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { compile, NodePackageImporter } from 'sass';
import { resolve } from 'node:path';
import * as overlayTypes from '../src/app/overlay-types';
import type {
  NativeUIControl,
  NativeUIItem,
  NativeUISnapshot,
  NativeUIPlugin,
} from '../../packages/capacitor-native-ui/src/native/definitions';
import type { NativeUIMockCore, TestAppElement } from './native-ui-mock';

const importer = new NodePackageImporter(resolve(__dirname, '../../'));

interface NativeUIMock extends NativeUIMockCore {
  update: NativeUIPlugin['update'];
  toolbarProgress: { id: number; progress: number }[];
  delay: number;
  hang: boolean;
  rejectInactiveSearch: boolean;
  rejectAllSearch: boolean;
  rejectControlLabel: string;
  configuredWith?: { suppressScrollEdgeEffect?: boolean };
  lateSearch?: () => void;
  tabRetirements: number;
  retirementDetails: { path: string; tabs: string }[];
  preparedPopovers: number;
  geometry?: Record<string, { x: number; y: number; width: number; height: number }>;
}

const mockNative = async (page: Page, fail = false, nativeEdge: 'leading' | 'trailing' | null | 'unreported' = 'trailing') => {
  const script = ([fail, nativeEdge]: readonly [boolean, 'leading' | 'trailing' | null | 'unreported']) => {
    const mock = {
      updates: [] as NativeUISnapshot[],
      toolbarProgress: [] as { id: number; progress: number }[],
      async setToolbarTransitionProgress(value: { id: number; progress: number }) {
        this.toolbarProgress.push(value);
      },
      sequence: 0,
      delay: 0,
      hang: false,
      rejectInactiveSearch: false,
      rejectAllSearch: false,
      rejectControlLabel: '',
      configuredWith: undefined as { suppressScrollEdgeEffect?: boolean } | undefined,
      lateSearch: undefined as (() => void) | undefined,
      tabRetirements: 0,
      retirementDetails: [] as { path: string; tabs: string }[],
      listeners: {} as Record<string, ((event: never) => void)[]>,
      addListener(eventName: string, callback: (event: never) => void) {
        const listeners = (this.listeners[eventName] ??= []);
        listeners.push(callback);
        return Promise.resolve({ remove: async () => listeners.splice(listeners.indexOf(callback), 1) });
      },
      async removeAllListeners() {
        this.listeners = {};
      },
      notifyListeners(eventName: string, data: unknown) {
        for (const listener of this.listeners[eventName] ?? []) listener(data as never);
      },
      preparedPopovers: 0,
      async prepareOverlay() {
        this.preparedPopovers++;
        throw new Error('Native popover unavailable');
      },
      async closeOverlay() {},
      async stopOverlays() {},
      async configure(options: { suppressScrollEdgeEffect?: boolean }) {
        this.configuredWith = options;
        return { supported: true, verticalBars: nativeEdge !== null };
      },
      async getVerticalBarsGeometry() {
        return { revision: this.updates.at(-1)?.revision, items: (this as NativeUIMock).geometry ?? {} };
      },
      async getWebViewMetrics() {
        return { radius: 0, verticalBarEdge: nativeEdge === 'unreported' ? null : nativeEdge };
      },
      async update(options: NativeUISnapshot) {
        this.updates.push(options);
        if (this.hang) await new Promise(() => {});
        return this.rejections(options);
      },
      async clear(options: { revision: number }) {
        this.updates.push({ revision: options.revision, viewportWidth: 0, controls: [] });
        return this.rejections(options);
      },
      async rejections(options: {
        revision?: number;
        controls?: NativeUIControl[];
        toolbarTransition?: NativeUISnapshot['toolbarTransition'];
      }) {
        if (this.delay) await new Promise((resolve) => setTimeout(resolve, this.delay));
        if (fail && options.controls?.length) throw new Error('Test native failure');
        return {
          revision: options.revision,
          toolbarTransition: options.toolbarTransition?.id,
          rejectedSearches:
            this.rejectInactiveSearch || this.rejectAllSearch
              ? options.controls
                  ?.filter((control) => control.search && (this.rejectAllSearch || control.search.available === false))
                  .map((control) => control.id)
              : [],
          rejectedControls: this.rejectControlLabel
            ? options.controls
                ?.filter((control) => control.items.some((item) => item.accessibilityLabel === this.rejectControlLabel))
                .map((control) => control.id)
            : [],
        };
      },
    };

    const foldable = {
      async getBarPlacement() {
        if (nativeEdge === 'unreported') return new Promise(() => {});
        return { verticalBarEdge: nativeEdge, inset: nativeEdge ? 84 : 0 };
      },
      async getFoldState() {
        return { state: 'flat', isSeparating: false, posture: 'flat' };
      },
      listeners: {} as Record<string, ((event: never) => void)[]>,
      addListener: mock.addListener,
      notifyListeners: mock.notifyListeners,
    };

    window.CapacitorCustomPlatform = { name: 'ios' };
    // Substitute the mock as the plugin implementation when @capacitor/core
    // initialises its global, before the app registers 'NativeUI'.
    let capacitor: { registerPlugin: (name: string, implementations?: Record<string, unknown>) => unknown } | undefined;
    Object.defineProperty(window, 'Capacitor', {
      configurable: true,
      get: () => capacitor,
      set: (instance) => {
        const available = instance.isPluginAvailable;
        instance.isPluginAvailable = (name: string) => name === 'NativeUI' || available(name);
        const registerPlugin = instance.registerPlugin;
        instance.registerPlugin = (name: string, implementations?: Record<string, unknown>) =>
          name === 'NativeUI' ? mock : name === 'Foldable' ? foldable : registerPlugin(name, implementations);
        capacitor = instance;
      },
    });
  };
  await page.addInitScript(script, [fail, nativeEdge] as const);
};

const activate = (page: Page, label: string, duplicate = false) =>
  page.evaluate(
    ({ label, duplicate }) => {
      const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
      const snapshot = state.updates.findLast((value) =>
        value.controls.some((control) => control.items.some((item) => item.label === label || item.accessibilityLabel === label)),
      )!;
      const item = snapshot.controls
        .flatMap((control) => control.items)
        .find((item) => item.label === label || item.accessibilityLabel === label)!;
      const event = { id: item.id, revision: snapshot.revision, sequence: ++state.sequence };
      state.notifyListeners('activate', event);
      if (duplicate) state.notifyListeners('activate', event);
    },
    { label, duplicate },
  );

test('FAB keeps a complete native batch across staggered lists and measures each button', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  await expect(page.locator('ion-fab[data-native-ui-projected]')).toHaveCount(4);
  const state = () =>
    page.evaluate(() => {
      const fab = document.querySelector('ion-fab[horizontal=center]')!;
      const controls = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!.controls;
      return controls.find((c: NativeUIControl) => c.kind === 'floating-action-button' && c.items.length === 7)!;
    });
  const closed = await state();
  expect(closed.items.filter((i: NativeUIItem) => i.visible)).toHaveLength(1);
  expect(closed.items.every((i: NativeUIItem) => i.icon && i.closeIcon)).toBe(true);
  await fab.locator(':scope > ion-fab-button').evaluate((b: HTMLIonFabButtonElement) => b.click());
  await expect.poll(async () => (await state()).items.filter((i: NativeUIItem) => i.visible).length).toBe(7);
  const opened = await state();
  expect(opened.items.map((i: NativeUIItem) => i.id)).toEqual(closed.items.map((i: NativeUIItem) => i.id));
  const rects = await fab.locator('ion-fab-button').evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().toJSON()));
  for (let index = 0; index < rects.length; index++) {
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(opened.items[index][key]).toBeCloseTo(rects[index][key], 1);
  }
  await fab.evaluate((f: HTMLIonFabElement) => f.close());
  await expect.poll(async () => (await state()).items.filter((i: NativeUIItem) => i.visible).length).toBe(1);
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
});

test('FAB activation stays with Ionic and rejects hidden, disabled and duplicate actions', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  await fab.evaluate((element) => {
    const app = document.querySelector('ion-app') as TestAppElement;
    app.fabClicks = 0;
    element.querySelector('ion-fab-list ion-fab-button')!.addEventListener('click', () => (app.fabClicks = (app.fabClicks ?? 0) + 1));
  });
  await activate(page, 'Up action');
  expect(await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).fabClicks)).toBe(0);
  await activate(page, 'Center FAB actions', true);
  await expect.poll(() => fab.evaluate((element: HTMLIonFabElement) => element.activated)).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((c: NativeUIControl) => c.kind === 'floating-action-button' && c.items.length === 7)!
            .items.filter((i: NativeUIItem) => i.visible).length,
      ),
    )
    .toBe(7);
  await activate(page, 'Up action', true);
  expect(await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).fabClicks)).toBe(1);
  await expect.poll(() => fab.evaluate((element: HTMLIonFabElement) => element.activated)).toBe(false);
  await fab.locator(':scope > ion-fab-button').evaluate((element: HTMLIonFabButtonElement) => (element.disabled = true));
  await activate(page, 'Center FAB actions');
  await expect.poll(() => fab.evaluate((element: HTMLIonFabElement) => element.activated)).toBe(false);
});

test('FAB reverses during stagger, keeps its cover, and ignores late hidden actions', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  const evidence = await fab.evaluate(async (element: HTMLIonFabElement) => {
    const main = element.querySelector('ion-fab-button')!;
    const children = Array.from(element.querySelectorAll('ion-fab-list ion-fab-button')) as HTMLIonFabButtonElement[];
    const before = children.map((b) => b.show);
    main.click();
    // Four lists show their first child immediately; second children follow later.
    await new Promise((r) => setTimeout(r, 15));
    const during = children.map((b) => b.show);
    const covered = element.hasAttribute('data-native-ui-projected');
    main.click();
    await new Promise((r) => setTimeout(r, 100));
    return { before, during, after: children.map((b) => b.show), covered, active: element.activated };
  });
  expect(evidence.before.every((show) => !show)).toBe(true);
  expect(evidence.during.some(Boolean) && evidence.during.some((show) => !show)).toBe(true);
  expect(evidence.after.every((show) => !show)).toBe(true);
  expect(evidence.covered).toBe(true);
  expect(evidence.active).toBe(false);
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => (Capacitor.registerPlugin<NativeUIMock>('NativeUI').delay = 120));
  await fab.evaluate((element: HTMLIonFabElement) => (element.activated = true));
  await fab.evaluate((element: HTMLIonFabElement) => {
    element.style.display = 'none';
  });
  await expect(fab).not.toHaveAttribute('data-native-ui-projected');
  await page.waitForTimeout(200);
  await expect(fab).not.toHaveAttribute('data-native-ui-projected');
});

test('FAB restores excluded groups and follows icon, list and theme changes', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  const child = fab.locator('ion-fab-list ion-fab-button').first();
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  for (const name of ['ios-theme-disabled', 'ios26-disabled', 'native-ui-disabled']) {
    await child.evaluate((b, name) => b.classList.add(name), name);
    await expect(fab).not.toHaveAttribute('data-native-ui-projected');
    await child.evaluate((b, name) => b.classList.remove(name), name);
    await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  }
  await child.evaluate((b: HTMLIonFabButtonElement) => (b.color = 'primary'));
  await expect(fab).not.toHaveAttribute('data-native-ui-projected');
  await child.evaluate((b: HTMLIonFabButtonElement) => (b.color = undefined));
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  await fab.evaluate((element: HTMLIonFabElement) => (element.activated = true));
  await child.locator('ion-icon:not([part=close-icon])').evaluate((icon: HTMLIonIconElement) => (icon.name = 'document'));
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  await child.evaluate((b) => b.remove());
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((c: NativeUIControl) => c.kind === 'floating-action-button' && c.items.length === 6)?.items.length,
      ),
    )
    .toBe(6);
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  await page.goto('/main/index/floating-action-button-fixed');
  await expect(page.locator('ion-fab[data-native-ui-projected]')).toHaveCount(0);
});

test('FAB keeps custom main and list button scales on the Web', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  for (const selector of [':scope > ion-fab-button', 'ion-fab-list ion-fab-button']) {
    const button = fab.locator(selector).first();
    if (selector.startsWith('ion-fab-list')) {
      await activate(page, 'Center FAB actions');
      await expect.poll(() => button.evaluate((b: HTMLIonFabButtonElement) => b.show)).toBe(true);
    }
    for (const scale of [1.25, 0.75]) {
      await button.evaluate((b, scale) => (b.style.transform = `scale(${scale})`), scale);
      await expect(fab).not.toHaveAttribute('data-native-ui-projected');
      await expect(button).toHaveCSS('transform', `matrix(${scale}, 0, 0, ${scale}, 0, 0)`);
      await button.evaluate((b) => (b.style.transform = ''));
      await expect(fab).toHaveAttribute('data-native-ui-projected', '');
    }
  }
  await fab.locator(':scope > ion-fab-button').evaluate((b) => (b.style.transform = 'scale(0)'));
  await expect(fab).not.toHaveAttribute('data-native-ui-projected');
});

test('FAB keeps custom container and list motion on the Web and recovers after removal', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  await page.addStyleTag({ content: '@keyframes fab-review-move { to { transform: translateY(40px); } }' });
  for (const target of [fab, fab.locator('ion-fab-list').first()]) {
    await target.evaluate((element) => (element.style.animation = 'fab-review-move 1s linear infinite alternate'));
    await expect(fab).not.toHaveAttribute('data-native-ui-projected');
    await target.evaluate((element) => (element.style.animation = ''));
    await expect(fab).toHaveAttribute('data-native-ui-projected', '');
    await target.evaluate((element) => (element.style.transition = 'transform 1s linear'));
    await expect(fab).not.toHaveAttribute('data-native-ui-projected');
    await target.evaluate((element) => (element.style.transition = ''));
    await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  }
  await activate(page, 'Center FAB actions');
  await expect.poll(() => fab.locator('ion-fab-list ion-fab-button.fab-button-show').count()).toBe(6);
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
});

test('FAB uses measured positions after RTL and viewport changes', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  for (const width of [402, 440]) {
    let rtlIcon = '';
    await page.setViewportSize({ width, height: 874 });
    for (const direction of ['rtl', 'ltr']) {
      await page.evaluate((direction) => (document.documentElement.dir = direction), direction);
      await fab.evaluate((element: HTMLIonFabElement) => (element.activated = true));
      await expect
        .poll(() =>
          page.evaluate(() => {
            const control = Capacitor.registerPlugin<NativeUIMock>('NativeUI')
              .updates.at(-1)!
              .controls.find((c: NativeUIControl) => c.kind === 'floating-action-button' && c.items.length === 7);
            if (!control || control.rtl !== (document.documentElement.dir === 'rtl') || control.items.some((i: NativeUIItem) => !i.visible))
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
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((c: NativeUIControl) => c.kind === 'floating-action-button' && c.items.length === 7)!.items[2].icon,
      );
      if (direction === 'rtl') rtlIcon = icon!;
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
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.some(
            (c: NativeUIControl) =>
              c.kind === 'floating-action-button' && c.items.some((i: NativeUIItem) => i.accessibilityLabel === 'Search albums'),
          ),
      ),
    )
    .toBe(true);
  await activate(page, 'Search albums');
  await expect(fab).not.toHaveAttribute('data-native-ui-projected');
  await expect(page.locator('app-album-page ion-footer')).toHaveCSS('opacity', '1');
  await page.locator('app-album-page ion-footer ion-buttons[slot=start] ion-button').click();
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-projected', '');
});

test('verticalBars tabs request native adaptive rail placement', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index');
  const app = page.locator('ion-app');
  const bar = page.locator('ion-tab-bar');
  await expect(bar).toHaveAttribute('data-native-ui-projected', '');

  await app.evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  await expect(bar).toHaveAttribute('data-native-ui-projected', '');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.some((control: NativeUIControl) => control.kind === 'tab-bar' && control.placement === 'vertical-bars'),
      ),
    )
    .toBe(true);

  await app.evaluate((element) => element.classList.remove('ios-theme-vertical-bars'));
  await expect(bar).toHaveAttribute('data-native-ui-projected', '');
  await expect(bar).toHaveClass(/ios27-enable-gesture/);
});

test('vertical-only defaults keep ordinary controls on the Web', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui?verticalBarsOnly=1');
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { configuredWith, updates } = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
        return {
          suppressScrollEdgeEffect: configuredWith?.suppressScrollEdgeEffect,
          hasRailControls: (updates.at(-1)?.controls.length ?? 0) > 0,
          ordinaryKinds: [
            ...new Set(
              updates
                .flatMap((update: NativeUISnapshot) => update.controls)
                .filter((control: NativeUIControl) => control.placement !== 'vertical-bars')
                .map((control: NativeUIControl) => control.kind),
            ),
          ],
        };
      }),
    )
    .toEqual({ suppressScrollEdgeEffect: false, hasRailControls: true, ordinaryKinds: [] });
});

for (const standalone of [false, true]) {
  test(`vertical native search preserves rail tabs (${standalone ? 'standalone' : 'full shell'})`, async ({ page }) => {
    await mockNative(page);
    await page.route('https://picsum.photos/**', (route) => route.abort());
    await page.goto(`/main/album${standalone ? '?verticalBarsOnly=1' : ''}`);
    await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
    const footer = page.locator('app-album-page ion-footer');
    const fab = page.locator('app-album-page ion-fab');
    const tabs = page.locator('ion-tab-bar');
    const config = () =>
      page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)
          ?.controls.find((control: NativeUIControl) => control.placement === 'vertical-bars' && control.search),
      );
    await expect.poll(config).toBeTruthy();
    await expect(footer).toHaveAttribute('data-native-ui-projected', '');
    await expect(fab).toHaveAttribute('data-native-ui-projected', '');
    const tabState = (control: NativeUIControl) => control.items.map(({ id, selected }) => ({ id, selected }));
    const items = tabState((await config())!);
    await page.evaluate(() => {
      const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
      const snapshot = state.updates.at(-1)!;
      const search = snapshot.controls.find((control: NativeUIControl) => control.search)!.search!;
      state.notifyListeners('activate', { id: search.trigger.id, revision: snapshot.revision, sequence: ++state.sequence });
    });
    await expect.poll(async () => (await config())?.search?.active).toBe(true);
    expect(tabState((await config())!)).toEqual(items);
    await expect(tabs).toHaveAttribute('data-native-ui-projected', '');
    // Native enter must bypass the Web search morph.
    await expect(footer).toHaveCSS('opacity', '0');
    await expect(tabs).toHaveCSS('opacity', '1');
    await page.evaluate(() => {
      const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
      const snapshot = state.updates.at(-1)!;
      const search = snapshot.controls.find((control: NativeUIControl) => control.search)!.search!;
      state.notifyListeners('search', {
        id: search.id,
        phase: 'input',
        value: 'native query',
        composing: false,
        valueVersion: search.valueVersion,
        revision: snapshot.revision,
        sequence: ++state.sequence,
      });
    });
    await expect.poll(() => footer.locator('ion-searchbar').evaluate((bar: HTMLIonSearchbarElement) => bar.value)).toBe('native query');
    await page.evaluate(() => {
      const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
      const snapshot = state.updates.at(-1)!;
      const search = snapshot.controls.find((control: NativeUIControl) => control.search)!.search!;
      state.notifyListeners('activate', { id: search.closeId, revision: snapshot.revision, sequence: ++state.sequence });
    });
    await expect.poll(async () => (await config())?.search?.active).toBe(false);
    await expect(tabs).toHaveAttribute('data-native-ui-projected', '');
    expect(tabState((await config())!)).toEqual(items);
    // Late icon hydration must not add the Web close button to the native rail.
    await footer.locator('ion-buttons[slot=start] ion-icon').evaluate((icon) => icon.setAttribute('name', 'close'));
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.evaluate(() => {
        const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
        const snapshot = state.updates.at(-1)!;
        const search = snapshot.controls.find((control: NativeUIControl) => control.search)!.search!;
        state.notifyListeners('activate', { id: search.trigger.id, revision: snapshot.revision, sequence: ++state.sequence });
      });
      await expect.poll(async () => (await config())?.search?.active).toBe(true);
      await footer.locator('ion-searchbar').evaluate((bar: HTMLIonSearchbarElement) => bar.setFocus());
      await expect.poll(async () => (await config())?.search?.focused).toBe(true);
      await page.evaluate(() => {
        const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
        const snapshot = state.updates.at(-1)!;
        const search = snapshot.controls.find((control: NativeUIControl) => control.search)!.search!;
        state.notifyListeners('activate', { id: search.closeId, revision: snapshot.revision, sequence: ++state.sequence });
      });
      await expect.poll(async () => (await config())?.search?.active).toBe(false);
      expect(tabState((await config())!)).toEqual(items);
    }
    await activate(page, 'Index');
    await activate(page, 'Library');
    await expect.poll(async () => (await config())?.search?.available).toBe(true);
  });
}

test('vertical Web tabs remain visible while searching without a native rail', async ({ page }) => {
  await mockNative(page, false, null);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album?verticalBarsOnly=1');
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  const tabs = page.locator('ion-tab-bar');
  await expect(tabs).not.toHaveAttribute('data-native-ui-projected');
  await page.locator('ion-app > .ios-theme-vertical-bars-search-projection').click();
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveCSS('opacity', '1');
  await tabs.evaluate((element) => element.classList.add('tab-bar-hidden'));
  await expect(tabs).toBeVisible();
  await expect(tabs).toHaveCSS('opacity', '1');
  await expect(tabs.locator('ion-tab-button.tab-selected')).toBeVisible();
  await expect(tabs.locator('ion-tab-button').first()).toHaveCSS('opacity', '1');
  await footer.locator('ion-buttons[slot=start] ion-button').click();
  await expect(footer).toHaveCSS('opacity', '0');
  await expect(tabs).toHaveCSS('opacity', '1');
  let bounds: { x: number; width: number } | undefined;
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.locator('ion-app > .ios-theme-vertical-bars-search-projection').click();
    await expect(footer).toHaveCSS('opacity', '1');
    const frame = await footer.locator('ion-searchbar').evaluate((bar) => {
      const { x, width } = bar.getBoundingClientRect();
      return { x, width };
    });
    if (bounds) expect(frame).toEqual(bounds);
    bounds = frame;
    await footer.locator('ion-buttons[slot=start] ion-button').click();
    await expect(footer).toHaveCSS('opacity', '0');
    await expect(tabs).toHaveCSS('opacity', '1');
  }
});

test('verticalBars back navigation and toolbar slots request native rail placement', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  await page.locator('app-native-ui ion-button[type=submit] ion-icon').evaluate((icon) => {
    icon.setAttribute('slot', 'icon-only');
    icon.parentElement!.querySelector('[data-label]')?.remove();
  });
  const app = page.locator('ion-app');
  const source = page.locator('app-native-ui ion-back-button').first();
  const projection = page.locator('ion-app > ion-back-button.ios-theme-vertical-bars-back-button-projection');
  await expect(source).toHaveAttribute('data-native-ui-projected', '');
  await source.evaluate((element) => {
    const second = document.createElement('ion-back-button');
    second.setAttribute('default-href', '/main/index');
    second.setAttribute('data-second-back', '');
    element.closest('ion-toolbar')?.append(second);
  });
  const secondBack = page.locator('ion-back-button[data-second-back]');
  await expect(secondBack).toHaveClass(/hydrated/);

  await app.evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  await expect(projection).toHaveCount(0);
  await expect(source).toHaveAttribute('data-native-ui-projected', '');
  await expect(secondBack).toBeVisible();
  await expect(secondBack).not.toHaveAttribute('data-native-ui-projected', '');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)
            ?.controls.filter((control: NativeUIControl) => control.kind === 'back-button').length,
      ),
    )
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.some(
              (control: NativeUIControl) =>
                control.kind === 'back-button' && control.placement === 'vertical-bars' && control.toolbarSlot === undefined,
            ) &&
          !Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.some((control: NativeUIControl) => control.items.some((item: NativeUIItem) => item.label === 'Cancel')),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.some(
            (control: NativeUIControl) =>
              control.kind === 'button' &&
              control.placement === 'vertical-bars' &&
              control.toolbarSlot === 'end' &&
              control.items.some((item: NativeUIItem) => item.accessibilityLabel === 'Save'),
          ),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((control: NativeUIControl) => control.kind === 'menu-button')?.toolbarSlot,
      ),
    )
    .toBe('start');

  await app.evaluate((element) => element.classList.remove('ios-theme-vertical-bars'));
  await expect(projection).toHaveCount(0);
  await expect(source).toHaveAttribute('data-native-ui-projected', '');
});

test('native verticalBars toolbar returns with Index after a pushed page', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index');
  await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
  const hasIndexActions = () =>
    page.evaluate(() => {
      const controls = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!.controls;
      return controls.some(
        (control: NativeUIControl) =>
          control.placement === 'vertical-bars' && control.items.some((item: NativeUIItem) => item.accessibilityLabel === 'GitHub'),
      );
    });
  await expect.poll(hasIndexActions).toBe(true);
  await page.getByRole('button', { name: 'button', exact: true }).click();
  await expect(page).toHaveURL(/\/main\/index\/button$/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
        const snapshot = state.updates.at(-1)!;
        return !!snapshot.controls.find((control: NativeUIControl) => control.kind === 'back-button')?.items[0];
      }),
    )
    .toBe(true);
  await page.evaluate(() => {
    const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
    const snapshot = state.updates.at(-1)!;
    const back = snapshot.controls.find((control: NativeUIControl) => control.kind === 'back-button')!.items[0];
    state.notifyListeners('activate', { id: back.id, revision: snapshot.revision, sequence: ++state.sequence });
  });
  await expect(page).toHaveURL(/\/main\/index$/);
  await expect.poll(hasIndexActions).toBe(true);
});

test('native verticalBars actions follow WillEnter and stay enabled during navigation', async ({ page }) => {
  // Projection starts at WillEnter. Wait for the real initial navigation before
  // sending synthetic lifecycle events, or its DidEnter can undo our WillLeave.
  await page.addInitScript(() => {
    document.addEventListener(
      'ionViewDidEnter',
      (event) => {
        const target = event.target as HTMLElement;
        if (target.matches('app-native-ui')) target.setAttribute('data-test-did-enter', '');
      },
      true,
    );
  });
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  await expect(page.locator('app-native-ui')).toHaveAttribute('data-test-did-enter', '');
  await page.locator('app-native-ui ion-button[type=submit] ion-icon').evaluate((icon) => {
    icon.setAttribute('slot', 'icon-only');
    icon.parentElement!.querySelector('[data-label]')?.remove();
  });
  await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
  const source = page.locator('app-native-ui ion-back-button');
  await expect(source).toHaveAttribute('data-native-ui-projected', '');
  // The marker may still belong to the preceding horizontal projection.
  await expect
    .poll(() =>
      page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.some((control: NativeUIControl) => control.kind === 'back-button' && control.placement === 'vertical-bars'),
      ),
    )
    .toBe(true);
  const routedPage = page.locator('app-native-ui.ion-page');

  await routedPage.evaluate((element) => element.dispatchEvent(new CustomEvent('ionViewWillLeave', { bubbles: true })));
  await expect(source).not.toHaveAttribute('data-native-ui-projected', '');
  await routedPage.evaluate((element) => element.dispatchEvent(new CustomEvent('ionViewDidLeave', { bubbles: true })));
  await expect(source).not.toHaveAttribute('data-native-ui-projected', '');
  await page.waitForTimeout(150);
  await expect(source).not.toHaveAttribute('data-native-ui-projected', '');

  await routedPage.evaluate((element) => {
    element.classList.add('ion-page-invisible');
    element.style.pointerEvents = 'none';
    element.dispatchEvent(new CustomEvent('ionViewWillEnter', { bubbles: true }));
  });
  await expect(source).toHaveAttribute('data-native-ui-projected', '');
  const saveDisabled = () =>
    page.evaluate(
      () =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.findLast((update: NativeUISnapshot) =>
            update.controls.some((control: NativeUIControl) =>
              control.items.some((item: NativeUIItem) => item.accessibilityLabel === 'Save'),
            ),
          )!
          .controls.flatMap((control: NativeUIControl) => control.items)
          .find((item: NativeUIItem) => item.accessibilityLabel === 'Save')!.disabled,
    );
  await expect.poll(saveDisabled).toBe(false);
  await page.addStyleTag({ content: '.author-no-pointer { pointer-events: none }' });
  const save = page.locator('app-native-ui ion-button[type=submit]');
  for (const target of [save, save.locator('xpath=..'), save.locator('xpath=../..')]) {
    await target.evaluate((element) => element.classList.add('author-no-pointer'));
    await expect.poll(saveDisabled).toBe(true);
    await target.evaluate((element) => element.classList.remove('author-no-pointer'));
    await expect.poll(saveDisabled).toBe(false);
  }
  await activate(page, 'Save');
  await expect(page.locator('app-native-ui [data-save-count]')).toHaveText('1');
  await routedPage.evaluate((element) => {
    element.classList.remove('ion-page-invisible');
    element.dispatchEvent(new CustomEvent('ionViewDidEnter', { bubbles: true }));
  });
  await expect.poll(saveDisabled).toBe(false);
  await save.evaluate((element) => element.classList.add('author-no-pointer'));
  await expect.poll(saveDisabled).toBe(true);
  await save.evaluate((element) => element.classList.remove('author-no-pointer'));
  await routedPage.evaluate((element) => (element.style.pointerEvents = ''));
  await routedPage.evaluate((element) => element.dispatchEvent(new CustomEvent('ionViewWillLeave', { bubbles: true })));
  await expect(source).not.toHaveAttribute('data-native-ui-projected', '');
  await routedPage.evaluate((element) => element.dispatchEvent(new Event('iosThemeVerticalBarsTransitionCanceled', { bubbles: true })));
  await expect(source).toHaveAttribute('data-native-ui-projected', '');
});

test('verticalBars toolbar sources are hidden before ownership and restored with their lifecycle', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  await page.locator('app-native-ui ion-button[type=submit] ion-icon').evaluate((icon) => {
    icon.setAttribute('slot', 'icon-only');
    icon.parentElement!.querySelector('[data-label]')?.remove();
  });
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  const source = page.locator('app-native-ui ion-button[type=submit]');
  await expect(source).toHaveAttribute('data-native-ui-projected', '');
  await expect(source).toHaveClass(/native-ui-prehidden/);

  const prehidden = await source.evaluate((element) => {
    element.removeAttribute('data-native-ui-projected');
    const style = getComputedStyle(element);
    return { position: style.position, visibility: style.visibility };
  });
  expect(prehidden).toEqual({ position: 'absolute', visibility: 'hidden' });

  const earlyBack = await page.locator('app-native-ui ion-back-button').evaluate((element) => {
    element.removeAttribute('data-native-ui-projected');
    element.classList.remove('native-ui-prehidden');
    const style = getComputedStyle(element);
    return { position: style.position, visibility: style.visibility };
  });
  expect(earlyBack).toEqual({ position: 'absolute', visibility: 'hidden' });

  const customBack = page.locator('app-native-ui ion-back-button');
  await customBack.evaluate((element: HTMLIonBackButtonElement) => (element.color = 'primary'));
  await expect(customBack).not.toHaveAttribute('data-native-ui-projected', '');
  await expect(customBack).toHaveCSS('visibility', 'visible');
  const lateAction = page.locator('app-native-ui ion-button[data-late-action]');
  await page
    .locator('app-native-ui ion-toolbar')
    .first()
    .evaluate((toolbar) => {
      const button = document.createElement('ion-button');
      button.setAttribute('data-late-action', '');
      button.setAttribute('aria-label', 'Late action');
      button.innerHTML = '<ion-icon slot="icon-only" name="checkmark"></ion-icon>';
      toolbar.append(button);
    });
  await expect(lateAction).toHaveAttribute('data-native-ui-projected', '');

  await page.addStyleTag({ content: '.author-hidden { visibility: hidden !important }' });
  await source.evaluate((element) => element.classList.add('author-hidden'));
  await expect(source).not.toHaveAttribute('data-native-ui-projected', '');
  await source.evaluate((element) => element.classList.remove('author-hidden'));
  await expect(source).toHaveAttribute('data-native-ui-vertical-bars-member', '');
  await expect(source).toHaveClass(/native-ui-prehidden/);

  await source.evaluate((element) => element.classList.add('native-ui-disabled'));
  await expect(source).toHaveCSS('visibility', 'visible');

  const lateBackInitially = await page.locator('ion-app').evaluate((root) => {
    const header = document.createElement('ion-header');
    header.innerHTML = '<ion-toolbar><ion-back-button default-href="/main/index"></ion-back-button></ion-toolbar>';
    root.append(header);
    const back = header.querySelector('ion-back-button')!;
    back.setAttribute('data-late-back', '');
    return back.classList.contains('ios-theme-vertical-bars-back-web-owned');
  });
  expect(lateBackInitially).toBe(false);
  const lateBack = page.locator('ion-back-button[data-late-back]');
  await expect(lateBack).toHaveClass(/native-ui-prehidden/);
  await expect(lateBack).toHaveAttribute('data-native-ui-projected', '');
  await page.waitForTimeout(1600); // Past the unhydrated readiness timeout.
  await expect(lateBack).toHaveAttribute('data-native-ui-projected', '');
  await expect(lateBack).not.toHaveClass(/ios-theme-vertical-bars-back-web-owned/);
  await lateBack.evaluate((element) => element.closest('ion-header')?.remove());

  await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).nativeUI!.destroy());
  await expect(source).not.toHaveClass(/native-ui-prehidden/);
  await expect(source).toHaveCSS('visibility', 'visible');
});

for (const tag of ['ion-header', 'ion-footer']) {
  for (const vertical of [false, true]) {
    test(`fixed fade ${tag} projects hydrated controls with verticalBars=${vertical}`, async ({ page }) => {
      await mockNative(page);
      await page.goto('/main/index/native-ui');
      await expect(page.locator('app-native-ui ion-back-button')).toHaveAttribute('data-native-ui-projected', '');
      await page.locator('app-native-ui').evaluate(
        (element, { tag, vertical }) => {
          element.dispatchEvent(new CustomEvent('ionViewWillLeave', { bubbles: true }));
          element.dispatchEvent(new CustomEvent('ionViewDidLeave', { bubbles: true }));
          document.querySelector('ion-app')!.classList.toggle('ios-theme-vertical-bars', vertical);
          const surface = `<${tag} collapse="fade"><ion-toolbar><ion-buttons slot="start"><ion-back-button default-href="/main/index"></ion-back-button></ion-buttons><ion-title>Fixed surface</ion-title><ion-buttons slot="end"><ion-button fill="default" data-fixed-action aria-label="Fixed action"><ion-icon slot="icon-only" name="checkmark"></ion-icon></ion-button></ion-buttons></ion-toolbar></${tag}>`;
          const content =
            '<ion-content><ion-header collapse="condense"><ion-toolbar><ion-title size="large">Scrolling title</ion-title><ion-back-button default-href="/main/index" data-condense-copy></ion-back-button></ion-toolbar></ion-header><div style="height:2000px">Scrollable content</div></ion-content>';
          element.innerHTML = tag === 'ion-header' ? surface + content : content + surface;
          element.dispatchEvent(new CustomEvent('ionViewWillEnter', { bubbles: true }));
          element.dispatchEvent(new CustomEvent('ionViewDidEnter', { bubbles: true }));
        },
        { tag, vertical },
      );
      // The condense layout initially hides its fixed counterpart. Scroll to the
      // compact-header state before asserting native visibility.
      await page.locator('app-native-ui > ion-content').evaluate((content: HTMLIonContentElement) => content.scrollToPoint(0, 400, 0));
      const back = page.locator(`app-native-ui > ${tag} ion-back-button`);
      const action = page.locator('app-native-ui ion-button[data-fixed-action]');
      await expect(back).toHaveAttribute('data-native-ui-projected', '');
      await expect(action).toHaveAttribute('data-native-ui-projected', '');
      if (vertical) {
        await expect(back).toHaveClass(/native-ui-prehidden/);
        await expect(action).toHaveClass(/native-ui-prehidden/);
      }
      const duplicate = page.locator('[data-condense-copy]');
      await expect(duplicate).toHaveClass(/hydrated/);
      await expect(duplicate).not.toHaveAttribute('data-native-ui-projected', '');
      await expect(duplicate).not.toHaveClass(/native-ui-prehidden/);
      await expect(back).toHaveAttribute('data-native-ui-projected', '');
    });
  }
}

test('verticalBars preserve toolbar layout around horizontal native controls and titles', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  await expect(page.locator('app-native-ui ion-segment')).toHaveAttribute('data-native-ui-projected', '');
  const toolbars = page.locator('app-native-ui ion-header > ion-toolbar');
  for (const toolbar of await toolbars.all()) {
    await expect(toolbar).toBeVisible();
  }
  await expect(page.locator('app-native-ui ion-title').last()).toHaveText('Actions: 0 / 0');
});

test('rejected verticalBars control returns to an operable Web source', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  await page.locator('app-native-ui ion-button[type=submit] ion-icon').evaluate((icon) => {
    icon.setAttribute('slot', 'icon-only');
    icon.parentElement!.querySelector('[data-label]')?.remove();
  });
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  const save = page.locator('app-native-ui ion-button[type=submit]');
  await expect(save).toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => {
    Capacitor.registerPlugin<NativeUIMock>('NativeUI').rejectControlLabel = 'Save';
    window.dispatchEvent(new Event('nativeUIRefresh'));
  });
  await expect(save).not.toHaveAttribute('data-native-ui-projected', '');
  await expect(save).not.toHaveClass(/native-ui-prehidden/);
  await expect(save).toHaveCSS('visibility', 'visible');
  await save.click();
  await expect(page.locator('[data-save-count]')).toHaveText('1');
});

test('verticalBars rail remains native while its Ionic menu is open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  await page.locator('app-native-ui ion-button[type=submit] ion-icon').evaluate((icon) => {
    icon.setAttribute('slot', 'icon-only');
    icon.parentElement!.querySelector('[data-label]')?.remove();
  });
  await page.locator('app-native-ui ion-menu-button').evaluate((element: HTMLIonMenuButtonElement) => (element.autoHide = false));
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  const menu = page.locator('ion-menu');
  const menuSource = page.locator('app-native-ui ion-menu-button').locator('..');
  const backSource = page.locator('app-native-ui ion-back-button');
  const saveSource = page.locator('app-native-ui ion-button[type=submit]');
  const cancelSource = page.locator('app-native-ui ion-button').filter({ hasText: 'Cancel' });
  const actionGroup = page.locator('app-native-ui ion-buttons[data-glass-group]');
  const tabs = page.locator('ion-tab-bar');

  await actionGroup.evaluate((element) => {
    const cancel = document.createElement('ion-button') as HTMLIonButtonElement;
    cancel.classList.add('ios');
    cancel.fill = 'clear';
    cancel.textContent = 'Cancel mixed action';
    element.prepend(cancel);
  });
  const mixedCancel = actionGroup.locator('ion-button').filter({ hasText: 'Cancel mixed action' });
  const mixedIcons = actionGroup.locator('ion-button').filter({ has: page.locator('ion-icon') });
  await expect(actionGroup).not.toHaveAttribute('data-native-ui-projected');
  await expect(mixedIcons.nth(0)).toHaveAttribute('data-native-ui-projected', '');
  await expect(mixedIcons.nth(1)).toHaveAttribute('data-native-ui-projected', '');
  await expect(mixedCancel).not.toHaveAttribute('data-native-ui-projected');
  await expect(mixedCancel).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const controls = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)?.controls ?? [];
        const demoActions = (control: NativeUIControl) =>
          control.items.filter((item: NativeUIItem) => ['GitHub', 'Refresh'].includes(item.accessibilityLabel)).length;
        return {
          groups: controls.filter((control: NativeUIControl) => control.kind === 'button-group' && demoActions(control) === 2).length,
          individuals: controls.filter((control: NativeUIControl) => control.kind === 'button' && demoActions(control) > 0).length,
        };
      }),
    )
    .toEqual({ groups: 1, individuals: 0 });
  const nativeDisabled = () =>
    page.evaluate(() => {
      const items = Capacitor.registerPlugin<NativeUIMock>('NativeUI')
        .updates.at(-1)!
        .controls.flatMap((control: NativeUIControl) => control.items);
      return {
        save: items.find((item: NativeUIItem) => item.accessibilityLabel === 'Save')?.disabled,
        actions: items
          .filter((item: NativeUIItem) => ['GitHub', 'Refresh'].includes(item.accessibilityLabel))
          .map((item: NativeUIItem) => item.disabled),
      };
    });
  await actionGroup.evaluate((element: HTMLElement) => (element.style.pointerEvents = 'none'));
  await activate(page, 'menu');
  await expect(menu).toHaveClass(/show-menu/);
  await expect.poll(nativeDisabled).toEqual({ save: false, actions: [true, true] });
  await actionGroup.evaluate((element: HTMLElement) => (element.style.pointerEvents = ''));
  await expect.poll(nativeDisabled).toEqual({ save: false, actions: [false, false] });
  await mixedCancel.evaluate((element) => element.remove());
  await expect(actionGroup).toHaveAttribute('data-native-ui-projected', '');
  await saveSource.evaluate((element: HTMLElement) => (element.style.pointerEvents = 'none'));
  await actionGroup.evaluate((element: HTMLElement) => (element.style.pointerEvents = 'none'));
  await expect.poll(nativeDisabled).toEqual({ save: true, actions: [true, true] });
  await expect(menu).toHaveClass(/show-menu/);
  await activate(page, 'Save');
  await expect(page.locator('[data-save-count]')).toHaveText('0');
  await saveSource.evaluate((element: HTMLElement) => (element.style.pointerEvents = ''));
  await actionGroup.evaluate((element: HTMLElement) => (element.style.pointerEvents = ''));
  await expect.poll(nativeDisabled).toEqual({ save: false, actions: [false, false] });
  await expect.poll(() => cancelSource.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
  for (const source of [menuSource, backSource, saveSource, tabs]) await expect(source).toHaveAttribute('data-native-ui-projected', '');
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
  const morphedCancel = page.locator('app-native-ui ion-button[data-morphed-cancel]');
  await expect(morphedCancel).not.toHaveAttribute('data-native-ui-projected', '');
  await expect(morphedCancel).not.toHaveClass(/native-ui-prehidden/);
  await expect(morphedCancel).toBeVisible();
});

// A renderer that cannot honor the requested edge hands the rail back to the Web.
test('verticalBars controls stay operable on Web when the reported rail edge differs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNative(page, false, 'leading');
  await page.goto('/main/index/native-ui');
  await page.locator('app-native-ui ion-button[type=submit] ion-icon').evaluate((icon) => {
    icon.setAttribute('slot', 'icon-only');
    icon.parentElement!.querySelector('[data-label]')?.remove();
  });
  await page.locator('app-native-ui ion-menu-button').evaluate((element: HTMLIonMenuButtonElement) => (element.autoHide = false));
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));

  const projection = page.locator('ion-app > ion-back-button.ios-theme-vertical-bars-back-button-projection');
  const menuProjection = page.locator('ion-app > ion-menu-button.ios-theme-vertical-bars-toolbar-projection');
  const saveProjection = page.locator('ion-app > ion-button.ios-theme-vertical-bars-toolbar-projection[aria-label=Save]');
  await expect(projection).toBeVisible();
  await expect(menuProjection).toBeVisible();
  await expect(saveProjection).toBeVisible();
  await expect(page.locator('ion-tab-bar')).toBeVisible();
  await page.addStyleTag({ content: '.author-hidden { visibility: hidden !important }' });
  const saveSource = page.locator('app-native-ui ion-button[type=submit]');
  await saveSource.evaluate((element) => element.classList.add('author-hidden'));
  await expect(saveProjection).toHaveCount(0);
  await saveSource.evaluate((element) => element.classList.remove('author-hidden'));
  await expect(saveProjection).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).nativeUI!.getStatus().projected))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)
          ?.controls.every((control: NativeUIControl) => control.placement !== 'vertical-bars'),
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
    (document.querySelector('ion-app') as TestAppElement).verticalBarsBackCloneMoved = false;
    new MutationObserver(() => {
      if (outlet.querySelector(':scope > ion-back-button.ion-cloned-element'))
        (document.querySelector('ion-app') as TestAppElement).verticalBarsBackCloneMoved = true;
    }).observe(outlet, { childList: true });
  });
  await projection.click();
  await expect(page).toHaveURL(/\/main\/index$/);
  expect(await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).verticalBarsBackCloneMoved)).toBe(false);
});

test('reported rail inset updates the layout without an edge change and clears when unavailable', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index?verticalBarsOnly');
  const app = page.locator('ion-app');
  await page.getByText('iPhone Duo Mode', { exact: true }).click();
  const width = () => app.evaluate((element) => element.style.getPropertyValue('--ios-theme-vertical-bars-native-inset'));
  await expect.poll(width).toBe('84px');

  const report = async (verticalBarEdge: 'leading' | 'trailing' | null, inset: number) => {
    await page.evaluate(
      ({ verticalBarEdge, inset }) => {
        Capacitor.registerPlugin<NativeUIMock>('Foldable').notifyListeners('barPlacementChange', { verticalBarEdge, inset });
        Capacitor.registerPlugin<NativeUIMock>('NativeUI').notifyListeners('webViewMetricsChange', { radius: 0, verticalBarEdge });
      },
      { verticalBarEdge, inset },
    );
  };
  await report('trailing', 64);
  await expect.poll(width).toBe('64px');
  await expect
    .poll(() =>
      app.evaluate((element) => getComputedStyle(element).getPropertyValue('--ios-theme-vertical-bars-safe-area-right-resolved').trim()),
    )
    .toBe('64px');
  await report('leading', 96);
  await expect(app).toHaveClass(/ios-theme-vertical-bars-left/);
  await expect.poll(width).toBe('96px');
  await report(null, 0);
  await expect.poll(width).toBe('');
  await expect(app).toHaveClass(/ios-theme-vertical-bars/);
  await expect(page.locator('ion-tab-bar')).toBeVisible();
});

for (const initialEdge of [null, 'unreported'] as const) {
  for (const verticalBarsOnly of [true, false]) {
    test(`${initialEdge ?? 'null'} native edge preserves Web rail (rail-only: ${verticalBarsOnly}) and recovers`, async ({ page }) => {
      await page.setViewportSize({ width: 700, height: 900 });
      await mockNative(page, false, initialEdge);
      await page.goto(`/main/index/native-ui${verticalBarsOnly ? '?verticalBarsOnly' : ''}`);
      await page.locator('app-native-ui ion-button[type=submit] ion-icon').evaluate((icon) => {
        icon.setAttribute('slot', 'icon-only');
        icon.parentElement!.querySelector('[data-label]')?.remove();
      });
      const app = page.locator('ion-app');
      const tabs = page.locator('ion-tab-bar');
      const save = page.locator('app-native-ui ion-button[type=submit]');
      const clone = page.locator('ion-app > ion-button.ios-theme-vertical-bars-toolbar-projection[aria-label=Save]');
      const snapshot = () => page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1));
      const reportEdge = async (verticalBarEdge: 'leading' | 'trailing' | null) => {
        await page.evaluate((edge) => {
          Capacitor.registerPlugin<NativeUIMock>('Foldable').notifyListeners('barPlacementChange', { verticalBarEdge: edge });
          Capacitor.registerPlugin<NativeUIMock>('NativeUI').notifyListeners('webViewMetricsChange', {
            radius: 0,
            verticalBarEdge: edge,
          });
        }, verticalBarEdge);
      };
      await app.evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
      const expectFallback = async () => {
        await expect.poll(async () => (await snapshot())?.controls.every((control) => control.placement !== 'vertical-bars')).toBe(true);
        await expect(app).toHaveClass(/ios-theme-vertical-bars/);
        await expect(app).not.toHaveAttribute('data-native-ui-vertical-bars-suspended', '');
        await expect(clone).toBeVisible();
        await expect(tabs).not.toHaveAttribute('data-native-ui-projected', '');
        await expect(tabs).toBeVisible();
      };
      await expectFallback();
      await clone.click();
      await expect(page.locator('[data-save-count]')).toHaveText('1');

      await reportEdge('trailing');
      await expect(app).toHaveClass(/ios-theme-vertical-bars/);
      await expect(app).not.toHaveAttribute('data-native-ui-vertical-bars-suspended', '');
      await expect.poll(async () => (await snapshot())?.controls.some((control) => control.placement === 'vertical-bars')).toBe(true);
      await expect(tabs).toHaveAttribute('data-native-ui-projected', '');
      await expect(clone).toHaveCount(0);

      await reportEdge(null);
      await expectFallback();
      await clone.click();
      await expect(page.locator('[data-save-count]')).toHaveText('2');

      // The last explicit null survives updates and layout changes.
      await page.setViewportSize({ width: 740, height: 900 });
      await expectFallback();
    });
  }
}

test('native click preserves external form submit, disabled, and duplicate protection', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const button = page.locator('app-native-ui ion-button[type=submit]');
  await expect(button).toHaveAttribute('data-native-ui-projected', '');
  await expect(button.locator('button')).toHaveCSS('visibility', 'hidden');
  await activate(page, 'Save', true);
  await expect(page.locator('[data-save-count]')).toHaveText('1');
  await page.getByRole('button', { name: 'disabled: false', exact: true }).click();
  await expect(button).toHaveJSProperty('disabled', true);
  await activate(page, 'Save');
  await expect(page.locator('[data-save-count]')).toHaveText('1');
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).nativeUI!.getStatus().projected))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)
            ?.controls.flatMap((control) => control.items)
            .find((item) => item.accessibilityLabel === 'Save')?.disabled,
      ),
    )
    .toBe(true);
  // Idle means the disabled state has reached native and source animations have settled.
  await page.locator('ion-app').evaluate(async (app) => {
    await Promise.all(
      app
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  await page.waitForTimeout(200);
  const count = await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.length);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.length)).toBe(count);
});

test('ancestor display, element opt-out aliases and non-glass fills restore Web', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const button = page.locator('app-native-ui ion-button[type=submit]');
  const toolbar = button.locator('xpath=ancestor::ion-toolbar[1]');
  await expect(button).toHaveAttribute('data-native-ui-projected', '');
  await page.getByRole('button', { name: 'Parent hidden: false', exact: true }).click();
  await expect(button).not.toHaveAttribute('data-native-ui-projected');
  await page.getByRole('button', { name: 'Parent hidden: true', exact: true }).click();
  await expect(button).toHaveAttribute('data-native-ui-projected', '');
  for (const name of ['ios-theme-disabled', 'ios26-disabled']) {
    await toolbar.evaluate((element, name) => element.classList.add(name), name);
    await expect(button).not.toHaveAttribute('data-native-ui-projected');
    await toolbar.evaluate((element, name) => element.classList.remove(name), name);
    await expect(button).toHaveAttribute('data-native-ui-projected', '');
  }
  for (const name of ['ios-theme-disabled', 'ios26-disabled']) {
    await button.evaluate((element, name) => element.classList.add(name), name);
    await expect(button).not.toHaveAttribute('data-native-ui-projected');
    await button.evaluate((element, name) => element.classList.remove(name), name);
    await expect(button).toHaveAttribute('data-native-ui-projected', '');
  }
  await page
    .locator('app-native-ui ion-buttons[slot=end] ion-button')
    .filter({ hasText: 'Cancel' })
    .evaluate((element) => element.remove());
  await expect(button).toHaveAttribute('data-native-ui-projected', '');
  // Clear actions inside ion-buttons now remain eligible for individual projection.
  await page.getByRole('button', { name: 'fill: clear', exact: true }).click();
  await expect(button).toHaveAttribute('data-native-ui-projected', '');
  for (const fill of ['solid', 'outline']) {
    await page.getByRole('button', { name: `fill: ${fill}`, exact: true }).click();
    await expect(button).not.toHaveAttribute('data-native-ui-projected');
    await expect(button.locator('button')).toHaveCSS('visibility', 'visible');
    await page.getByRole('button', { name: 'fill: default', exact: true }).click();
    await expect(button).toHaveAttribute('data-native-ui-projected', '');
  }
});

test('shell opt-out restores the element and descendants while preserving Web glass', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const button = page.locator('app-native-ui ion-button[type=submit]');
  const tabs = page.locator('ion-tab-bar');
  const glass = () =>
    button.locator('button').evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, filter: style.backdropFilter, radius: style.borderRadius };
    });
  await expect(button).toHaveAttribute('data-native-ui-projected', '');
  const original = await glass();
  expect(original.filter).toContain('blur');
  for (const [index, target] of [
    button,
    button.locator('..'),
    page.locator('app-native-ui > ion-header'),
    page.locator('app-native-ui'),
  ].entries()) {
    await target.evaluate(
      (element, useAttribute) => {
        if (useAttribute) element.setAttribute('data-native-ui', 'disabled');
        else element.classList.add('native-ui-disabled');
      },
      index % 2 === 0,
    );
    await expect(button).not.toHaveAttribute('data-native-ui-projected');
    await expect(target.locator('[data-native-ui-projected]')).toHaveCount(0);
    await expect(button.locator('button')).toHaveCSS('visibility', 'visible');
    expect(await glass()).toEqual(original);
    await expect(tabs).toHaveAttribute('data-native-ui-projected', '');
    await target.evaluate((element) => {
      element.removeAttribute('data-native-ui');
      element.classList.remove('native-ui-disabled');
    });
    await expect(button).toHaveAttribute('data-native-ui-projected', '');
  }
  await page.locator('html').evaluate((element) => element.setAttribute('data-native-ui', 'disabled'));
  await expect(page.locator('[data-native-ui-projected]')).toHaveCount(0);
  await button.click();
  await expect(page.locator('[data-save-count]')).toHaveText('1');
  await page.locator('html').evaluate((element) => element.removeAttribute('data-native-ui'));
  await expect(tabs).toHaveAttribute('data-native-ui-projected', '');
});

for (const renderer of ['native', 'web'] as const) {
  test(`initial shell opt-out can rejoin the ${renderer} rail without page re-entry`, async ({ page }) => {
    await mockNative(page, renderer === 'web');
    await page.goto('/main/index/native-ui?verticalBarsOnly');
    await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    for (const attribute of ['class', 'data-native-ui']) {
      const value = attribute === 'class' ? 'native-ui-disabled' : 'disabled';
      await page.locator('app-native-ui ion-header').evaluate(
        (header, { attribute, value }) => {
          const toolbar = document.createElement('ion-toolbar');
          toolbar.id = 'initial-native-ui-opt-out';
          toolbar.setAttribute(attribute, value);
          toolbar.innerHTML = `<ion-buttons><ion-button aria-label="First"><ion-icon slot="icon-only" name="add"></ion-icon></ion-button><ion-button aria-label="Second"><ion-icon slot="icon-only" name="heart"></ion-icon></ion-button></ion-buttons><ion-buttons class="ios-theme-disabled"><ion-button id="initial-individual" aria-label="Individual"><ion-icon slot="icon-only" name="add"></ion-icon></ion-button></ion-buttons>`;
          header.append(toolbar);
        },
        { attribute, value },
      );
      const toolbar = page.locator('#initial-native-ui-opt-out');
      const individual = toolbar.locator('#initial-individual');
      const grouped = toolbar.locator(renderer === 'native' ? 'ion-buttons' : 'ion-buttons ion-button').first();
      await expect(individual).toHaveClass(/hydrated/);
      await expect(individual).toBeVisible();
      await expect(toolbar.locator('[data-native-ui-projected]')).toHaveCount(0);
      for (let i = 0; i < 2; i++) {
        await toolbar.evaluate((element, attribute) => element.removeAttribute(attribute), attribute);
        await expect(individual).toHaveAttribute('data-native-ui-projected', '');
        await expect(grouped).toHaveAttribute('data-native-ui-projected', '');
        await toolbar.evaluate((element, { attribute, value }) => element.setAttribute(attribute, value), { attribute, value });
        await expect(toolbar.locator('[data-native-ui-projected]')).toHaveCount(0);
        await expect(individual).toBeVisible();
      }
      await toolbar.evaluate((element) => element.remove());
    }
  });
}

test('shell opt-out in shared surface children keeps the whole surface on Web', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const button = page.locator('app-native-ui ion-button[type=submit]');
  for (const [surfaceSelector, childSelector] of [
    ['[data-glass-group]', 'ion-button'],
    ['[data-glass-group]', 'ion-icon'],
    ['app-native-ui ion-segment', 'ion-segment-button'],
    ['app-native-ui ion-segment', 'ion-label'],
    ['ion-tab-bar', 'ion-tab-button'],
    ['ion-tab-bar', 'ion-icon'],
  ]) {
    const surface = page.locator(surfaceSelector);
    const child = surface.locator(childSelector).first();
    await expect(surface).toHaveAttribute('data-native-ui-projected', '');
    await child.evaluate((element) => element.setAttribute('data-native-ui', 'disabled'));
    await expect(surface).not.toHaveAttribute('data-native-ui-projected');
    await expect(surface.locator('[data-native-ui-projected]')).toHaveCount(0);
    await expect(child).toHaveCSS('visibility', 'visible');
    await expect(button).toHaveAttribute('data-native-ui-projected', '');
    await child.evaluate((element) => element.removeAttribute('data-native-ui'));
    await expect(surface).toHaveAttribute('data-native-ui-projected', '');
  }
});

test('shell opt-out cannot be bypassed by searchable tab integration', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  const tabs = page.locator('ion-tab-bar');
  const search = () =>
    page.evaluate(
      () =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.find((c: NativeUIControl) => c.search)?.search,
    );
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
    await expect(footer).toHaveAttribute('data-native-ui-projected', '');
    await expect.poll(search).toBeTruthy();
    await target.evaluate((element) => element.classList.add('native-ui-disabled'));
    await expect(footer).not.toHaveAttribute('data-native-ui-projected');
    await expect.poll(search).toBeUndefined();
    await expect(tabs).toHaveAttribute('data-native-ui-projected', '');
    await target.evaluate((element) => element.classList.remove('native-ui-disabled'));
    await expect(footer).toHaveAttribute('data-native-ui-projected', '');
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
  const search = () =>
    page.evaluate(
      () =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.find((c: NativeUIControl) => c.search)?.search,
    );
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => {
    const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
    const snapshot = state.updates.at(-1)!;
    state.notifyListeners('activate', {
      id: snapshot.controls.find((c: NativeUIControl) => c.search)!.search!.trigger.id,
      revision: snapshot.revision,
      sequence: ++state.sequence,
    });
  });
  await expect.poll(async () => (await search())?.active).toBe(true);
  await page.evaluate(() => {
    const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
    const snapshot = state.updates.at(-1)!;
    const search = snapshot.controls.find((c: NativeUIControl) => c.search)!.search!;
    const event = {
      id: search.id,
      valueVersion: search.valueVersion,
      revision: snapshot.revision,
      phase: 'input',
      value: '日本',
      composing: false,
    };
    state.notifyListeners('search', { ...event, sequence: ++state.sequence });
    state.lateSearch = () => state.notifyListeners('search', { ...event, value: 'stale', sequence: ++state.sequence });
  });
  await expect(bar).toHaveJSProperty('value', '日本');
  await bar.evaluate((element) => element.classList.add('native-ui-disabled'));
  await expect(footer).not.toHaveAttribute('data-native-ui-projected');
  await expect.poll(search).toBeUndefined();
  await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').lateSearch!());
  await expect(bar).toHaveJSProperty('value', '日本');
  await bar.evaluate((element) => element.classList.remove('native-ui-disabled'));
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  await expect.poll(async () => (await search())?.value).toBe('日本');
});

test('segment preserves numeric values and emits only user changes', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const segment = page.locator('app-native-ui ion-segment');
  await expect(segment).toHaveAttribute('data-native-ui-projected', '');
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
  await page.goto('/main/index/native-ui');
  const button = page.locator('app-native-ui ion-button[type=submit]');
  const tabs = page.locator('ion-tab-bar');
  await expect(button).toHaveAttribute('data-native-ui-projected', '');
  await expect(tabs).toHaveAttribute('data-native-ui-projected', '');
  await page.getByRole('button', { name: 'Open modal', exact: true }).click();
  await expect(page.locator('[data-native-ui-projected]')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!))
    .toMatchObject({ controls: [], transitionDuration: 0 });
  await page.getByRole('button', { name: 'Close modal', exact: true }).click();
  await expect(button).toHaveAttribute('data-native-ui-projected', '');
  await tabs.evaluate((element) => (element.style.display = 'none'));
  await expect(tabs).not.toHaveAttribute('data-native-ui-projected');
  await tabs.evaluate((element) => element.style.removeProperty('display'));
  await expect(tabs).toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).nativeUI!.destroy());
  await expect(page.locator('[data-native-ui-projected]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('[data-save-count]')).toHaveText('1');
});

test('delayed response cannot reclaim a hidden source', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const button = page.locator('app-native-ui ion-button[type=submit]');
  await expect(button).toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => (Capacitor.registerPlugin<NativeUIMock>('NativeUI').delay = 150));
  await button.evaluate((element) => (element.querySelector('[data-label]')!.textContent = '変更'));
  await page.getByRole('button', { name: 'Parent hidden: false', exact: true }).click();
  await expect(button).not.toHaveAttribute('data-native-ui-projected');
  await page.waitForTimeout(350);
  await expect(button).not.toHaveAttribute('data-native-ui-projected');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.some((control: NativeUIControl) => control.items.some((item: NativeUIItem) => item.label === '変更')),
      ),
    )
    .toBe(false);
});

for (const event of ['foreground', 'window-resize', 'visual-viewport-resize'] as const) {
  test(`${event} restores native tabs even when the control snapshot is unchanged`, async ({ page }) => {
    await mockNative(page);
    await page.goto('/main/index');
    await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-projected', '');
    // Wait for the selected-tab icon animation to finish before comparing snapshots.
    await page.waitForTimeout(750);
    const previous = await page.evaluate((event) => {
      const snapshot = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!;
      if (event === 'foreground') document.dispatchEvent(new Event('visibilitychange'));
      else if (event === 'window-resize') window.dispatchEvent(new Event('resize'));
      else window.visualViewport!.dispatchEvent(new Event('resize'));
      return snapshot;
    }, event);
    await expect
      .poll(() => page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!.revision))
      .toBeGreaterThan(previous.revision);
    const restored = await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!);
    expect(restored.controls).toEqual(previous.controls);
    await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-projected', '');
  });
}

test('native refresh during a pending acknowledgement resends unchanged controls', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  // This test needs a static snapshot; tab-selection icon animation is tested separately.
  await page.locator('ion-tab-bar').evaluate((element) => element.remove());
  await expect(page.locator('app-native-ui ion-button[type=submit]')).toHaveAttribute('data-native-ui-projected', '');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.some((c: NativeUIControl) => c.kind === 'tab-bar'),
      ),
    )
    .toBe(false);
  const revision = await page.evaluate(() => {
    const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
    state.delay = 500;
    window.dispatchEvent(new Event('nativeUIRefresh'));
    return state.updates.at(-1)!.revision;
  });
  await expect
    .poll(() => page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!.revision))
    .toBeGreaterThan(revision);
  const pending = await page.evaluate(() => {
    const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
    const snapshot = state.updates.at(-1)!;
    window.dispatchEvent(new Event('nativeUIRefresh'));
    return snapshot;
  });
  await expect
    .poll(() => page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!.revision))
    .toBeGreaterThan(pending.revision);
  const refreshed = await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!);
  expect(refreshed.controls).toEqual(pending.controls);
  await expect(page.locator('app-native-ui ion-button[type=submit]')).toHaveAttribute('data-native-ui-projected', '');
});

test('native failure leaves Web form usable', async ({ page }) => {
  await mockNative(page, true);
  await page.goto('/main/index/native-ui');
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).nativeUI?.getStatus().state))
    .toBe('web');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('[data-save-count]')).toHaveText('1');
});

test('native tab clicks use Ionic navigation and selected state', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const tabs = page.locator('ion-tab-bar');
  await expect(tabs).toHaveAttribute('data-native-ui-projected', '');
  await activate(page, 'Settings');
  await expect(page).toHaveURL(/\/main\/settings/);
  await expect(page.locator('ion-tab-button[tab="settings"]')).toHaveJSProperty('selected', true);
  await expect(tabs).not.toHaveAttribute('data-native-ui-projected'); // This demo hides tabs on Settings.
});

test('100 hide/show cycles leave stable ownership and destroy stops updates', async ({ page }) => {
  test.setTimeout(90000);
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const button = page.locator('app-native-ui ion-button[type=submit]');
  await expect(button).toHaveAttribute('data-native-ui-projected', '');
  const initial = await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).nativeUI!.getStatus().projected);
  for (let index = 0; index < 100; index++) {
    await button.evaluate((element) => (element.parentElement!.hidden = true));
    await expect(button).not.toHaveAttribute('data-native-ui-projected');
    await button.evaluate((element) => (element.parentElement!.hidden = false));
    await expect(button).toHaveAttribute('data-native-ui-projected', '');
  }
  expect(await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).nativeUI!.getStatus().projected)).toBe(initial);
  await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).nativeUI!.destroy());
  const updates = await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.length);
  await button.evaluate((element) => element.setAttribute('fill', 'clear'));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.length)).toBe(updates);
  await expect(page.locator('[data-native-ui-projected]')).toHaveCount(0);
});

test('ion-icon SVGs project and update when their name changes', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const button = page.locator('app-native-ui ion-button[type=submit]');
  await expect(button).toHaveAttribute('data-native-ui-projected', '');
  const nativeIcon = () =>
    button.evaluate(() => {
      const snapshot = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!;
      return snapshot.controls
        .flatMap((control: NativeUIControl) => control.items)
        .find((item: NativeUIItem) => item.accessibilityLabel === 'Save')?.icon;
    });
  await expect.poll(nativeIcon).toMatch(/^iVBOR/);
  const original = await nativeIcon();
  await button.locator('ion-icon').evaluate((element: HTMLIonIconElement) => {
    element.name = 'star';
  });
  await expect.poll(nativeIcon).not.toBe(original);
  await expect.poll(nativeIcon).toMatch(/^iVBOR/);
  await expect(button).toHaveAttribute('data-native-ui-projected', '');
});

for (const nativeEdge of [null, 'trailing'] as const) {
  test(`clear ion-buttons share one glass surface and keep independent actions (${nativeEdge ?? 'horizontal'})`, async ({ page }) => {
    await mockNative(page, false, nativeEdge);
    await page.goto('/main/index/native-ui');
    const group = page.locator('[data-glass-group]');
    const github = group.locator('ion-button').nth(0);
    const refresh = group.locator('ion-button').nth(1);
    const projectedGroup = () =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find(
              (control: NativeUIControl) =>
                control.kind === 'button-group' && control.items.some((item: NativeUIItem) => item.accessibilityLabel === 'GitHub'),
            )!,
      );
    await expect(group).toHaveAttribute('data-native-ui-projected', '');
    await expect(group.locator('[data-native-ui-projected]')).toHaveCount(0);
    await expect(github.locator('button')).toHaveCSS('visibility', 'hidden');
    const native = await projectedGroup();
    expect(native.items).toHaveLength(2);
    expect(native.items.map((item: NativeUIItem) => item.accessibilityLabel)).toEqual(['GitHub', 'Refresh']);
    const githubName = () =>
      page.evaluate(
        (id) =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((control: NativeUIControl) => control.id === id)?.items[0]?.accessibilityLabel,
        native.id,
      );
    await github.locator('ion-icon').evaluate((icon) => icon.setAttribute('aria-hidden', 'true'));
    await expect.poll(githubName).not.toBe('GitHub');
    await github.locator('ion-icon').evaluate((icon) => icon.removeAttribute('aria-hidden'));
    await expect.poll(githubName).toBe('GitHub');
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
    const identity = (control: NativeUIControl) => [control.transitionId, ...control.items.map((item) => item.transitionId)];
    expect(identity(await projectedGroup())).toEqual(identity(native));
    await activate(page, 'Refresh');
    await expect(page.locator('ion-title').filter({ hasText: 'Actions:' })).toHaveText('Actions: 1 / 1');
    await github.evaluate((element: HTMLIonButtonElement) => {
      element.disabled = true;
    });
    await expect.poll(async () => (await projectedGroup())?.items.map((item) => item.disabled)).toEqual([true, true]);
    expect(identity(await projectedGroup())).toEqual(identity(native));
    await expect(group).toHaveAttribute('data-native-ui-projected', '');
    await activate(page, 'GitHub');
    await activate(page, 'Refresh');
    await expect(page.locator('ion-title').filter({ hasText: 'Actions:' })).toHaveText('Actions: 1 / 1');
    await group.evaluate((element) => {
      element.querySelectorAll<HTMLIonButtonElement>('ion-button').forEach((button) => {
        button.disabled = false;
      });
    });
    await expect.poll(async () => (await projectedGroup())?.items.map((item) => item.disabled)).toEqual([false, false]);
    expect(identity(await projectedGroup())).toEqual(identity(native));
    await activate(page, 'Refresh');
    await expect(page.locator('ion-title').filter({ hasText: 'Actions:' })).toHaveText('Actions: 1 / 2');

    for (const target of [group, github]) {
      await target.evaluate((element) => element.classList.add('ios-theme-disabled'));
      await expect(group).not.toHaveAttribute('data-native-ui-projected');
      await expect(github.locator('button')).toHaveCSS('visibility', 'visible');
      await target.evaluate((element) => element.classList.remove('ios-theme-disabled'));
      await expect(group).toHaveAttribute('data-native-ui-projected', '');
    }
    await group.evaluate((element) => {
      element.style.display = 'none';
    });
    await expect(group).not.toHaveAttribute('data-native-ui-projected');
    await expect.poll(projectedGroup).toBeUndefined();
    await group.evaluate((element) => element.style.removeProperty('display'));
    await expect(group).toHaveAttribute('data-native-ui-projected', '');

    await refresh.evaluate((element: HTMLIonButtonElement) => {
      element.fill = 'solid';
    });
    await expect(group).not.toHaveAttribute('data-native-ui-projected');
    await expect(refresh.locator('button')).toHaveCSS('visibility', 'visible');
    await refresh.evaluate((element: HTMLIonButtonElement) => {
      element.fill = 'clear';
    });
    await expect(group).toHaveAttribute('data-native-ui-projected', '');
    await refresh.evaluate((element) => element.remove());
    await expect(group).not.toHaveAttribute('data-native-ui-projected');
    // A one-item group becomes an independent native button, not a Web handoff.
    await expect(github).toHaveAttribute('data-native-ui-projected', '');
  });
}

test('theme-disabled ion-buttons project eligible buttons independently', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  await page.locator('[data-glass-group]').evaluate((group) => {
    group.classList.add('ios-theme-disabled');
    group.querySelectorAll<HTMLIonButtonElement>('ion-button').forEach((button) => (button.fill = 'default'));
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const controls = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)?.controls ?? [];
        const isDemoAction = (control: NativeUIControl) =>
          control.items.some((item: NativeUIItem) => ['GitHub', 'Refresh'].includes(item.accessibilityLabel));
        return {
          buttons: controls.filter((control: NativeUIControl) => control.kind === 'button' && isDemoAction(control)).length,
          groups: controls.filter((control: NativeUIControl) => control.kind === 'button-group' && isDemoAction(control)).length,
        };
      }),
    )
    .toEqual({ buttons: 2, groups: 0 });
});

test('all demo pages keep projection consistent through consecutive navigation', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 440, height: 956 });
  await mockNative(page);
  await page.addInitScript(() => {
    document.addEventListener(
      'ionViewDidEnter',
      () => {
        document.documentElement.dataset.testEnteredPath = location.pathname;
      },
      true,
    );
  });
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
          const status = (document.querySelector('ion-app') as TestAppElement).nativeUI!.getStatus();
          const snapshot = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!;
          return (
            status.state !== 'stopped' &&
            document.documentElement.dataset.testEnteredPath === location.pathname &&
            Array.from(document.querySelectorAll('ion-router-outlet')).every(
              (outlet) => outlet.querySelectorAll(':scope > .ion-page:not(.ion-page-hidden)').length <= 1,
            ) &&
            status.projected ===
              snapshot?.controls.reduce((count: number, control: NativeUIControl) => count + (control.search?.available ? 3 : 1), 0)
          );
        }),
      )
      .toBe(true);
    await expect(
      page.locator(
        '.ion-page-hidden [data-native-ui-projected], ion-content ion-toolbar [data-native-ui-projected], [data-native-ui-projected] [data-native-ui-projected]',
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
      Capacitor.registerPlugin<NativeUIMock>('NativeUI')
        .updates.at(-1)!
        .controls.some((control: NativeUIControl) => control.kind === 'back-button'),
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
      const name = route === 'native-ui-extension' ? 'Native UI Extension' : route;
      await page
        .getByRole('button', { name, exact: true })
        .or(page.getByRole('link', { name, exact: true }))
        .click();
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
    await settled();
    await activate(page, 'Push');
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
    await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-projected', '');
    await activate(page, label);
    await expect(page).toHaveURL(`/main/${path}`);
    await settled();
  }
  await expect(page.locator('ion-tab-bar')).not.toHaveAttribute('data-native-ui-projected');
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
        await expect(page.locator('[data-native-ui-projected]')).toHaveCount(0);
        await overlay.evaluate((element: HTMLElement & { dismiss(): Promise<boolean> }) => element.dismiss());
        await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-projected', '');
        expect(await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).nativeUI!.getStatus().state)).not.toBe(
          'stopped',
        );
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
  await expect(tabs).toHaveAttribute('data-native-ui-projected', '');
  await tabs.evaluate((element) => {
    const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
    state.updates = [];
    state.delay = 100;
    state.tabRetirements = 0;
    state.retirementDetails = [];
    element.addEventListener('nativeUIChange', () => {
      if (!element.hasAttribute('data-native-ui-projected')) {
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
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          ?.controls.some((control: NativeUIControl) => control.items.some((item: NativeUIItem) => item.label === 'Index pending')),
      ),
    )
    .toBe(true);
  await tabs
    .locator('ion-label')
    .first()
    .evaluate((label) => (label.textContent = 'Index'));
  for (const route of ['native-ui', 'button', 'segment', 'native-ui']) {
    await page.getByRole('button', { name: route, exact: true }).click();
    await expect(page).toHaveURL(`/main/index/${route}`);
    if (route === 'native-ui') {
      const save = page.locator('app-native-ui ion-button[type=submit]');
      await expect(save).toHaveAttribute('data-native-ui-projected', '');
      await save.evaluate((element) => {
        element.querySelector('[data-label]')!.textContent = '更新中';
      });
      await expect
        .poll(() =>
          page.evaluate(() =>
            Capacitor.registerPlugin<NativeUIMock>('NativeUI')
              .updates.at(-1)!
              .controls.some((control: NativeUIControl) => control.items.some((item: NativeUIItem) => item.label === '更新中')),
          ),
        )
        .toBe(true);
      // Change the page again while the native response is still pending.
      await save.evaluate((element) => {
        element.parentElement!.hidden = true;
      });
      await expect(save).not.toHaveAttribute('data-native-ui-projected');
    }
    await page.goBack();
    await expect(page).toHaveURL('/main/index');
    await expect(tabs).toHaveAttribute('data-native-ui-projected', '');
  }
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({
    retirements: Capacitor.registerPlugin<NativeUIMock>('NativeUI').tabRetirements,
    details: Capacitor.registerPlugin<NativeUIMock>('NativeUI').retirementDetails,
    ids: Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.map(
      (snapshot: NativeUISnapshot) => snapshot.controls.find((control: NativeUIControl) => control.kind === 'tab-bar')?.id,
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
  await expect(tabs).toHaveAttribute('data-native-ui-projected', '');
  for (const direction of ['ltr', 'rtl']) {
    for (const slot of ['top', 'bottom']) {
      for (const position of ['start', 'center', 'end']) {
        await tabs.evaluate(
          (element, state) => {
            (element as HTMLElement).dir = state.direction;
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
                Capacitor.registerPlugin<NativeUIMock>('NativeUI')
                  .updates.at(-1)
                  ?.controls.find((control: NativeUIControl) => control.kind === 'tab-bar')?.tabBarAnchor,
            ),
          )
          .toEqual({ x, y: slot === 'bottom' ? 1 : 0 });
        const native = await page.evaluate(
          () =>
            Capacitor.registerPlugin<NativeUIMock>('NativeUI')
              .updates.at(-1)!
              .controls.find((control: NativeUIControl) => control.kind === 'tab-bar')!,
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
  await expect(tabs).toHaveAttribute('data-native-ui-projected', '');
  const items = () =>
    page.evaluate(
      () =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)
          ?.controls.find((control: NativeUIControl) => control.kind === 'tab-bar')?.items,
    );
  await expect.poll(async () => (await items())?.every((item: NativeUIItem) => item.iconTemplate)).toBe(true);
  await tabs
    .locator('ion-icon')
    .first()
    .evaluate((icon) => {
      icon.shadowRoot!.querySelector('svg')!.innerHTML =
        '<path fill="red" d="M0 0h256v512H0z"/><path fill="blue" d="M256 0h256v512H256z"/>';
    });
  await expect.poll(async () => (await items())?.[0]?.iconTemplate).toBe(false);
  expect((await items())!.slice(1).every((item: NativeUIItem) => item.iconTemplate)).toBe(true);
});

test('menu button toggles its Ionic menu and follows autoHide, disabled and split pane', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const menu = page.locator('ion-menu');
  const button = page.locator('app-native-ui ion-menu-button');
  await button.evaluate((element: HTMLIonMenuButtonElement) => (element.autoHide = true));
  const surface = button.locator('..');
  await expect(surface).toHaveAttribute('data-native-ui-projected', '');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((c: NativeUIControl) => c.kind === 'menu-button')?.items[0].icon?.length ?? 0,
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
    await expect(page.locator('[data-native-ui-projected]')).toHaveCount(0);
    await expect.poll(() => menu.evaluate((element: HTMLIonMenuElement) => element.isOpen())).toBe(true);
    await menu.evaluate((element: HTMLIonMenuElement) => element.close());
    await expect(surface).toHaveAttribute('data-native-ui-projected', '');
  }
  await button.evaluate((element: HTMLIonMenuButtonElement) => {
    element.disabled = true;
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((c: NativeUIControl) => c.kind === 'menu-button')?.items[0].disabled,
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
  await expect(surface).not.toHaveAttribute('data-native-ui-projected', '');
  await button.evaluate((element: HTMLIonMenuButtonElement) => {
    element.autoHide = false;
  });
  await expect(surface).toHaveAttribute('data-native-ui-projected', '');
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
  await expect(surface).not.toHaveAttribute('data-native-ui-projected', '');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(surface).toHaveAttribute('data-native-ui-projected', '');
});

test('menu button projects slot icons and shared glass, restoring excluded surfaces', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const button = page.locator('app-native-ui ion-menu-button');
  const surface = button.locator('..');
  await expect(surface).toHaveAttribute('data-native-ui-projected', '');
  const original = await page.evaluate(
    () =>
      Capacitor.registerPlugin<NativeUIMock>('NativeUI')
        .updates.at(-1)!
        .controls.find((c: NativeUIControl) => c.kind === 'menu-button')!.items[0].icon,
  );
  await button.evaluate((element) => {
    element.innerHTML = '<ion-icon name="heart"></ion-icon>';
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((c: NativeUIControl) => c.kind === 'menu-button')?.items[0].icon,
      ),
    )
    .not.toBe(original);
  await expect(surface).toHaveAttribute('data-native-ui-projected', '');
  await surface.evaluate((element) => {
    const extra = document.createElement('ion-button');
    extra.fill = 'clear';
    extra.textContent = 'Extra';
    extra.addEventListener('click', () => {
      (document.querySelector('ion-app') as TestAppElement).menuExtra = true;
    });
    element.append(extra);
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((c: NativeUIControl) => c.kind === 'button-group' && c.items.some((i: NativeUIItem) => i.label === 'Extra'))
            ?.items.length,
      ),
    )
    .toBe(2);
  await activate(page, 'Extra');
  await expect.poll(() => page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).menuExtra)).toBe(true);
  await activate(page, 'menu');
  await expect(page.locator('ion-menu')).toHaveClass(/show-menu/);
  await expect.poll(() => page.locator('ion-menu').evaluate((element: HTMLIonMenuElement) => element.isOpen())).toBe(true);
  await page.locator('ion-menu').evaluate((element: HTMLIonMenuElement) => element.close());
  await expect(surface).toHaveAttribute('data-native-ui-projected', '');
  await surface.evaluate((element) => element.querySelector('ion-button')!.remove());
  for (const target of [surface, button]) {
    await target.evaluate((element) => element.classList.add('ios-theme-disabled'));
    await expect(surface).not.toHaveAttribute('data-native-ui-projected', '');
    await target.evaluate((element) => element.classList.remove('ios-theme-disabled'));
    await expect(surface).toHaveAttribute('data-native-ui-projected', '');
  }
  await surface.evaluate((element: HTMLElement) => {
    element.style.display = 'none';
  });
  await expect(surface).not.toHaveAttribute('data-native-ui-projected', '');
  await surface.evaluate((element: HTMLElement) => {
    element.style.display = '';
  });
  await expect(surface).toHaveAttribute('data-native-ui-projected', '');
  await button.evaluate((element: HTMLIonMenuButtonElement) => {
    element.type = 'submit';
  });
  await expect(surface).not.toHaveAttribute('data-native-ui-projected', '');
  await button.evaluate((element: HTMLIonMenuButtonElement) => {
    element.type = 'button';
  });
  await expect(surface).toHaveAttribute('data-native-ui-projected', '');
  await button.evaluate((element) => {
    const parent = element.parentElement!;
    parent.replaceWith(element);
  });
  await expect(button).not.toHaveAttribute('data-native-ui-projected', '');
  await expect(button.locator('button')).toHaveCSS('visibility', 'visible');
});

test('replacing a projected searchbar retires old input and binds the new field', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  const bar = footer.locator('ion-searchbar');
  const config = () =>
    page.evaluate(
      () =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.find((c: NativeUIControl) => c.search)?.search,
    );
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  await bar.evaluate((element: HTMLIonSearchbarElement) => element.setFocus());
  await expect.poll(async () => (await config())?.active).toBe(true);
  const previous = await config();
  await bar.evaluate((old: HTMLIonSearchbarElement) => {
    const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
    const snapshot = state.updates.at(-1)!;
    const search = snapshot.controls.find((c: NativeUIControl) => c.search)!.search!;
    const event = { id: search.id, revision: snapshot.revision, valueVersion: search.valueVersion, phase: 'input', composing: false };
    state.notifyListeners('search', { ...event, value: 'old field', sequence: ++state.sequence });
    const replacement = document.createElement('ion-searchbar');
    for (const attribute of old.attributes) replacement.setAttribute(attribute.name, attribute.value);
    replacement.value = 'application initial value';
    (document.querySelector('ion-app') as TestAppElement).retiredSearchbar = old;
    old.replaceWith(replacement);
    // Arrive before the observer can retire the old state: DOM identity must reject it.
    state.notifyListeners('search', { ...event, value: 'stale input', sequence: ++state.sequence });
  });
  expect(await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).retiredSearchbar!.value)).toBe('old field');
  await expect
    .poll(async () => {
      const current = await config();
      return !!current && current.id !== previous!.id && !current.active && current.value === 'application initial value';
    })
    .toBe(true);
  await bar.evaluate((element: HTMLIonSearchbarElement) => element.setFocus());
  await expect.poll(async () => (await config())?.focused).toBe(true);
  await page.evaluate(() => {
    const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
    const snapshot = state.updates.at(-1)!;
    const search = snapshot.controls.find((c: NativeUIControl) => c.search)!.search!;
    state.notifyListeners('search', {
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
      return !!current && current.id !== session!.id && !current.active && current.value === 'replacement input';
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
  const config = () =>
    page.evaluate(
      () =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.find((c: NativeUIControl) => c.search)?.search,
    );
  await page.addStyleTag({ content: 'ion-tab-bar.application-hidden { display: none !important; }' });
  for (const mode of ['inline', 'class']) {
    await expect(footer).toHaveAttribute('data-native-ui-projected', '');
    await page.evaluate(() => {
      const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
      const snapshot = state.updates.at(-1)!;
      state.notifyListeners('activate', {
        id: snapshot.controls.find((c: NativeUIControl) => c.search)!.search!.trigger.id,
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
    await expect(footer).toHaveAttribute('data-native-ui-projected', '');
    await page.evaluate(() => {
      const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
      const snapshot = state.updates.at(-1)!;
      const search = snapshot.controls.find((c: NativeUIControl) => c.search)!.search!;
      state.notifyListeners('search', {
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
    await expect(footer).not.toHaveAttribute('data-native-ui-projected');
    await expect.poll(config).toBeUndefined();
    await expect(tabBar).toHaveCSS('display', 'none');
    await tabBar.evaluate((element: HTMLElement) => {
      window.dispatchEvent(new Event('keyboardWillHide'));
      element.style.removeProperty('display');
      element.classList.remove('application-hidden', 'tab-bar-hidden');
    });
    await expect(footer).toHaveAttribute('data-native-ui-projected', '');
    await expect.poll(async () => (await config())?.active).toBe(false);
  }
});

test('search group keeps its covers, forwards Ionic events and preserves text on close', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  const config = () =>
    page.evaluate(
      () =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.find((c: NativeUIControl) => c.search)?.search,
    );
  expect((await config())?.active).toBe(false);
  await footer.evaluate((element) => {
    const bar = element.querySelector('ion-searchbar')!;
    (document.querySelector('ion-app') as TestAppElement).searchEvents = [];
    for (const name of ['ionFocus', 'ionInput', 'ionBlur', 'ionChange', 'ionClear', 'ionCancel']) {
      bar.addEventListener(name, (event: Event) =>
        (document.querySelector('ion-app') as TestAppElement).searchEvents!.push([name, (event as CustomEvent).detail?.value]),
      );
    }
  });
  const action = async (close = false) =>
    page.evaluate((close) => {
      const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
      const snapshot = state.updates.at(-1)!;
      const search = snapshot.controls.find((c: NativeUIControl) => c.search)!.search!;
      state.notifyListeners('activate', {
        id: close ? search.closeId : search.trigger.id,
        revision: snapshot.revision,
        sequence: ++state.sequence,
      });
    }, close);
  await action();
  await expect.poll(async () => (await config())?.active).toBe(true);
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  expect(page.url()).toContain('/main/album');
  const nativeEvent = async (phase: string, value: string, composing = false) =>
    page.evaluate(
      ({ phase, value, composing }) => {
        const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
        const snapshot = state.updates.at(-1)!;
        state.notifyListeners('search', {
          id: snapshot.controls.find((c: NativeUIControl) => c.search)!.search!.id,
          valueVersion: snapshot.controls.find((c: NativeUIControl) => c.search)!.search!.valueVersion,
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
  await expect.poll(async () => (await config())?.active).toBe(false);
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  expect(await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).searchEvents!.map((e) => e[0]))).toEqual([
    'ionFocus',
    'ionInput',
    'ionInput',
    'ionBlur',
    'ionChange',
  ]);
  await action();
  await expect.poll(async () => (await config())?.active).toBe(true);
  expect((await config())?.value).toBe('日本');
  await footer.locator('ion-searchbar').evaluate((bar: HTMLIonSearchbarElement) => {
    bar.value = 'external';
  });
  await expect.poll(async () => (await config())?.value).toBe('external');
  await nativeEvent('focus', 'external');
  await nativeEvent('clear', 'external');
  await expect.poll(async () => (await config())?.value).toBe('');
  expect(
    await page.evaluate(
      () => (document.querySelector('ion-app') as TestAppElement).searchEvents!.filter((e) => e[0] === 'ionClear').length,
    ),
  ).toBe(1);
});

test('search retirement keeps the value, rejects late input and allows a fresh Web session', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  await page.locator('app-album-page ion-fab-button').evaluate((button: HTMLElement) => button.click());
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((c: NativeUIControl) => c.search)?.search?.active,
      ),
    )
    .toBe(true);
  await footer.locator('ion-searchbar').evaluate((bar: HTMLIonSearchbarElement) => {
    bar.value = 'retained';
  });
  await footer.evaluate((element) => element.classList.add('ios-theme-disabled'));
  await expect(footer).not.toHaveAttribute('data-native-ui-projected');
  await page.evaluate(() => {
    const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
    const snapshot = state.updates.findLast((s: NativeUISnapshot) => s.controls.some((c: NativeUIControl) => c.search?.active))!;
    state.notifyListeners('search', {
      id: snapshot.controls.find((c: NativeUIControl) => c.search)!.search!.id,
      valueVersion: snapshot.controls.find((c: NativeUIControl) => c.search)!.search!.valueVersion,
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
  await footer.locator('ion-buttons[slot=start] ion-button').evaluate((button: HTMLElement) => button.click());
  await page.locator('app-album-page ion-fab-button').evaluate((button: HTMLElement) => button.click());
  await expect(footer).toHaveCSS('opacity', '1');
  await footer.locator('ion-buttons[slot=start] ion-button').click();
  await expect(footer).toHaveCSS('opacity', '0');
  await footer.evaluate((element) => element.classList.remove('ios-theme-disabled'));
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((c: NativeUIControl) => c.search)?.search?.active,
      ),
    )
    .toBe(false);
  expect(errors).toEqual([]);
});

test('a cached search registration does not block a second page sharing the tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const first = page.locator('app-album-page:not([data-second]) ion-footer');
  await expect(first).toHaveAttribute('data-native-ui-projected', '');
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
  await expect(first).not.toHaveAttribute('data-native-ui-projected');
  await expect(second).toHaveAttribute('data-native-ui-projected', '');
  for (const showSecond of [false, true, false]) {
    await page
      .locator('app-album-page')
      .evaluateAll(
        (pages, showSecond) =>
          pages.forEach((element) => element.classList.toggle('ion-page-hidden', element.hasAttribute('data-second') !== showSecond)),
        showSecond,
      );
    await expect(showSecond ? second : first).toHaveAttribute('data-native-ui-projected', '');
    await expect(showSecond ? first : second).not.toHaveAttribute('data-native-ui-projected');
  }
});

test('a Leave sent before native Enter completes remains the final state', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    Capacitor.registerPlugin<NativeUIMock>('NativeUI').delay = 200;
    (document.querySelector('app-album-page ion-fab-button') as HTMLElement).click();
    (document.querySelector('app-album-page ion-footer ion-button') as HTMLElement).click();
  });
  await page.waitForTimeout(600);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((c: NativeUIControl) => c.search)?.search?.active,
      ),
    )
    .toBe(false);
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  expect(errors).toEqual([]);
});

test('app normalization wins over old native input while blur still terminates focus', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  await page.locator('app-album-page ion-fab-button').evaluate((button: HTMLElement) => button.click());
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((c: NativeUIControl) => c.search)?.search?.active,
      ),
    )
    .toBe(true);
  await footer.locator('ion-searchbar').evaluate((bar: HTMLIonSearchbarElement) => {
    const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
    const snapshot = state.updates.at(-1)!;
    const search = snapshot.controls.find((c: NativeUIControl) => c.search)!.search!;
    const emit = (phase: string, value: string) =>
      state.notifyListeners('search', {
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
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((c: NativeUIControl) => c.search)?.search?.focused,
      ),
    )
    .toBe(false);
});

test('a lost search bridge releases Enter and keeps the current value in Web', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => {
    const page = document.querySelector('app-album-page')!;
    (page.querySelector('ion-searchbar') as HTMLIonSearchbarElement).value = 'bridge retained';
    Capacitor.registerPlugin<NativeUIMock>('NativeUI').hang = true;
    (page.querySelector('ion-fab-button') as HTMLElement).click();
  });
  await expect(footer).not.toHaveAttribute('data-native-ui-projected', { timeout: 10000 });
  await expect(footer).toHaveCSS('opacity', '1');
  await expect(footer.locator('ion-searchbar')).toHaveJSProperty('value', 'bridge retained');
  expect(await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).nativeUI!.getStatus().state)).toBe('web');
  await footer.locator('ion-buttons[slot=start] ion-button').click();
  await expect(footer).toHaveCSS('opacity', '0');
});

test('a retained FAB accepts a second click while its current native update awaits acknowledgement', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => {
    Capacitor.registerPlugin<NativeUIMock>('NativeUI').delay = 500;
  });
  await activate(page, 'Center FAB actions');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.some(
            (c: NativeUIControl) =>
              c.kind === 'floating-action-button' && c.items.length === 7 && c.items.filter((i: NativeUIItem) => i.visible).length > 1,
          ),
      ),
    )
    .toBe(true);
  await activate(page, 'Center FAB actions');
  await expect(fab).toHaveJSProperty('activated', false);
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
});

test('FAB keeps its cover while Stencil show and the rendered host class catch up', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  await activate(page, 'Center FAB actions');
  await expect(fab.locator('ion-fab-list').first().locator('ion-fab-button')).toHaveClass(/fab-button-show/);
  await fab.evaluate((element) => {
    const child = element.querySelector('ion-fab-list ion-fab-button') as HTMLIonFabButtonElement;
    // Hold the real Stencil intermediate state long enough to exercise a bridge update.
    Object.defineProperty(child, 'show', { configurable: true, get: () => true });
    child.classList.remove('fab-button-show');
    (document.querySelector('ion-app') as TestAppElement).fabRetired = false;
    element.addEventListener('nativeUIChange', () => {
      if (!element.hasAttribute('data-native-ui-projected')) (document.querySelector('ion-app') as TestAppElement).fabRetired = true;
    });
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.some(
            (c: NativeUIControl) => c.kind === 'floating-action-button' && c.items.length === 7 && c.items[1].visible === false,
          ),
      ),
    )
    .toBe(true);
  await activate(page, 'Center FAB actions');
  await expect(fab).toHaveJSProperty('activated', false);
  expect(await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).fabRetired)).toBe(false);
});

test('native resume retires search even when WebKit visibility stayed visible', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  await footer.locator('ion-searchbar').evaluate(async (bar: HTMLIonSearchbarElement) => {
    bar.value = 'background';
    await bar.setFocus();
  });
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('nativeUIRefresh'), { retireSearch: true })));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.find((c: NativeUIControl) => c.search)?.search?.active,
      ),
    )
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
  await expect(edge).toHaveAttribute('data-native-ui-projected', '');
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
  ['button', 'ion-button[type=submit]'],
  ['back-button', 'ion-back-button'],
  ['menu-button', 'ion-buttons:has(> ion-menu-button)'],
]) {
  test(`${kind} stays Web outside fixed header/footer toolbars`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockNative(page);
    await page.goto('/main/index/native-ui');
    const source = page.locator(`app-native-ui ${selector}`);
    await expect(source).toHaveAttribute('data-native-ui-projected', '');
    const id = await page.evaluate(
      (kind) =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.find(
            (c: NativeUIControl) => c.kind === kind && (kind !== 'button' || c.items.some((item) => item.accessibilityLabel === 'Save')),
          )!.id,
      kind,
    );
    await source.evaluate((element) => {
      const zone = document.createElement('div');
      zone.style.cssText = 'position:fixed;top:330px;left:12px;width:300px;height:140px;z-index:200';
      element.closest('app-native-ui')!.append(zone);
      (document.querySelector('ion-app') as TestAppElement).placement = {
        element,
        parent: element.parentElement,
        next: element.nextSibling,
        slot: element.slot,
        zone,
      };
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
        const { element, zone } = (document.querySelector('ion-app') as TestAppElement).placement!;
        // These destinations have no toolbar start slot; keep the Web control assigned.
        element.slot = '';
        zone.innerHTML = markup;
        zone.querySelector('[data-target]')!.append(element);
      }, markup);
      await expect(source).not.toHaveAttribute('data-native-ui-projected');
      await expect
        .poll(() =>
          page.evaluate(
            (id) =>
              Capacitor.registerPlugin<NativeUIMock>('NativeUI')
                .updates.at(-1)!
                .controls.some((c: NativeUIControl) => c.id === id),
            id,
          ),
        )
        .toBe(false);
      await expect(source).toHaveCSS('visibility', 'visible');
      await page.evaluate(() => {
        const { element, parent, next, slot } = (document.querySelector('ion-app') as TestAppElement).placement!;
        parent!.insertBefore(element, next);
        element.slot = slot;
      });
      await expect(source, `restored from ${markup}`).toHaveAttribute('data-native-ui-projected', '');
    }
    // A footer toolbar is supported too; do not accidentally restrict this to headers.
    await page.evaluate(() => {
      const { element, zone } = (document.querySelector('ion-app') as TestAppElement).placement!;
      zone.innerHTML = '<ion-footer><ion-toolbar></ion-toolbar></ion-footer>';
      zone.querySelector('ion-toolbar')!.append(element);
    });
    await expect(source).toHaveAttribute('data-native-ui-projected', '');
  });
}

test('FAB requires a real content fixed slot and recovers after relocation', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/floating-action-button');
  const fab = page.locator('ion-fab[horizontal=center]');
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  for (const slot of ['', 'start']) {
    await fab.evaluate((element, slot) => element.setAttribute('slot', slot), slot);
    await expect(fab).not.toHaveAttribute('data-native-ui-projected');
    if (!slot) await expect(fab.locator(':scope > ion-fab-button')).toHaveCSS('visibility', 'visible');
    await fab.evaluate((element) => element.setAttribute('slot', 'fixed'));
    await expect(fab).toHaveAttribute('data-native-ui-projected', '');
  }
  await fab.evaluate((element) => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:absolute;inset:0;overflow:auto';
    element.replaceWith(wrapper);
    wrapper.append(element);
  });
  await expect(fab).not.toHaveAttribute('data-native-ui-projected');
  await fab.evaluate((element) => element.parentElement!.replaceWith(element));
  await expect(fab).toHaveAttribute('data-native-ui-projected', '');
});

test('search registration cannot bypass fixed placement restrictions', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/album');
  const footer = page.locator('app-album-page ion-footer');
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  await footer.evaluate((footer) => {
    const page = footer.parentElement!;
    const fab = page.querySelector('ion-fab')!;
    const buttons = footer.querySelector('ion-buttons')!;
    (document.querySelector('ion-app') as TestAppElement).searchPlacement = { page, footer, fab, buttons, toolbar: buttons.parentElement! };
  });
  for (const placement of ['fab-slot', 'fab-wrapper', 'back-outside', 'footer-scroll']) {
    await page.evaluate((placement) => {
      const { page, footer, fab, buttons } = (document.querySelector('ion-app') as TestAppElement).searchPlacement!;
      if (placement === 'fab-slot') fab.removeAttribute('slot');
      if (placement === 'fab-wrapper') {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:absolute;inset:0;overflow:auto';
        fab.replaceWith(wrapper);
        wrapper.append(fab);
      }
      if (placement === 'back-outside') footer.append(buttons);
      if (placement === 'footer-scroll') page.querySelector('ion-content')!.append(footer);
    }, placement);
    await expect(footer).not.toHaveAttribute('data-native-ui-projected');
    await expect
      .poll(() =>
        page.evaluate(() =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)!
            .controls.some((c: NativeUIControl) => c.search?.available),
        ),
      )
      .toBe(false);
    await page.evaluate((placement) => {
      const { page, footer, fab, buttons, toolbar } = (document.querySelector('ion-app') as TestAppElement).searchPlacement!;
      if (placement === 'fab-slot') fab.setAttribute('slot', 'fixed');
      if (placement === 'fab-wrapper') fab.parentElement!.replaceWith(fab);
      if (placement === 'back-outside') toolbar.prepend(buttons);
      if (placement === 'footer-scroll') page.append(footer);
    }, placement);
    await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  }
});

for (const theme of ['light', 'class', 'system', 'always'] as const) {
  test(`native tabs and FABs follow the applied ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.emulateMedia({ colorScheme: 'light' });
    await mockNative(page);
    await page.goto('/main/index/floating-action-button');
    await expect(page.locator('ion-fab[data-native-ui-projected]')).toHaveCount(4);
    // Keep color-scheme and the OS independent from the actual theme stylesheet.
    await page.evaluate(() => {
      document.documentElement.classList.remove('ion-palette-dark');
      document.documentElement.style.colorScheme = 'normal';
    });
    if (theme !== 'light') {
      await page.addStyleTag({
        content: compile(resolve(__dirname, `../../packages/theme-ios27/src/styles/ionic-theme-ios27-dark-${theme}.scss`), {
          importers: [importer],
        }).css,
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
            const controls = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!.controls;
            return ['tab-bar', 'floating-action-button'].map((kind) =>
              controls.filter((c: NativeUIControl) => c.kind === kind).map((c: NativeUIControl) => c.dark),
            );
          }),
        )
        .toEqual([[expected], [expected, expected, expected, expected]]);
    }
  });
}

test('native handoff crossfades visual opacity while transferring ownership once', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const segment = page.locator('app-native-ui ion-segment');
  await expect(segment).toHaveAttribute('data-native-ui-projected', '');
  await expect(segment).toHaveCSS('visibility', 'hidden');
  await segment.evaluate((el) => el.classList.add('native-ui-disabled'));
  await expect(segment).toHaveAttribute('data-native-ui-fading', '');
  await expect(segment).not.toHaveAttribute('data-native-ui-projected');
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
  await expect(segment).not.toHaveAttribute('data-native-ui-fading');
  await segment.evaluate((el) => el.classList.remove('native-ui-disabled'));
  await expect(segment).toHaveAttribute('data-native-ui-projected', '');
  await expect(segment).toHaveAttribute('data-native-ui-fading', '');
  const native = await sample();
  expect(native.opacity).toBeCloseTo(0.5, 1);
  expect(native.pointerEvents).toBe('none');
  expect(native.hidden).toBe('true');
  await expect(segment).toHaveCSS('visibility', 'hidden');
});

for (const reduced of [false, true])
  test(`Vertical Bars use shared handoff timing and retire only visuals (${reduced ? 'reduced' : 'animated'})`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await mockNative(page);
    await page.goto('/main/index/alert');
    await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    const source = page.locator('app-alert ion-back-button');
    const clone = page.locator('.ios-theme-vertical-bars-back-button-projection');
    await expect(source).toHaveAttribute('data-native-ui-vertical-bars', '');
    await expect(clone).toHaveCount(0);
    await page.evaluate(() => {
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        const result = animate.call(this, frames, options);
        if (this.matches('.ios-theme-vertical-bars-back-button-projection') && result.effect?.getTiming().duration === 180) {
          result.pause();
          result.currentTime = 90;
        }
        return result;
      };
    });
    await page.getByText('present:button-only', { exact: true }).click();
    await expect(clone).toHaveCount(1);
    await expect(source).not.toHaveAttribute('data-native-ui-vertical-bars');
    if (reduced) {
      await expect(clone).toHaveCSS('opacity', '1');
      expect(await clone.evaluate((el) => el.getAnimations().length)).toBe(0);
    } else {
      await expect(clone).toHaveAttribute('data-native-ui-fading', '');
      expect(await clone.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeCloseTo(0.5, 1);
      await expect(clone).toHaveJSProperty('inert', false);
      await clone.evaluate((el) => el.getAnimations().forEach((animation) => animation.finish()));
    }
    await page.locator('ion-alert').evaluate((alert: HTMLIonAlertElement) => alert.dismiss());
    await expect(source).toHaveAttribute('data-native-ui-vertical-bars', '');
    if (!reduced) {
      await expect(clone).toHaveJSProperty('inert', true);
      await expect(clone).toHaveAttribute('aria-hidden', 'true');
      await expect(clone).toHaveCSS('pointer-events', 'none');
      expect(await clone.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeCloseTo(0.5, 1);
      await clone.evaluate((el) => el.getAnimations().forEach((animation) => animation.finish()));
    }
    await expect(clone).toHaveCount(0);
    expect(await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!.transitionDuration)).toBe(
      reduced ? 0 : 180,
    );
  });

test('reduced motion hands off without a crossfade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const segment = page.locator('app-native-ui ion-segment');
  await expect(segment).toHaveAttribute('data-native-ui-projected', '');
  await expect(segment).not.toHaveAttribute('data-native-ui-fading');
  const duration = await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!.transitionDuration);
  expect(duration).toBe(0);
  await segment.evaluate((el) => el.classList.add('native-ui-disabled'));
  await expect(segment).not.toHaveAttribute('data-native-ui-projected');
  await expect(segment).toHaveCSS('opacity', '1');
});

test('Duo hides the entering search FAB before native acknowledgement and restores rejected search', async ({ page }) => {
  await mockNative(page);
  await page.route('https://picsum.photos/**', (route) => route.abort());
  await page.goto('/main/index');
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-projected', '');
  const fab = page.locator('app-album-page ion-fab');
  for (let visit = 0; visit < 2; visit++) {
    await page.evaluate(() => {
      Capacitor.registerPlugin<NativeUIMock>('NativeUI').delay = 150;
      const evidence: number[] = [];
      Object.assign(window, { enteringFabFrames: evidence });
      const sample = () => {
        const fab = document.querySelector('app-album-page ion-fab-button');
        if (fab && !fab.closest('.ion-page-hidden, .ion-page-invisible') && getComputedStyle(fab).visibility === 'visible')
          evidence.push(performance.now());
        if (!document.querySelector('app-album-page ion-fab[data-native-ui-projected]')) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await activate(page, 'Library');
    await expect(fab).toHaveAttribute('data-native-ui-projected', '');
    expect(await page.evaluate(() => (window as Window & { enteringFabFrames: number[] }).enteringFabFrames)).toEqual([]);
    await activate(page, 'Index');
    await expect(page).toHaveURL(/\/main\/index/);
    await expect(fab).not.toHaveAttribute('data-native-ui-projected');
  }
  await page.evaluate(() => {
    Capacitor.registerPlugin<NativeUIMock>('NativeUI').rejectAllSearch = true;
  });
  await activate(page, 'Library');
  await expect(fab).not.toHaveClass(/native-ui-prehidden/);
  await expect(fab).not.toHaveAttribute('data-native-ui-projected');
});

for (const edge of [null, 'trailing'] as const) {
  test(`tab search keeps Web trigger hidden while native search remains available (${edge ?? 'horizontal'})`, async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await mockNative(page, false, edge);
    await page.route('https://picsum.photos/**', (route) => route.abort());
    await page.goto('/main/album');
    if (edge) await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
    const fab = page.locator('app-album-page ion-fab');
    await expect(fab).toHaveAttribute('data-native-ui-projected', '');
    await fab.evaluate((element) => {
      const evidence: string[] = [];
      Object.assign(window, { searchOwnershipGaps: evidence });
      element.addEventListener('nativeUIChange', () => {
        const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
        if (
          !element.hasAttribute('data-native-ui-projected') &&
          !element.closest('.ion-page-hidden, .ion-page-invisible') &&
          state.updates.at(-1)?.controls.some((control) => control.search?.available)
        ) {
          evidence.push(location.pathname);
        }
      });
      Capacitor.registerPlugin<NativeUIMock>('NativeUI').delay = 150;
    });
    await page.evaluate(() => {
      const decode = HTMLImageElement.prototype.decode;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      HTMLImageElement.prototype.decode = async function () {
        await decode.call(this);
        if (this.src.startsWith('blob:')) await gate;
      };
      Object.assign(window, {
        releaseSearchDestinationIcons: () => {
          HTMLImageElement.prototype.decode = decode;
          release();
        },
      });
    });
    await activate(page, 'Index');
    await expect(page).toHaveURL(/\/main\/index/);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)
            ?.controls.some((control) => control.search?.available),
        ),
      )
      .toBe(false);
    // A router may finish hiding the departing page after its lifecycle event.
    // The normal read must not resurrect a Search already retired natively.
    await page.locator('app-album-page').evaluate((element) => element.classList.remove('ion-page-hidden'));
    await page.evaluate(() => (window as Window & { releaseSearchDestinationIcons(): void }).releaseSearchDestinationIcons());
    await expect(fab).not.toHaveAttribute('data-native-ui-projected');
    expect(
      await page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)
          ?.controls.some((control) => control.search?.available),
      ),
    ).toBe(false);
    await page.locator('app-album-page').evaluate((element) => element.classList.add('ion-page-hidden'));
    expect(await page.evaluate(() => (window as Window & { searchOwnershipGaps: string[] }).searchOwnershipGaps)).toEqual([]);
  });

  test(`tab switches retire old controls before destination icons finish (${edge ?? 'horizontal'})`, async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await mockNative(page, false, edge);
    await page.route('https://picsum.photos/**', (route) => route.abort());
    await page.goto('/main/index/native-ui');
    if (edge) await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
    const segment = page.locator('app-native-ui ion-segment');
    await expect(segment).toHaveAttribute('data-native-ui-projected', '');
    const outgoing = await page.evaluate(() => {
      const controls = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!.controls;
      return controls.filter((control) => control.kind !== 'tab-bar').map((control) => control.id);
    });
    await page.evaluate((ids) => {
      const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
      const update = state.update.bind(state);
      state.update = async (snapshot) => {
        if (!snapshot.controls.some((control) => ids.includes(control.id))) {
          const evidence = window as Window & { tabRetiredAt?: string };
          evidence.tabRetiredAt ??= location.pathname;
        }
        return update(snapshot);
      };
      const decode = HTMLImageElement.prototype.decode;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      HTMLImageElement.prototype.decode = async function () {
        await decode.call(this);
        if (this.src.startsWith('blob:')) await gate;
      };
      Object.assign(window, {
        releaseTabIcons: () => {
          HTMLImageElement.prototype.decode = decode;
          release();
        },
      });
    }, outgoing);
    await activate(page, 'Library');
    await expect(page).toHaveURL(/\/main\/album/);
    expect(await page.evaluate(() => (window as Window & { tabRetiredAt?: string }).tabRetiredAt)).toBe('/main/index/native-ui');
    await expect
      .poll(() =>
        page.evaluate((ids) => {
          const snapshot = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!;
          return snapshot.controls.some((control) => ids.includes(control.id));
        }, outgoing),
      )
      .toBe(false);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const snapshot = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!;
          return snapshot.controls.some((control) => control.kind === 'tab-bar');
        }),
      )
      .toBe(true);
    await page.evaluate(() => (window as Window & { releaseTabIcons(): void }).releaseTabIcons());
    await activate(page, 'Index');
    await expect(segment).toHaveAttribute('data-native-ui-projected', '');
    await page.evaluate(() => {
      Capacitor.registerPlugin<NativeUIMock>('NativeUI').delay = 150;
    });
    await activate(page, 'Library');
    await activate(page, 'Docs');
    await expect(page).toHaveURL(/\/main\/docs/);
    await activate(page, 'Index');
    await expect(segment).toHaveAttribute('data-native-ui-projected', '');
    // A rejected click must return the unchanged page to native ownership.
    await page.locator('ion-tab-button[tab="album"]').evaluate((button) => {
      button.addEventListener('click', (event) => event.stopImmediatePropagation(), { capture: true, once: true });
    });
    await activate(page, 'Library');
    await expect(segment).not.toHaveAttribute('data-native-ui-projected');
    await expect(segment).toHaveAttribute('data-native-ui-projected', '');
    await expect(page).toHaveURL(/\/main\/index\/native-ui/);
  });
}

for (const edge of [null, 'trailing'] as const) {
  test(`rejected tab selection preserves the next stack transition (${edge ?? 'horizontal'})`, async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await mockNative(page, false, edge);
    await page.goto('/main/index');
    if (edge) await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
    const menu = page.locator('index-page > ion-header ion-buttons[slot="end"]');
    await expect(menu).toHaveAttribute('data-native-ui-projected', '');
    await page.locator('ion-tab-button[tab="album"]').evaluate((button) => {
      button.addEventListener('click', (event) => event.stopImmediatePropagation(), { capture: true, once: true });
    });
    await activate(page, 'Library');
    await expect(menu).not.toHaveAttribute('data-native-ui-projected');
    await expect(menu).toHaveAttribute('data-native-ui-projected', '');
    await expect(page).toHaveURL(/\/main\/index/);
    await page.getByText('native-ui', { exact: true }).click();
    if (edge) {
      const depth = () =>
        page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)?.verticalBarNavigation?.length);
      await expect.poll(depth).toBe(2);
      await page.goBack();
      await expect(page).toHaveURL(/\/main\/index/);
      await expect.poll(depth).toBe(1);
      return;
    }
    await expect
      .poll(() =>
        page.evaluate(() => {
          const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
          return (
            state.updates.some((snapshot) =>
              snapshot.toolbarTransition?.destination.some((control) => control.items.some((item) => item.accessibilityLabel === 'Save')),
            ) && state.toolbarProgress.length > 0
          );
        }),
      )
      .toBe(true);
  });
}

test('tab switches hand off without a crossfade', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const segment = page.locator('app-native-ui ion-segment');
  await expect(segment).toHaveAttribute('data-native-ui-projected', '');
  const before = await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.length);
  await activate(page, 'Docs');
  await expect(page).toHaveURL(/\/main\/docs/);
  await expect
    .poll(() =>
      page.evaluate(
        (start) =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.slice(start)
            .some(
              (update: NativeUISnapshot) =>
                update.transitionDuration === 0 && !update.controls.some((control: NativeUIControl) => control.kind === 'segment'),
            ),
        before,
      ),
    )
    .toBe(true);
  await expect(segment).not.toHaveAttribute('data-native-ui-fading');
});

test('cancelling a handoff animation releases its temporary visibility override', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const segment = page.locator('app-native-ui ion-segment');
  await expect(segment).toHaveAttribute('data-native-ui-projected', '');
  await expect(segment).toHaveCSS('visibility', 'hidden');
  await segment.evaluate((el) => el.classList.add('native-ui-disabled'));
  await expect(segment).toHaveAttribute('data-native-ui-fading', '');
  await segment.evaluate((el) => el.getAnimations().forEach((animation) => animation.cancel()));
  await expect(segment).not.toHaveAttribute('data-native-ui-fading');
  await expect(segment).toHaveCSS('opacity', '1');
  await expect(segment).toHaveCSS('visibility', 'visible');
});

for (const direction of ['ltr', 'rtl']) {
  for (const slot of ['start', 'end']) {
    test(`projects button icon spacing and asymmetric insets for ${slot} in ${direction}`, async ({ page }) => {
      await mockNative(page);
      await page.goto('/main/index/native-ui');
      const button = page.locator('app-native-ui ion-button[type="submit"]');
      await expect(button).toHaveAttribute('data-native-ui-projected', '');
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
            const item = Capacitor.registerPlugin<NativeUIMock>('NativeUI')
              .updates.at(-1)
              ?.controls.find(
                (control: NativeUIControl) => control.kind === 'button' && control.items.some((item) => item.accessibilityLabel === 'Save'),
              )?.items[0];
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
    await page.goto('/main/index/native-ui');
    const button = page.locator('app-native-ui ion-back-button');
    await expect(button).toHaveAttribute('data-native-ui-projected', '');
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
          const item = Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)
            ?.controls.find((control: NativeUIControl) => control.kind === 'back-button')?.items[0];
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
  await expect(page.locator('app-album-page ion-footer')).toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => (Capacitor.registerPlugin<NativeUIMock>('NativeUI').rejectInactiveSearch = true));
  await activate(page, 'Index');
  await expect(page).toHaveURL('/main/index');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const control = Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)
          ?.controls.find((c: NativeUIControl) => c.kind === 'tab-bar');
        return !!control && !control.search;
      }),
    )
    .toBe(true);
  await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-projected', '');
  await activate(page, 'Docs');
  await expect(page).toHaveURL('/main/docs');
});

for (const invalidated of [false, true]) {
  test(`input received before acquisition acknowledgement is ${invalidated ? 'rejected after disabling' : 'delivered once'}`, async ({
    page,
  }) => {
    await mockNative(page);
    await page.goto('/main/index/native-ui');
    const button = page.locator('app-native-ui ion-button[type="submit"]');
    await expect(button).toHaveAttribute('data-native-ui-projected', '');
    await button.evaluate((el) => (el.parentElement!.hidden = true));
    await expect(button).not.toHaveAttribute('data-native-ui-projected');
    await page.evaluate(() => (Capacitor.registerPlugin<NativeUIMock>('NativeUI').delay = 1000));
    const previous = await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!.revision);
    await button.evaluate((el) => (el.parentElement!.hidden = false));
    await expect
      .poll(() =>
        page.evaluate((previous) => {
          const snapshot = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!;
          return snapshot.revision > previous && snapshot.controls.some((c: NativeUIControl) => c.kind === 'button');
        }, previous),
      )
      .toBe(true);
    await expect(button).not.toHaveAttribute('data-native-ui-projected');
    await activate(page, (await button.locator('[data-label]').textContent()) as string, true);
    await expect(page.locator('[data-save-count]')).toHaveText('0');
    if (invalidated) await button.evaluate((el: HTMLIonButtonElement) => (el.disabled = true));
    await page.evaluate(() => (Capacitor.registerPlugin<NativeUIMock>('NativeUI').delay = 0));
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
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => (Capacitor.registerPlugin<NativeUIMock>('NativeUI').rejectAllSearch = true));
  await page
    .locator('ion-tab-button ion-label')
    .first()
    .evaluate((el) => (el.textContent = 'Rejected'));
  await expect(footer).not.toHaveAttribute('data-native-ui-projected');
  const before = await page.locator('ion-tab-bar').boundingBox();
  await page.evaluate(() => (Capacitor.registerPlugin<NativeUIMock>('NativeUI').rejectAllSearch = false));
  await page
    .locator('ion-tab-button ion-label')
    .first()
    .evaluate((el) => (el.textContent = 'Retry'));
  await expect(footer).toHaveAttribute('data-native-ui-projected', '');
  expect(await page.locator('ion-tab-bar').boundingBox()).toEqual(before);
});

test('verticalBars return to native projection when the requested edge matches after rotation', async ({ page }) => {
  await mockNative(page, false, 'leading');
  await page.goto('/main/index/native-ui');
  await page.locator('app-native-ui ion-button[type=submit] ion-icon').evaluate((icon) => {
    icon.setAttribute('slot', 'icon-only');
    icon.parentElement!.querySelector('[data-label]')?.remove();
  });
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  const source = page.locator('app-native-ui ion-button[type=submit]');
  const clone = page.locator('ion-app > ion-button.ios-theme-vertical-bars-toolbar-projection[aria-label=Save]');
  await expect(clone).toBeVisible();
  const rotate = () =>
    page.evaluate(() => {
      Capacitor.registerPlugin<{ notifyListeners(name: string, value: unknown): void }>('Foldable').notifyListeners('barPlacementChange', {
        verticalBarEdge: 'trailing',
      });
      Capacitor.registerPlugin<NativeUIMock>('NativeUI').notifyListeners('webViewMetricsChange', {
        radius: 0,
        verticalBarEdge: 'trailing',
      });
    });
  await rotate();
  await expect(clone).toHaveCount(0);
  await expect(source).toHaveAttribute('data-native-ui-projected', '');
  await page.locator('ion-app').evaluate((element) => element.setAttribute('dir', 'rtl'));
  await expect(clone).toBeVisible();
  await page.locator('ion-app').evaluate((element) => element.classList.add('ios-theme-vertical-bars-left'));
  await expect(clone).toHaveCount(0);
  await expect(source).toHaveAttribute('data-native-ui-projected', '');
});

for (const type of ['normal', 'card', 'sheet']) {
  test(`verticalBars native controls follow the foreground ${type} modal`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await mockNative(page);
    await page.goto('/main/index/modal');
    await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    await page.getByText(`present:${type}`, { exact: true }).click();
    const modal = page.locator('ion-modal.show-modal');
    const close = modal.locator('ion-toolbar ion-button').first();
    await expect(close).toHaveAttribute('data-native-ui-vertical-bars-member', '');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const snapshot = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!;
          return snapshot.controls.flatMap((control) => control.items.map((item) => item.accessibilityLabel));
        }),
      )
      .toEqual(['Close', 'Done']);
    await expect(modal.locator('ion-toolbar ion-button').nth(1)).toHaveAttribute('data-native-ui-projected', '');
    if (type === 'sheet') {
      await modal.evaluate((element: HTMLIonModalElement) => element.setCurrentBreakpoint(0.5));
      await expect
        .poll(() =>
          page.evaluate(() => {
            const frame = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)?.verticalBarFrame;
            const modal = document.querySelector('ion-modal.show-modal')!;
            const top = modal.shadowRoot!.querySelector('[part~="content"]')!.getBoundingClientRect().top;
            return !!frame && Math.abs(frame.y - top) < 1 && frame.height < innerHeight;
          }),
        )
        .toBe(true);
    }
    await page.setViewportSize({ width: 1100, height: 900 });
    await expect(close).not.toHaveAttribute('data-native-ui-projected');
    await expect(close).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)?.controls.length))
      .toBe(0);
    // A delayed tap from the old native modal surface must not dismiss it.
    await activate(page, 'Close');
    await expect(modal).toBeVisible();
    await page.setViewportSize({ width: 700, height: 900 });
    await expect(close).toHaveAttribute('data-native-ui-vertical-bars-member', '');
    await modal.evaluate((element: HTMLIonModalElement) => {
      element.canDismiss = false;
    });
    await activate(page, 'Close', true);
    await expect(modal).toBeVisible();
    await modal.evaluate((element: HTMLIonModalElement) => {
      element.canDismiss = true;
    });
    await activate(page, 'Done', true);
    await expect(modal).toHaveCount(0);
    await expect(page.locator('app-modal ion-back-button')).toHaveAttribute('data-native-ui-projected', '');
  });
}

test('vertical tab bar skips modal presentation fade and fades back to native', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await mockNative(page);
  await page.goto('/main/index/modal');
  await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
  const bar = page.locator('ion-tab-bar');
  await expect(bar).toHaveAttribute('data-native-ui-projected', '');
  await expect(bar).not.toHaveAttribute('data-native-ui-fading');
  await bar.evaluate((element) => {
    const animate = element.animate.bind(element);
    element.animate = (frames, options) => {
      element.setAttribute('data-fade-frames', JSON.stringify(frames));
      element.setAttribute('data-fade-count', String(Number(element.getAttribute('data-fade-count') ?? 0) + 1));
      return animate(frames, options);
    };
  });
  await page.getByText('present:normal', { exact: true }).click();
  await expect(bar).not.toHaveAttribute('data-fade-frames');
  await expect(bar).not.toHaveAttribute('data-fade-count');
  await expect(page.locator('ion-modal ion-toolbar ion-button').nth(1)).toHaveAttribute('data-native-ui-vertical-bars-member', '');
  await activate(page, 'Done', true);
  await expect(page.locator('ion-modal.show-modal')).toHaveCount(0);
  await expect(bar).toHaveAttribute('data-native-ui-projected', '');
  await expect(bar).toHaveAttribute('data-fade-frames', JSON.stringify([{ opacity: 1 }, { opacity: 0 }]));
  await expect(bar).toHaveAttribute('data-fade-count', '1');
});

for (const { fill, native, grouped } of [
  { fill: 'solid', native: true, grouped: false },
  { fill: 'outline', native: true, grouped: true },
  { fill: 'solid', native: false, grouped: true },
  { fill: 'outline', native: false, grouped: false },
] as const) {
  test(`${fill} icon-only rail button preserves external form submit: native=${native}, grouped=${grouped}`, async ({ page }) => {
    await mockNative(page, !native);
    await page.goto('/main/index/native-ui?buttonProjection=source');
    await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    await page.locator('app-native-ui').evaluate(
      (root, { fill, grouped }) => {
        const button = document.createElement('ion-button');
        button.id = 'rail-submit';
        button.type = 'submit';
        button.fill = fill;
        button.color = 'primary';
        button.setAttribute('aria-label', 'Confirm');
        Object.assign(button, { form: root.querySelector('form') });
        const icon = root.querySelector('ion-button[type=submit] ion-icon')!.cloneNode(true) as HTMLElement;
        icon.setAttribute('slot', 'icon-only');
        button.append(icon);
        const group = document.createElement('ion-buttons');
        group.slot = 'end';
        group.append(button);
        if (grouped) {
          const peer = button.cloneNode(true) as HTMLIonButtonElement;
          peer.removeAttribute('id');
          peer.type = 'button';
          peer.setAttribute('aria-label', 'Peer');
          group.append(peer);
        }
        root.querySelector('ion-toolbar')!.append(group);
      },
      { fill, grouped },
    );
    const button = page.locator('#rail-submit');
    const border = await button.evaluate((element) => {
      const style = getComputedStyle(element.shadowRoot!.querySelector('[part=native]')!);
      return { color: style.borderTopColor, width: parseFloat(style.borderTopWidth) };
    });
    if (native) {
      await expect(grouped ? button.locator('..') : button).toHaveAttribute('data-native-ui-projected', '');
      if (fill === 'solid' || fill === 'outline')
        await expect
          .poll(() =>
            page.evaluate(
              ({ fill, border }) => {
                const item = Capacitor.registerPlugin<NativeUIMock>('NativeUI')
                  .updates.at(-1)
                  ?.controls.flatMap((control) => control.items)
                  .find((item) => item.accessibilityLabel === 'Confirm');
                return fill === 'solid'
                  ? !!item?.backgroundColor && item.backgroundColor !== 'rgba(0, 0, 0, 0)'
                  : item?.borderColor === border.color && item?.borderWidth === border.width && border.width > 0;
              },
              { fill, border },
            ),
          )
          .toBe(true);
      await activate(page, 'Confirm', true);
    } else {
      const projection = page.locator(
        grouped
          ? 'ion-app > ion-buttons.ios-theme-vertical-bars-toolbar-projection > ion-button[aria-label=Confirm]'
          : 'ion-app > ion-button.ios-theme-vertical-bars-toolbar-projection[aria-label=Confirm]',
      );
      await expect(projection).toHaveClass(new RegExp(`button-${fill}`));
      if (fill === 'outline') {
        await expect(projection.locator('[part=native]')).toHaveCSS('border-top-color', border.color);
        await expect(projection.locator('[part=native]')).toHaveCSS('border-top-width', `${border.width}px`);
      }
      await projection.click();
    }
    await expect(page.locator('[data-save-count]')).toHaveText('1');
  });
}

for (const native of [true, false]) {
  test(`verticalBars placement requires the icon-only slot for every fill: native=${native}`, async ({ page }) => {
    await mockNative(page, !native);
    await page.goto('/main/index/native-ui');
    await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    await page.locator('app-native-ui').evaluate((root) => {
      for (const fill of ['default', 'clear', 'solid', 'outline'] as const) {
        const group = document.createElement('ion-buttons');
        group.slot = 'end';
        for (const slot of ['', 'start', 'end', 'icon-only']) {
          const button = document.createElement('ion-button');
          button.id = `shape-${fill}-${slot || 'none'}`;
          button.fill = fill;
          button.setAttribute('aria-label', button.id);
          const icon = root.querySelector('ion-icon')!.cloneNode(true) as HTMLElement;
          icon.slot = slot;
          button.append(icon);
          if (slot === 'start' || slot === 'end') {
            const span = document.createElement('span');
            span.textContent = 'Save';
            button.append(span);
          }
          group.append(button);
        }
        root.querySelector('ion-toolbar')!.append(group);
      }
    });
    for (const fill of ['default', 'clear', 'solid', 'outline']) {
      await expect(page.locator(`#shape-${fill}-icon-only`)).toHaveAttribute('data-native-ui-projected', '');
      for (const slot of ['none', 'start', 'end']) {
        await expect(page.locator(`#shape-${fill}-${slot}`)).not.toHaveAttribute('data-native-ui-projected');
        await expect(page.locator(`#shape-${fill}-${slot}`)).toHaveCSS('visibility', 'visible');
      }
    }
  });
}

for (const projection of ['source', 'system'] as const) {
  test(`button projection ${projection} sends appearance and state updates to the native bridge`, async ({ page }) => {
    await mockNative(page);
    await page.setViewportSize({ width: 466, height: 678 });
    await page.goto(`/main/index?verticalBarsOnly&buttonDefaultFill=solid${projection === 'source' ? '&buttonProjection=source' : ''}`);
    await page.getByText('iPhone Duo Mode', { exact: true }).click();
    await page.getByText('button-projection', { exact: true }).click();
    const items = () =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)
            ?.controls.flatMap((control) => control.items)
            .filter((item) => ['Omitted', 'Clear', 'Solid', 'Outline'].includes(item.accessibilityLabel ?? '')) ?? [],
      );
    await expect.poll(async () => (await items()).length).toBe(4);
    if (projection === 'system') {
      const toolbar = page.locator('app-button-projection ion-header > ion-toolbar').nth(1);
      await expect(toolbar).toBeHidden();
      await toolbar.evaluate((element) => element.append('Draft'));
      await expect(toolbar).toBeVisible();
      await toolbar.evaluate((element) => {
        Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent === 'Draft')!.textContent = '';
      });
      await expect(toolbar).toBeHidden();
    }

    await expect
      .poll(async () => (await items()).map((item) => item.buttonFill))
      .toEqual(projection === 'source' ? ['clear', 'clear', 'solid', 'outline'] : [undefined, undefined, undefined, undefined]);
    await expect.poll(async () => (await items()).find((item) => item.accessibilityLabel === 'Omitted')?.backgroundColor).toBeUndefined();
    await page.getByRole('switch', { name: 'Custom CSS background', exact: true }).click();
    await expect
      .poll(async () => (await items()).find((item) => item.accessibilityLabel === 'Solid')?.backgroundColor)
      .toBe(projection === 'source' ? 'rgb(184, 54, 42)' : undefined);
    expect((await items()).find((item) => item.accessibilityLabel === 'Clear')?.backgroundColor).toBeUndefined();
    expect((await items()).find((item) => item.accessibilityLabel === 'Omitted')?.backgroundColor).toBeUndefined();
    const clearId = (await items()).find((item) => item.accessibilityLabel === 'Clear')!.id;
    for (const fill of ['solid', 'outline', 'clear'] as const) {
      await page
        .locator('app-button-projection ion-button:has(ion-icon[name="heart-outline"])')
        .evaluate((button: HTMLIonButtonElement, value) => (button.fill = value), fill);
      await expect
        .poll(async () => {
          const item = (await items()).find((item) => item.accessibilityLabel === 'Clear');
          return { id: item?.id, fill: item?.buttonFill };
        })
        .toEqual({ id: clearId, fill: projection === 'source' ? fill : undefined });
    }
    await page.getByRole('switch', { name: 'Disabled', exact: true }).click();
    await expect.poll(async () => (await items()).map((item) => item.disabled)).toEqual([true, true, true, true]);
    for (const placement of ['Grouped', 'Standalone', 'Separate']) {
      await page.locator('ion-select').click();
      await page.getByRole('radio', { name: placement, exact: true }).click();
      // ionChange updates native state before the select's dismissal finishes.
      // Wait for the overlay to close before attempting the next open.
      await expect(page.locator('ion-select-popover')).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(() =>
            Capacitor.registerPlugin<NativeUIMock>('NativeUI')
              .updates.at(-1)
              ?.controls.filter((control) =>
                control.items.some((item) => ['Omitted', 'Clear', 'Solid', 'Outline'].includes(item.accessibilityLabel ?? '')),
              )
              .map((control) => control.items.length),
          ),
        )
        .toEqual(placement === 'Grouped' ? [4] : [1, 1, 1, 1]);
      await expect.poll(async () => (await items()).map((item) => item.disabled)).toEqual([true, true, true, true]);
      await expect
        .poll(async () => (await items()).map((item) => item.buttonFill))
        .toEqual(
          projection === 'source'
            ? [placement === 'Standalone' ? 'solid' : 'clear', 'clear', 'solid', 'outline']
            : [undefined, undefined, undefined, undefined],
        );
      expect((await items()).every((item) => item.iconTemplate === (projection === 'system' ? true : undefined))).toBe(true);
      await expect
        .poll(async () => (await items()).find((item) => item.accessibilityLabel === 'Omitted')?.backgroundColor)
        .toBe(projection === 'source' && placement === 'Standalone' ? 'rgb(184, 54, 42)' : undefined);
    }
    const solid = page.locator('app-button-projection ion-button:has(ion-icon[name="add-outline"])');
    const group = solid.locator('..');
    const opposite = projection === 'source' ? 'system' : 'source';
    const solidItem = async () => (await items()).find((item) => item.accessibilityLabel === 'Solid');
    const id = (await solidItem())!.id;
    const expectProjection = async (mode: string) => {
      await expect
        .poll(async () => {
          const item = await solidItem();
          return { id: item?.id, fill: item?.buttonFill, template: item?.iconTemplate };
        })
        .toEqual({ id, fill: mode === 'source' ? 'solid' : undefined, template: mode === 'system' ? true : undefined });
    };
    await group.evaluate((element, mode) => element.classList.add(`ios-theme-projection-${mode}`), opposite);
    await expectProjection(opposite);
    await solid.evaluate((element, mode) => element.classList.add(`ios-theme-projection-${mode}`), projection);
    await expectProjection(projection);
    await solid.evaluate((element) => element.classList.remove('ios-theme-projection-source', 'ios-theme-projection-system'));
    await expectProjection(opposite);
    await group.evaluate((element) => element.classList.remove('ios-theme-projection-source', 'ios-theme-projection-system'));
    await expectProjection(projection);
    await group.evaluate((element, mode) => element.setAttribute('data-projection', mode), opposite);
    await expectProjection(opposite);
    await solid.evaluate((element, mode) => element.classList.add(`ios-theme-projection-${mode}`), projection);
    await expectProjection(projection);
    await solid.evaluate((element, mode) => element.setAttribute('data-projection', mode), opposite);
    await expectProjection(opposite);
    await solid.evaluate((element) => element.removeAttribute('data-projection'));
    await expectProjection(projection);
    await solid.evaluate((element) => element.classList.remove('ios-theme-projection-source', 'ios-theme-projection-system'));
    await expectProjection(opposite);
    await group.evaluate((element) => element.removeAttribute('data-projection'));
    await expectProjection(projection);
  });
}

test('tab visibility ignores query parameters and fragments', async ({ page }) => {
  for (const path of ['/main/index/button-projection', '/main/settings', '/main/index/toolbar']) {
    await page.goto(`${path}?verticalBarsOnly&buttonDefaultFill=solid#comparison`);
    await expect(page.locator('ion-tab-bar')).toHaveClass(/tab-bar-hidden/);
  }
  await page.goto('/main/index?verticalBarsOnly&buttonDefaultFill=solid#comparison');
  await expect(page.locator('ion-tab-bar')).not.toHaveClass(/tab-bar-hidden/);
});

for (const standalone of [false, true])
  test(`Vertical Bars popover retains native controls and background geometry (${standalone ? 'standalone' : 'full shell'})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await mockNative(page);
    await page.goto(`/main/index/popover${standalone ? '?verticalBarsOnly' : ''}`);
    await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    const trigger = page.locator('#native-popover-trigger');
    await expect(trigger).toHaveAttribute('data-native-ui-vertical-bars-member', '', { timeout: 15000 });
    await page.evaluate(() =>
      Object.assign(Capacitor.registerPlugin('NativeUI'), {
        async prepareOverlay() {},
        async presentOverlay() {},
        async dismissOverlay() {},
      }),
    );
    await page
      .locator('app-popover ion-content')
      .first()
      .evaluate(async (content: HTMLIonContentElement) => content.scrollToPoint(0, 100));
    const geometry = () =>
      page
        .locator('app-popover ion-content')
        .first()
        .evaluate(async (content: HTMLIonContentElement) => {
          const rect = content.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scroll: (await content.getScrollElement()).scrollTop };
        });
    const before = await geometry();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const updateCount = await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.length);
      const opened = page.waitForEvent('popup');
      await activate(page, 'Open popover');
      const relay = await opened;
      await expect(relay.getByText('Toolbar popover', { exact: true })).toBeVisible();
      // Playwright visibility and native accessibility do not reject opacity:0.
      await expect(relay.locator('ion-popover .popover-content')).toHaveCSS('opacity', '1');
      expect(await relay.evaluate(() => document.compatMode)).toBe('CSS1Compat');
      expect((await relay.getByRole('button', { name: 'Increment', exact: true }).boundingBox())!.height).toBeLessThan(80);
      await expect(trigger).toHaveAttribute('data-native-ui-vertical-bars-member', '', { timeout: 15000 });
      expect(await geometry()).toEqual(before);
      expect(
        await page.evaluate(
          (start) =>
            Capacitor.registerPlugin<NativeUIMock>('NativeUI')
              .updates.slice(start)
              .every((snapshot) =>
                snapshot.controls.some(
                  (control) =>
                    control.placement === 'vertical-bars' && control.items.some((item) => item.accessibilityLabel === 'Open popover'),
                ),
              ),
          updateCount,
        ),
      ).toBe(true);
      await relay.getByRole('button', { name: 'Increment', exact: true }).click();
      await expect(relay.getByText(`Count: ${attempt}`, { exact: true })).toBeVisible();
      await relay.getByRole('button', { name: 'Close popover', exact: true }).click();
      await expect.poll(() => relay.isClosed()).toBe(true);
      await expect(trigger).toHaveAttribute('data-native-ui-vertical-bars-member', '', { timeout: 15000 });
      expect(await geometry()).toEqual(before);
    }
  });

test('ordinary popovers stay in the source WebView', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/popover');
  await expect(page.locator('#native-popover-trigger')).toHaveAttribute('data-native-ui-projected', '');

  await activate(page, 'Open popover');
  await expect(page.getByText('Toolbar popover', { exact: true })).toBeVisible();
  expect(page.context().pages()).toHaveLength(1);
  expect(await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').preparedPopovers)).toBe(0);
  await page.getByRole('button', { name: 'Close popover', exact: true }).click();
});

const expectWebPopoverPainted = async (page: Page) => {
  const overlay = page.locator('ion-popover[trigger="native-popover-trigger"]');
  await expect(overlay).toHaveCSS('opacity', '1');
  await expect(overlay.locator('.popover-content').first()).toHaveCSS('opacity', '1');
  await expect(overlay.locator('.popover-arrow').first()).toHaveCSS('opacity', '1');
  const backdropOpacity = await overlay.evaluate((el) => getComputedStyle(el).getPropertyValue('--backdrop-opacity').trim());
  await expect(overlay.locator('ion-backdrop').first()).toHaveCSS('opacity', String(Number(backdropOpacity)));
  await expect(overlay).toHaveJSProperty('animated', true);
  const box = (await overlay.locator('.popover-content').first().boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
};

for (const edge of ['leading', 'trailing'] as const)
  test(`Vertical Bars popover preparation failure restores usable Web content and projection updates (${edge})`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await mockNative(page, false, edge);
    await page.goto('/main/index/popover');
    await page.locator('ion-app').evaluate((app, edge) => {
      app.classList.add('ios-theme-vertical-bars');
      app.classList.toggle('ios-theme-vertical-bars-left', edge === 'leading');
    }, edge);
    const trigger = page.locator('#native-popover-trigger');
    await expect(trigger).toHaveAttribute('data-native-ui-vertical-bars-member', '', { timeout: 15000 });
    const anchor = { x: edge === 'leading' ? 18 : 624, y: 240, width: 48, height: 48 };
    await page.evaluate((anchor) => {
      const mock = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
      const id = mock.updates
        .at(-1)!
        .controls.flatMap((c) => c.items)
        .find((i) => i.accessibilityLabel === 'Open popover')!.id;
      mock.geometry = { [id]: anchor };
    }, anchor);
    await page
      .locator('ion-popover[trigger="native-popover-trigger"]')
      .evaluate((overlay) => overlay.style.setProperty('--backdrop-opacity', '0.24'));
    for (let attempt = 1; attempt <= 2; attempt++) {
      await activate(page, 'Open popover');
      await expect(page.getByText('Toolbar popover', { exact: true })).toBeVisible();
      await expectWebPopoverPainted(page);
      await expect(trigger).not.toHaveAttribute('data-native-ui-vertical-bars-member');
      await expect(page.locator('.ios-theme-vertical-bars-back-button-projection')).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)?.controls.length))
        .toBe(0);
      const box = (await page.locator('ion-popover[trigger="native-popover-trigger"] .popover-content').boundingBox())!;
      expect(edge === 'leading' ? box.x : box.x + box.width).toBeCloseTo(edge === 'leading' ? anchor.x : anchor.x + anchor.width, 0);
      expect(box.y).toBeCloseTo(anchor.y, 0);
      if (attempt === 1) {
        const screenshot = test.info().outputPath('web-popover-fallback-painted.png');
        await page.screenshot({ path: screenshot });
        await test.info().attach('web-popover-fallback-painted', { path: screenshot, contentType: 'image/png' });
      }
      await page.getByRole('button', { name: 'Increment', exact: true }).click();
      await expect(page.getByText(`Count: ${attempt}`, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Close popover', exact: true }).click();
      await expect(trigger).toHaveAttribute('data-native-ui-vertical-bars-member', '', { timeout: 15000 });
      expect(page.context().pages()).toHaveLength(1);
    }
  });

for (const refusal of ['disabled', 'md'])
  test(`Vertical Bars popover rejected before preparation returns the rail to Web (${refusal})`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await mockNative(page);
    await page.goto('/main/index/popover');
    await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    const trigger = page.locator('#native-popover-trigger');
    await expect(trigger).toHaveAttribute('data-native-ui-vertical-bars-member', '');
    await page.locator('ion-popover[trigger="native-popover-trigger"]').evaluate((overlay: HTMLIonPopoverElement, refusal) => {
      if (refusal === 'disabled') overlay.setAttribute('data-native-ui', 'disabled');
      else overlay.mode = 'md';
    }, refusal);
    await activate(page, 'Open popover');
    await expect(page.getByText('Toolbar popover', { exact: true })).toBeVisible();
    await expect(trigger).not.toHaveAttribute('data-native-ui-vertical-bars-member');
    await expect(page.locator('.ios-theme-vertical-bars-back-button-projection')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)?.controls.length))
      .toBe(0);
    expect(await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').preparedPopovers)).toBe(0);
    await page.getByRole('button', { name: 'Increment', exact: true }).click();
    await expect(page.getByText('Count: 1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close popover', exact: true }).click();
    await expect(trigger).toHaveAttribute('data-native-ui-vertical-bars-member', '');
  });

for (const disabled of [false, true])
  test(`Vertical Bars popover handles anchor clicks during dismissal (${disabled ? 'disabled before replay' : 'reopens once'})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await mockNative(page);
    await page.goto('/main/index/popover');
    await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    const trigger = page.locator('#native-popover-trigger');
    await expect(trigger).toHaveAttribute('data-native-ui-vertical-bars-member', '', { timeout: 15000 });
    await page.evaluate(() => {
      const plugin = Capacitor.registerPlugin<NativeUIMock & { finishDismiss?: () => void }>('NativeUI');
      Object.assign(plugin, {
        async prepareOverlay() {},
        async presentOverlay() {},
        dismissOverlay: () =>
          new Promise<void>((resolve) => {
            plugin.finishDismiss = resolve;
          }),
      });
    });
    const opened = page.waitForEvent('popup');
    await activate(page, 'Open popover');
    const relay = await opened;
    await expect(relay.getByText('Toolbar popover', { exact: true })).toBeVisible();
    await relay.getByRole('button', { name: 'Close popover', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => !!Capacitor.registerPlugin<NativeUIMock & { finishDismiss?: () => void }>('NativeUI').finishDismiss))
      .toBe(true);
    // UIKit can accept the next tap while Ionic still waits for didDismiss.
    // Repeated clicks must coalesce, and a now-disabled source must not replay.
    for (let i = 0; i < 3; i++) await activate(page, 'Open popover');
    if (disabled)
      await trigger.evaluate((button: HTMLIonButtonElement) => {
        button.disabled = true;
      });
    await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock & { finishDismiss?: () => void }>('NativeUI').finishDismiss!());
    await expect.poll(() => relay.isClosed()).toBe(true);
    if (disabled) {
      await expect(trigger).toHaveJSProperty('disabled', true);
      await expect.poll(() => page.context().pages().length).toBe(1);
    } else {
      await expect.poll(() => page.context().pages().length).toBe(2);
      const reopened = page
        .context()
        .pages()
        .find((candidate) => candidate !== page)!;
      await expect(reopened.getByText('Toolbar popover', { exact: true })).toBeVisible();
      await reopened.getByRole('button', { name: 'Increment', exact: true }).click();
      await expect(reopened.getByText('Count: 1', { exact: true })).toBeVisible();
    }
  });

for (const failure of ['reject', 'timeout'] as const)
  test(`Vertical Bars popover preserves didDismiss after native dismissal ${failure}`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await mockNative(page);
    await page.goto('/main/index/popover');
    await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    const trigger = page.locator('#native-popover-trigger');
    await expect(trigger).toHaveAttribute('data-native-ui-vertical-bars-member', '', { timeout: 15000 });
    await page.evaluate((failure) => {
      Object.assign(Capacitor.registerPlugin('NativeUI'), {
        async prepareOverlay() {},
        async presentOverlay() {},
        dismissOverlay: () => (failure === 'reject' ? Promise.reject(new Error('Native dismiss failed')) : new Promise(() => {})),
      });
    }, failure);
    const opened = page.waitForEvent('popup');
    await activate(page, 'Open popover');
    const relay = await opened;
    await expect(relay.getByText('Toolbar popover', { exact: true })).toBeVisible();
    const result = await page.locator('ion-popover[trigger="native-popover-trigger"]').evaluate(async (overlay: HTMLIonPopoverElement) => {
      const didDismiss = overlay.onDidDismiss();
      await overlay.dismiss({ saved: true }, 'confirm');
      return Promise.race([didDismiss, new Promise((resolve) => setTimeout(() => resolve('missing didDismiss'), 1000))]);
    });
    expect(result).toEqual({ data: { saved: true }, role: 'confirm' });
    await expect.poll(() => relay.isClosed()).toBe(true);
    await expect(trigger).toHaveAttribute('data-native-ui-vertical-bars-member', '');
    const reopened = page.waitForEvent('popup');
    await activate(page, 'Open popover');
    await expect((await reopened).getByText('Toolbar popover', { exact: true })).toBeVisible();
  });

for (const nestedTag of ['ion-popover', 'ion-modal'] as const)
  for (const nestedInRelay of [false, true, 'sibling'] as const)
    test(`Vertical Bars popover restores nested ${nestedTag} (${nestedInRelay === 'sibling' ? 'child document sibling' : nestedInRelay ? 'inline content' : 'source controller'})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 700, height: 900 });
      await mockNative(page);
      await page.goto('/main/index/popover');
      await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
      await expect(page.locator('#native-popover-trigger')).toHaveAttribute('data-native-ui-vertical-bars-member', '');
      await page.evaluate(() =>
        Object.assign(Capacitor.registerPlugin('NativeUI'), {
          async prepareOverlay() {},
          async presentOverlay() {},
          async dismissOverlay() {},
        }),
      );
      await page.evaluate(() => {
        const open = window.open.bind(window);
        window.open = (...args) => {
          const relay = open(...args);
          (window as Window & { reviewRelay?: Window | null }).reviewRelay = relay;
          return relay;
        };
      });
      const opened = page.waitForEvent('popup');
      await activate(page, 'Open popover');
      const relay = await opened;
      await expect(relay.getByText('Toolbar popover', { exact: true })).toBeVisible();
      await page.evaluate(
        async ({ nestedInRelay, nestedTag }) => {
          const nested = document.createElement(nestedTag);
          nested.id = 'nested-review-popover';
          const lifecycle = { will: 0, did: 0, data: undefined as unknown };
          (window as Window & { nestedLifecycle?: typeof lifecycle }).nestedLifecycle = lifecycle;
          const name = nestedTag === 'ion-modal' ? 'Modal' : 'Popover';
          nested.addEventListener(`ion${name}WillPresent`, () => lifecycle.will++);
          nested.addEventListener(`ion${name}DidDismiss`, (event) => {
            lifecycle.did++;
            lifecycle.data = (event as CustomEvent).detail.data;
          });
          const body = document.createElement('div');
          const title = document.createElement('p');
          title.textContent = 'Nested content';
          body.append(title);
          const action = document.createElement('button');
          action.textContent = 'Nested action';
          action.addEventListener('click', () => (action.textContent = 'Nested action completed'));
          body.append(action);
          nested.component = body;
          if (nestedInRelay) {
            // The Angular content remains live in the child document.
            const windows = window as Window & { reviewRelay?: Window };
            const target =
              nestedInRelay === 'sibling'
                ? windows.reviewRelay!.document.body
                : windows.reviewRelay!.document.querySelector('ion-popover > div')!;
            target.append(nested);
          } else document.querySelector('ion-app')!.append(nested);
          await nested.present();
        },
        { nestedInRelay, nestedTag },
      );
      await expect.poll(() => relay.isClosed()).toBe(true);
      await expect(page.getByText('Nested content', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Nested action', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Nested action completed', exact: true })).toBeVisible();
      await page
        .locator('#nested-review-popover')
        .evaluate(async (overlay: HTMLIonPopoverElement) => overlay.dismiss({ saved: true }, 'confirm', false));
      expect(await page.evaluate(() => (window as Window & { nestedLifecycle?: unknown }).nestedLifecycle)).toEqual({
        will: 1,
        did: 1,
        data: { saved: true },
      });
      await expect(page.getByText('Toolbar popover', { exact: true })).toBeVisible();
      await expectWebPopoverPainted(page);
      await page.getByRole('button', { name: 'Close popover', exact: true }).click();
      await expect(page.locator('#native-popover-trigger')).toHaveAttribute('data-native-ui-vertical-bars-member', '');
    });

for (const [route, tag, trigger, keep] of [
  ['alert', 'ion-alert', 'present:button-only', false],
  ['action-sheet', 'ion-action-sheet', 'present:button-only', false],
  ['progress-indicators', 'ion-loading', 'Show IconOnly', false],
  ['popover', 'ion-popover', '#click-trigger-button', true],
  ['toast', 'ion-toast', 'present:middle', true],
] as const) {
  test(`Vertical Bars overlay policy: ${tag}`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await mockNative(page);
    await page.goto(`/main/index/${route}`);
    await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    const back = page.locator('ion-back-button:not(.ion-cloned-element)').first();
    await expect(back).toHaveAttribute('data-native-ui-vertical-bars', '');
    const actionLabel = await page.evaluate(
      () =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)!
          .controls.find((control) => control.kind === 'back-button')!.items[0].accessibilityLabel!,
    );
    await back.evaluate((element) => {
      element.setAttribute('data-clicks', '0');
      element.addEventListener(
        'click',
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          element.setAttribute('data-clicks', String(Number(element.getAttribute('data-clicks')) + 1));
        },
        true,
      );
    });
    if (trigger.startsWith('#')) await page.locator(trigger).click();
    else await page.getByText(trigger, { exact: true }).click();
    const overlay = page.locator(`${tag}:not(.overlay-hidden)`).last();
    await expect(overlay).toBeVisible();
    if (keep) {
      await expect(back).toHaveAttribute('data-native-ui-vertical-bars', '');
      await activate(page, actionLabel);
      await expect(back).toHaveAttribute('data-clicks', '1');
    } else {
      await expect
        .poll(() => page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)?.controls.length))
        .toBe(0);
      await expect(page.locator('.ios-theme-vertical-bars-back-button-projection')).toBeVisible();
    }
    await overlay.evaluate((element: HTMLElement & { dismiss(): Promise<boolean> }) => element.dismiss());
    await expect(back).toHaveAttribute('data-native-ui-vertical-bars', '');
    await activate(page, actionLabel);
    await expect(back).toHaveAttribute('data-clicks', keep ? '2' : '1');
  });
}

for (const invalidation of ['resize', 'mode'])
  test(`Vertical Bars Web fallback geometry invalidates on ${invalidation}`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await mockNative(page);
    await page.goto('/main/index/alert');
    await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    const back = page.locator('ion-back-button:not(.ion-cloned-element)').first();
    await expect(back).toHaveAttribute('data-native-ui-vertical-bars', '');
    await page.evaluate(() => {
      const mock = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
      const tabs = mock.updates.at(-1)!.controls.find((control) => control.kind === 'tab-bar')!;
      mock.geometry = {
        BackButton: { x: 628, y: 176, width: 48, height: 48 },
        __tabBar: { x: 628, y: 600, width: 48, height: 220 },
        ...Object.fromEntries(tabs.items.map((item, index) => [item.id, { x: 632, y: 604 + index * 50, width: 40, height: 50 }])),
      };
    });
    await page.getByText('present:button-only', { exact: true }).click();
    const clone = page.locator('.ios-theme-vertical-bars-back-button-projection');
    await expect(clone).toBeVisible();
    await expect.poll(() => clone.boundingBox()).toEqual({ x: 628, y: 176, width: 48, height: 48 });
    await expect.poll(() => page.locator('ion-tab-bar').boundingBox()).toEqual({ x: 628, y: 600, width: 48, height: 220 });
    if (invalidation === 'resize') await page.setViewportSize({ width: 800, height: 900 });
    else await page.locator('ion-app').evaluate((app) => app.classList.remove('ios-theme-vertical-bars'));
    await expect(page.locator('ion-tab-bar')).not.toHaveAttribute('data-native-rail-geometry');
    if (invalidation === 'mode') {
      await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
      await page.setViewportSize({ width: 800, height: 900 });
    }
    await expect.poll(async () => (await clone.boundingBox())?.y).toBe(220);
    await page.locator('ion-alert').evaluate((overlay: HTMLIonAlertElement) => overlay.dismiss());
    await expect(back).toHaveAttribute('data-native-ui-vertical-bars', '');
    await expect(clone).toHaveCount(0);
  });

for (const partial of [false, true])
  test(`Vertical tab geometry survives ${partial ? 'partial' : 'full'} handoff until its fade completes`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await mockNative(page);
    await page.goto('/main/index/alert');
    await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    const bar = page.locator('ion-tab-bar');
    await expect(bar).toHaveAttribute('data-native-ui-vertical-bars', '');
    await expect(bar).not.toHaveAttribute('data-native-ui-fading');
    await page.evaluate(() => {
      const mock = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
      const tabs = mock.updates.at(-1)!.controls.find((control) => control.kind === 'tab-bar')!;
      mock.geometry = {
        __tabBar: { x: 628, y: 600, width: 48, height: 220 },
        ...Object.fromEntries(tabs.items.map((item, index) => [item.id, { x: 632, y: 604 + index * 50, width: 40, height: 50 }])),
      };
    });
    if (partial) await bar.evaluate((el) => el.setAttribute('data-native-ui', 'disabled'));
    else await page.getByText('present:button-only', { exact: true }).click();
    await expect(bar).not.toHaveAttribute('data-native-ui-vertical-bars');
    await expect(bar).not.toHaveAttribute('data-native-ui-fading');
    await expect.poll(() => bar.boundingBox()).toEqual({ x: 628, y: 600, width: 48, height: 220 });
    if (partial) await expect(page.locator('app-alert ion-back-button')).toHaveAttribute('data-native-ui-vertical-bars', '');
    await bar.evaluate((el) => {
      const animate = el.animate.bind(el);
      el.animate = (frames, options) => {
        const animation = animate(frames, options);
        animation.pause();
        animation.currentTime = 90;
        return animation;
      };
    });
    if (partial) await bar.evaluate((el) => el.removeAttribute('data-native-ui'));
    else await page.locator('ion-alert').evaluate((el: HTMLIonAlertElement) => el.dismiss());
    await expect(bar).toHaveAttribute('data-native-ui-vertical-bars', '');
    await expect(bar).toHaveAttribute('data-native-ui-fading', '');
    expect(await bar.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeCloseTo(0.5, 1);
    await expect.poll(() => bar.boundingBox()).toEqual({ x: 628, y: 600, width: 48, height: 220 });
    await bar.evaluate((el) => el.getAnimations().forEach((animation) => animation.finish()));
    await expect(bar).not.toHaveAttribute('data-native-rail-geometry');
  });

test('Vertical Bars picker keeps input but cannot override a Web alert', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await mockNative(page);
  await page.goto('/main/index/alert');
  await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
  const back = page.locator('ion-back-button:not(.ion-cloned-element)').first();
  await expect(back).toHaveAttribute('data-native-ui-vertical-bars', '');
  await page.evaluate(() => {
    const picker = document.createElement('ion-picker');
    picker.id = 'legacy-picker';
    document.querySelector('ion-app')!.append(picker);
    picker.dispatchEvent(new CustomEvent('ionPickerWillPresent', { bubbles: true }));
  });
  const label = await page.evaluate(
    () =>
      Capacitor.registerPlugin<NativeUIMock>('NativeUI')
        .updates.at(-1)!
        .controls.find((control) => control.kind === 'back-button')!.items[0].accessibilityLabel!,
  );
  await back.evaluate((element) =>
    element.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        element.setAttribute('data-activated', 'true');
      },
      true,
    ),
  );
  await activate(page, label);
  await expect(back).toHaveAttribute('data-activated', 'true');
  await page.getByText('present:button-only', { exact: true }).click();
  await expect(back).not.toHaveAttribute('data-native-ui-vertical-bars');
  await page.locator('#legacy-picker').evaluate((picker) => {
    picker.dispatchEvent(new CustomEvent('ionPickerDidDismiss', { bubbles: true }));
    picker.remove();
  });
  await expect(page.locator('ion-alert')).toBeVisible();
  await expect(back).not.toHaveAttribute('data-native-ui-vertical-bars');
  await page.locator('ion-alert').evaluate((overlay: HTMLIonAlertElement) => overlay.dismiss());
  await expect(back).toHaveAttribute('data-native-ui-vertical-bars', '');
});

for (const context of ['inherited native styles', 'sibling-dependent Web fallback', 'container Web fallback']) {
  test(`Vertical Bars popover style context (${context})`, async ({ page }) => {
    const dependent = context !== 'inherited native styles';
    await page.setViewportSize({ width: 700, height: 900 });
    await mockNative(page);
    await page.goto('/main/index/popover');
    await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    await expect(page.locator('#native-popover-trigger')).toHaveAttribute('data-native-ui-vertical-bars-member', '');
    await page.addStyleTag({
      content:
        context === 'container Web fallback'
          ? 'ion-app { container-type: inline-size; } ion-app ion-popover p { color: rgb(180, 20, 60); font-size: 19px; }'
          : dependent
            ? 'ion-app:has(ion-router-outlet) ion-popover p { color: rgb(180, 20, 60); font-size: 19px; }'
            : 'ion-app { --review-text: rgb(180, 20, 60); } ion-app ion-popover p { color: var(--review-text); font-size: 19px; }',
    });
    await page.evaluate(() =>
      Object.assign(Capacitor.registerPlugin('NativeUI'), {
        async prepareOverlay() {},
        async presentOverlay() {},
        async dismissOverlay() {},
      }),
    );
    const opened = page.waitForEvent('popup');
    await activate(page, 'Open popover');
    const relay = await opened;
    if (dependent) {
      await expect.poll(() => relay.isClosed()).toBe(true);
      await expect(page.getByText('Toolbar popover', { exact: true })).toHaveCSS('color', 'rgb(180, 20, 60)');
      await expectWebPopoverPainted(page);
      await expect(page.locator('#native-popover-trigger')).not.toHaveAttribute('data-native-ui-vertical-bars-member');
      await expect(page.locator('.ios-theme-vertical-bars-back-button-projection')).toBeVisible();
      await page.getByRole('button', { name: 'Increment', exact: true }).click();
      await expect(page.getByText('Count: 1', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Close popover', exact: true }).click();
    } else {
      await expect(relay.getByText('Toolbar popover', { exact: true })).toHaveCSS('color', 'rgb(180, 20, 60)');
      await relay.getByRole('button', { name: 'Increment', exact: true }).click();
      await expect(relay.getByText('Count: 1', { exact: true })).toBeVisible();
      await page.addStyleTag({ content: 'ion-app ion-popover p { color: rgb(20, 40, 180); }' });
      await expect.poll(() => relay.isClosed()).toBe(true);
      await expect(page.getByText('Count: 1', { exact: true })).toBeVisible();
      await expect(page.getByText('Toolbar popover', { exact: true })).toHaveCSS('color', 'rgb(20, 40, 180)');
      await expectWebPopoverPainted(page);
      await expect(page.locator('#native-popover-trigger')).not.toHaveAttribute('data-native-ui-vertical-bars-member');
      await expect(page.locator('.ios-theme-vertical-bars-back-button-projection')).toBeVisible();
      await page.getByRole('button', { name: 'Close popover', exact: true }).click();
    }
    await expect(page.locator('#native-popover-trigger')).toHaveAttribute('data-native-ui-vertical-bars-member', '');
  });
}

test('rail enable and disable preserve the active shell', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index?verticalBarsOnly');
  const app = page.locator('ion-app');
  await app.evaluate((element) => element.classList.add('ios-theme-vertical-bars'));
  await expect
    .poll(() =>
      page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)
          ?.controls.some((c) => c.placement === 'vertical-bars'),
      ),
    )
    .toBe(true);
  await app.evaluate(async (element: TestAppElement) => {
    await element.nativeUI!.disableVerticalControlArea();
  });
  await expect.poll(() => page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)?.controls.length)).toBe(0);
  await expect(app.locator('[data-native-ui-projected]')).toHaveCount(0);
  await expect(app.locator('.native-ui-prehidden')).toHaveCount(0);
  await app.evaluate(async (element: TestAppElement) => {
    await element.nativeUI!.enableVerticalControlArea();
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)
          ?.controls.some((c) => c.placement === 'vertical-bars'),
      ),
    )
    .toBe(true);
});

test('native rail toggles and teardown preserve application-owned layout', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  const app = page.locator('ion-app');
  await app.evaluate((element) => {
    element.classList.add('ios-theme-vertical-bars');
    (element as HTMLElement).style.setProperty('--ios-theme-vertical-bars-native-inset', '72px');
  });
  const layout = () =>
    app.evaluate((element) => ({
      vertical: element.classList.contains('ios-theme-vertical-bars'),
      inset: (element as HTMLElement).style.getPropertyValue('--ios-theme-vertical-bars-native-inset'),
    }));
  const expected = { vertical: true, inset: '72px' };
  await expect.poll(() => app.evaluate((element) => !!(element as TestAppElement).nativeUI)).toBe(true);
  await app.evaluate(async (element) => (element as TestAppElement).nativeUI!.disableVerticalControlArea());
  expect(await layout()).toEqual(expected);
  await app.evaluate(async (element) => (element as TestAppElement).nativeUI!.enableVerticalControlArea());
  expect(await layout()).toEqual(expected);
  await app.evaluate(async (element) => (element as TestAppElement).nativeUI!.destroy());
  expect(await layout()).toEqual(expected);
});

for (const target of ['native-ui', 'Native UI Extension', 'button-projection', 'accordion']) {
  test(`Menu and Back retain the leading native slot through navigation: ${target}`, async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await mockNative(page, false, null);
    await page.addInitScript(() => {
      document.addEventListener('ionViewDidEnter', (event) => (event.target as HTMLElement).setAttribute('data-test-did-enter', ''), true);
    });
    await page.goto('/main/index');
    await expect(page.locator('index-page')).toHaveAttribute('data-test-did-enter', '');
    const menu = page.locator('index-page ion-buttons[slot=start]');
    await expect(menu).toHaveAttribute('data-native-ui-projected', '');
    const before = await page.evaluate(() => {
      const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
      const control = state.updates.at(-1)!.controls.find((control) => control.kind === 'menu-button')!;
      return { index: state.updates.length, identity: control.items[0].transitionId, id: control.items[0].id };
    });
    await page.evaluate(() => {
      const evidence = { frames: 0, webCopies: 0, active: true };
      Object.assign(window, { toolbarEvidence: evidence });
      const sample = () => {
        const back = Array.from(document.querySelectorAll<HTMLElement>('ion-back-button:not(.ion-cloned-element)')).find(
          (element) => !element.closest('.ion-page-hidden, .ion-page-invisible'),
        );
        if (back && !back.closest('.ion-page')?.hasAttribute('data-test-did-enter')) {
          evidence.frames++;
          const copies = [
            back,
            ...document.querySelectorAll<HTMLElement>('ion-router-outlet > ion-back-button.ion-cloned-element'),
            ...document.querySelectorAll<HTMLElement>('app-native-ui ion-header ion-button[aria-label=Save]'),
          ];
          if (
            copies.some((element) => {
              for (let current: HTMLElement | null = element; current; current = current.parentElement) {
                const style = getComputedStyle(current);
                if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) <= 0.01) return false;
              }
              return true;
            })
          )
            evidence.webCopies++;
        }
        if (evidence.active) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.getByText(target, { exact: true }).click();
    const back = page.locator('.ion-page:not(.ion-page-hidden) ion-back-button:not(.ion-cloned-element)').last();
    await expect.poll(() => back.evaluate((element) => element.closest('.ion-page')?.hasAttribute('data-test-did-enter'))).toBe(true);
    await expect(back).toHaveAttribute('data-native-ui-projected', '');
    const after = await page.evaluate(({ index, identity }) => {
      const state = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
      const changes = state.updates.slice(index);
      const control = changes.at(-1)!.controls.find((control) => control.kind === 'back-button')!;
      return {
        identity: control.items[0].transitionId,
        id: control.items[0].id,
        gaps: changes.filter(
          (snapshot) => !snapshot.controls.some((control) => control.items.some((item) => item.transitionId === identity)),
        ).length,
        label: control.items[0].accessibilityLabel,
      };
    }, before);
    if (target === 'native-ui') {
      const right = await page.evaluate((index) => {
        const snapshots = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.slice(index);
        for (const snapshot of snapshots) {
          const save = snapshot.toolbarTransition?.destination.find((control) =>
            control.items.some((item) => item.accessibilityLabel === 'Save'),
          );
          if (save)
            return {
              target: save,
              source: snapshot.controls.find((control) => control.transitionId === save.transitionId),
              cancel: snapshot.toolbarTransition!.destination.find((control) => control.items.some((item) => item.label === 'Cancel')),
            };
        }
        return null;
      }, before.index);
      expect(right).not.toBeNull();
      expect(right!.source!.kind).toBe('button-group');
      expect(right!.target.kind).toBe('button');
      expect(right!.target.items[0].accessibilityLabel).toBe('Save');
      expect(right!.cancel).toBeDefined();
      expect(right!.cancel!.transitionId).not.toBe(right!.source!.transitionId);
    }
    expect(after.identity).toBe(before.identity);
    expect(after.id).not.toBe(before.id);
    expect(after.gaps).toBe(0);
    const evidence = await page.evaluate(() => {
      const evidence = (window as Window & { toolbarEvidence: { frames: number; webCopies: number; active: boolean } }).toolbarEvidence;
      evidence.active = false;
      return evidence;
    });
    expect(evidence.frames).toBeGreaterThan(0);
    expect(evidence.webCopies).toBe(0);
    await activate(page, after.label!);
    await expect(menu).toHaveAttribute('data-native-ui-projected', '');
    await expect(page).toHaveURL(/\/main\/index$/);
  });
}

test('toolbar follows paused page percentages and reverses before navigation completes', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page, false, null);
  await page.addInitScript(() => {
    document.addEventListener('ionViewDidEnter', (event) => (event.target as HTMLElement).setAttribute('data-test-did-enter', ''), true);
  });
  await page.goto('/main/index');
  await expect(page.locator('index-page')).toHaveAttribute('data-test-did-enter', '');
  await expect(page.locator('index-page ion-buttons[slot=start]')).toHaveAttribute('data-native-ui-projected', '');
  const sourceGroup = page.locator('index-page ion-header:not([collapse]) ion-buttons[slot=end]');
  await expect(sourceGroup).toHaveAttribute('data-native-ui-projected', '');
  const sourceGroupId = await page.evaluate(
    () =>
      Capacitor.registerPlugin<NativeUIMock>('NativeUI')
        .updates.at(-1)!
        .controls.find((control) => control.kind === 'button-group' && control.items.some((item) => item.accessibilityLabel === 'GitHub'))!
        .id,
  );
  await page.getByText('native-ui', { exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)?.toolbarTransition?.id))
    .toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document
            .getAnimations()
            .some((animation) => animation.playState === 'running' && Number(animation.effect?.getTiming().duration) > 0),
        ),
      { intervals: [10, 20, 50] },
    )
    .toBe(true);
  for (const percentage of [0, 0.2, 0.4, 0.6, 0.8, 0.4, 0.2]) {
    const expected = await page.evaluate((percentage) => {
      const animations = document.getAnimations().filter((animation) => Number(animation.effect?.getTiming().duration) > 0);
      animations.forEach((animation) => {
        animation.pause();
        animation.currentTime = Number(animation.effect!.getTiming().duration) * percentage;
      });
      return animations[0].effect!.getComputedTiming().progress!;
    }, percentage);
    await expect
      .poll(() => page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').toolbarProgress.at(-1)?.progress))
      .toBeCloseTo(expected, 3);
    const prepared = await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!.toolbarTransition);
    expect(prepared?.destination.some((control) => control.kind === 'back-button')).toBe(true);
    // end[0] remains native as group -> Save; Cancel occupies the new end[1].
    expect(prepared?.sourceIds).toContain(sourceGroupId);
    await expect(sourceGroup).toHaveAttribute('data-native-ui-projected', '');
    await expect(sourceGroup).not.toHaveAttribute('data-native-ui-navigation-source');
    if (percentage > 0) expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(1);
  }
  await page.evaluate(() => document.getAnimations().forEach((animation) => animation.play()));
  await expect(page.locator('app-native-ui ion-back-button')).toHaveAttribute('data-native-ui-projected', '');
  await expect
    .poll(() => page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!.toolbarTransition))
    .toBeUndefined();
});

test('implicit clear toolbar buttons share glass without duplicate native children', async ({ page }) => {
  await mockNative(page, false, null);
  await page.goto('/main/index');
  const group = page.locator('index-page ion-header:not([collapse]) ion-buttons[slot=end]');
  await expect(group).toHaveAttribute('data-native-ui-projected', '');
  await expect(group.locator('[data-native-ui-projected]')).toHaveCount(0);
  expect(
    await group.locator('ion-button').evaluateAll((buttons) => buttons.map((button) => (button as HTMLIonButtonElement).fill)),
  ).toEqual([undefined, undefined]);
  const controls = await page.evaluate(() =>
    Capacitor.registerPlugin<NativeUIMock>('NativeUI')
      .updates.at(-1)!
      .controls.filter((control) =>
        control.items.some((item) => item.accessibilityLabel === 'GitHub' || item.accessibilityLabel === 'Ionic'),
      ),
  );
  expect(controls).toHaveLength(1);
  expect(controls[0].kind).toBe('button-group');
  expect(controls[0].items.map((item) => item.accessibilityLabel)).toEqual(['GitHub', 'Ionic']);
});

test('clear Cancel keeps its clear presentation beside a glass Save button', async ({ page }) => {
  await mockNative(page, false, null);
  await page.goto('/main/index/native-ui');
  await expect(page.locator('app-native-ui ion-button').filter({ hasText: 'Cancel' })).toHaveAttribute('data-native-ui-projected', '');
  const items = await page.evaluate(() =>
    Capacitor.registerPlugin<NativeUIMock>('NativeUI')
      .updates.at(-1)!
      .controls.flatMap((control) => control.items),
  );
  expect(items.find((item) => item.label === 'Cancel')?.buttonFill).toBe('clear');
  expect(items.find((item) => item.accessibilityLabel === 'Save')?.buttonFill).toBeUndefined();
});

test('mini player does not shorten the page and outgoing translucent toolbar fades during navigation', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page, false, null);
  await page.addInitScript(() =>
    document.addEventListener('ionViewDidEnter', (event) => (event.target as HTMLElement).setAttribute('data-test-did-enter', ''), true),
  );
  await page.goto('/main/index');
  await expect(page.locator('index-page')).toHaveAttribute('data-test-did-enter', '');
  await page.getByText('Native UI Extension', { exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)?.toolbarTransition?.id))
    .toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document
            .getAnimations()
            .some((animation) => animation.playState === 'running' && Number(animation.effect?.getTiming().duration) > 0),
        ),
      { intervals: [10, 20, 50] },
    )
    .toBe(true);
  for (const percentage of [0.1, 0.2, 0.4, 0.6, 0.8, 0.4, 0.2, 0]) {
    await page.evaluate(
      (percentage) =>
        document.getAnimations().forEach((animation) => {
          animation.pause();
          animation.currentTime = Number(animation.effect!.getTiming().duration) * percentage;
        }),
      percentage,
    );
    const geometry = await page.evaluate(() => {
      const page = document.querySelector('index-page')!;
      const buttons = page.querySelector('ion-header:not([collapse]) ion-buttons[slot=end]')!;
      return {
        bottom: page.getBoundingClientRect().bottom,
        viewport: innerHeight,
        opacity: Number(getComputedStyle(buttons).opacity),
        backing: getComputedStyle(page.parentElement!).backgroundColor,
      };
    });
    expect(geometry.bottom).toBeGreaterThanOrEqual(geometry.viewport - 1);
    expect(geometry.backing).not.toBe('rgba(0, 0, 0, 0)');
    if (percentage === 0) expect(geometry.opacity).toBe(1);
    else expect(geometry.opacity).toBeLessThan(0.9);
    if (percentage >= 0.2) expect(geometry.opacity).toBe(0);
    await expect(page.locator('index-page ion-header:not([collapse]) ion-buttons[slot=end]')).toHaveAttribute(
      'data-native-ui-projected',
      '',
    );
  }
  await page.evaluate(() => document.getAnimations().forEach((animation) => animation.play()));
  await expect(page.locator('app-native-ui-extension-page')).toHaveAttribute('data-test-did-enter', '');
  expect(await page.locator('index-page').evaluate((page) => (page.parentElement as HTMLElement).style.backgroundColor)).toBe('');
});

test('a shared toolbar background shrinks to one button and expands on return without Web handoff', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page, false, null);
  await page.addInitScript(() =>
    document.addEventListener(
      'ionViewWillEnter',
      (event) => {
        const entering = event.target as HTMLElement;
        if (entering.tagName.toLowerCase() === 'app-native-ui') {
          Array.from(entering.querySelectorAll('ion-toolbar ion-buttons[slot=end] ion-button'))
            .find((button) => button.textContent?.trim() === 'Cancel')
            ?.remove();
        }
      },
      true,
    ),
  );
  await page.goto('/main/index');
  await expect(page.locator('index-page ion-buttons[slot=end]')).toHaveAttribute('data-native-ui-projected', '');
  await page.getByText('native-ui', { exact: true }).click();
  await expect(page.locator('app-native-ui ion-toolbar ion-button').filter({ hasText: 'Save' })).toHaveAttribute(
    'data-native-ui-projected',
    '',
  );
  const push = await page.evaluate(() =>
    Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.find((snapshot) =>
      snapshot.toolbarTransition?.destination.some((control) => control.items.some((item) => item.accessibilityLabel === 'Save')),
    ),
  );
  expect(push).toBeDefined();
  const destination = push!.toolbarTransition!.destination.find((control) =>
    control.items.some((item) => item.accessibilityLabel === 'Save'),
  )!;
  const source = push!.controls.find((control) => control.transitionId === destination.transitionId)!;
  expect(source.kind).toBe('button-group');
  expect(source.items).toHaveLength(2);
  expect(destination.kind).toBe('button');
  expect(destination.items).toHaveLength(1);
  await activate(page, 'Save');
  await expect(page.getByText('Save count: 1', { exact: true })).toBeVisible();
  const index = await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.length);
  await activate(page, 'back');
  await expect(page).toHaveURL(/\/main\/index$/);
  await expect(page.locator('index-page ion-buttons[slot=end]')).toHaveAttribute('data-native-ui-projected', '');
  const pop = await page.evaluate(
    (index) =>
      Capacitor.registerPlugin<NativeUIMock>('NativeUI')
        .updates.slice(index)
        .find((snapshot) => snapshot.toolbarTransition?.destination.some((control) => control.kind === 'button-group')),
    index,
  );
  expect(pop).toBeDefined();
  const group = pop!.toolbarTransition!.destination.find((control) => control.kind === 'button-group')!;
  expect(pop!.controls.find((control) => control.transitionId === group.transitionId)!.kind).toBe('button');
  expect(group.items).toHaveLength(2);
});

test('vertical group resizing preserves the following surface and its action identity', async ({ page }) => {
  await page.setViewportSize({ width: 466, height: 678 });
  await mockNative(page);
  await page.goto('/main/index');
  await page.locator('index-page > ion-header ion-buttons[slot=end]').evaluate((group) => {
    const next = document.createElement('ion-buttons');
    next.slot = 'end';
    next.id = 'following-group';
    next.innerHTML = '<ion-button><ion-icon name="heart" slot="icon-only" aria-label="Following"></ion-icon></ion-button>';
    const button = next.querySelector('ion-button')!;
    button.removeAttribute('href');
    button.setAttribute('aria-label', 'Following');
    button.addEventListener('click', () => next.setAttribute('data-clicked', 'true'));
    group.after(next);
  });
  await page.getByText('iPhone Duo Mode', { exact: true }).click();
  const read = () =>
    page.evaluate(() => {
      const controls = Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.at(-1)!.controls;
      const next = controls.find((control) => control.items.some((item) => item.accessibilityLabel === 'Following'))!;
      const first = controls.find((control) => control.items.some((item) => item.accessibilityLabel === 'GitHub'))!;
      return { surface: next?.transitionId, child: next?.items[0].transitionId, count: first?.items.length, placement: next?.placement };
    });
  await expect
    .poll(() =>
      page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)
          ?.controls.some(
            (control) => control.placement === 'vertical-bars' && control.items.some((item) => item.accessibilityLabel === 'Following'),
          ),
      ),
    )
    .toBe(true);
  const before = await read();
  expect(before.placement).toBe('vertical-bars');
  expect(before.count).toBe(2);
  await page
    .locator('index-page > ion-header ion-buttons[slot=end]')
    .first()
    .locator('ion-button')
    .last()
    .evaluate((button) => button.remove());
  await expect.poll(async () => (await read()).count).toBe(1);
  const after = await read();
  expect(after.surface).toBe(before.surface);
  expect(after.child).toBe(before.child);
  await activate(page, 'Following');
  await expect(page.locator('#following-group')).toHaveAttribute('data-clicked', 'true');
});

for (const vertical of [false, true]) {
  test(`${vertical ? 'Vertical Bars' : 'Horizontal'} tabs use the applied selection color across overrides and dark mode`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vertical ? 700 : 402, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await mockNative(page, false, vertical ? 'trailing' : null);
    await page.goto('/main/index');
    if (vertical) await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
    await page.addStyleTag({
      content: `ion-tab-bar {
    --ion-color-primary: #800080; --ion-color-primary-rgb: 1, 2, 3;
    --ion-tab-bar-color-selected: var(--ion-color-primary);
  }`,
    });
    const tint = () =>
      page.evaluate(
        () =>
          Capacitor.registerPlugin<NativeUIMock>('NativeUI')
            .updates.at(-1)
            ?.controls.find((control) => control.kind === 'tab-bar')?.tabTint,
      );
    await expect.poll(tint).toBe('rgb(128, 0, 128)');
    await page.addStyleTag({
      content: `ion-tab-bar { --color-selected: orange; }
    ion-tab-button[tab="docs"] { color-scheme: light dark; --color-selected: light-dark(blue, yellow); }`,
    });
    await expect.poll(tint).toBe('rgb(255, 165, 0)');
    await activate(page, 'Docs');
    await expect(page).toHaveURL('/main/docs');
    await expect.poll(tint).toBe('rgb(0, 0, 255)');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(tint).toBe('rgb(255, 255, 0)');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(tint).toBe('rgb(0, 0, 255)');
    await page.locator('ion-tab-button[tab="docs"]').evaluate((tab) => {
      tab.style.setProperty('--color-selected', 'currentColor');
    });
    await page.locator('ion-tab-bar').evaluate((bar) => {
      bar.style.color = 'rgb(200, 0, 0)';
    });
    await expect.poll(tint).toBe('rgb(200, 0, 0)');
    await activate(page, 'Index');
    await expect(page).toHaveURL('/main/index');
    await expect.poll(tint).toBe('rgb(255, 165, 0)');
    await page.locator('ion-tab-bar').evaluate((bar) => bar.style.setProperty('--color-selected', 'rgba(120, 40, 80, 0.8)'));
    await expect.poll(tint).toBe('rgba(120, 40, 80, 0.8)');
    await page.locator('ion-tab-bar').evaluate((bar: HTMLIonTabBarElement) => {
      bar.color = 'primary';
    });
    await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-projected', '');
    await expect.poll(tint).toBeUndefined();
    await page.locator('ion-tab-bar').evaluate((bar: HTMLIonTabBarElement) => {
      bar.color = undefined;
    });
    await expect.poll(tint).toBe('rgba(120, 40, 80, 0.8)');
  });
}

test('horizontal tabs retain measured native width on Web handoff without feeding it back', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page, false, null);
  // Keep this iOS 27 regression on the same theme in older test WebKit builds.
  await page.route('**/styles.css', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replaceAll('overflow-anchor: auto', 'display: block') });
  });
  await page.goto('/main/index');
  const bar = page.locator('#tab-bar-bottom');
  await expect(bar).toHaveAttribute('data-native-ui-projected', '');
  const original = (await bar.boundingBox())!.width;
  await page.evaluate(() => {
    const mock = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
    const update = mock.update.bind(mock);
    mock.update = async (snapshot) => ({
      ...(await update(snapshot)),
      tabBarWidths: Object.fromEntries(
        snapshot.controls.filter((control) => control.kind === 'tab-bar').map((control) => [control.id, 274]),
      ),
    });
    document.querySelector('#tab-bar-bottom ion-label')!.textContent = 'Home';
  });
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeCloseTo(274, 0);
  await page.evaluate(async () => {
    const app = document.querySelector('ion-app') as TestAppElement;
    app.verticalBarsLease = await app.nativeUI!.suspend();
  });
  await expect(bar).not.toHaveAttribute('data-native-ui-projected');
  expect((await bar.boundingBox())!.width).toBeCloseTo(274, 0);
  // A normal Web press updates gesture classes and an inline scale variable.
  // Those decorations must not discard the native resting width.
  await bar.locator('ion-tab-button').first().click();
  await page.waitForTimeout(600);
  expect((await bar.boundingBox())!.width).toBeCloseTo(274, 0);
  await page.evaluate(async () => {
    const app = document.querySelector('ion-app') as TestAppElement;
    // Native projection deliberately leaves a focused Web control accessible.
    (document.activeElement as HTMLElement | null)?.blur();
    await app.verticalBarsLease!.resume();
  });
  await expect(bar).toHaveAttribute('data-native-ui-projected', '');
  expect((await bar.boundingBox())!.width).toBeCloseTo(274, 0);
  const requestWidth = () =>
    page.evaluate(
      () =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.findLast((snapshot) => snapshot.controls.some((control) => control.kind === 'tab-bar'))!
          .controls.find((control) => control.kind === 'tab-bar')!.width,
    );
  await expect.poll(requestWidth).toBeCloseTo(original, 0);
  // An ancestor CSS change can change padding while native reports the same width.
  await page.addStyleTag({ content: 'html.width-padding #tab-bar-bottom { padding-inline: 8px !important; }' });
  await page.locator('html').evaluate((html) => html.classList.add('width-padding'));
  await expect(bar).toHaveCSS('padding-left', '8px');
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeCloseTo(274, 0);
  await page.locator('html').evaluate((html) => html.classList.remove('width-padding'));
  await expect.poll(requestWidth).toBeCloseTo(original, 0);
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeCloseTo(274, 0);
  // A phone measurement must not constrain the vertical rail, and returning to
  // the phone must measure source CSS before applying the native width again.
  await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
  await expect(bar).not.toHaveAttribute('data-native-tab-width');
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeCloseTo(48, 0);
  await page.locator('ion-app').evaluate((app) => app.classList.remove('ios-theme-vertical-bars'));
  await expect.poll(requestWidth).toBeCloseTo(original, 0);
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeCloseTo(274, 0);
  const updates = await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.length);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => Capacitor.registerPlugin<NativeUIMock>('NativeUI').updates.length)).toBe(updates);
  await page.setViewportSize({ width: 440, height: 874 });
  await expect.poll(requestWidth).toBeCloseTo(337, 0);
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeCloseTo(274, 0);
  await page.evaluate(async () => (document.querySelector('ion-app') as TestAppElement).nativeUI!.destroy());
  await expect(bar).not.toHaveAttribute('data-native-tab-width');
  expect((await bar.boundingBox())!.width).toBeCloseTo(337, 0);
});

test('Duo tab handoff recovers from one update failure without replaying the tab click', async ({ page }) => {
  await mockNative(page);
  await page.goto('/main/index/native-ui');
  await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
  const segment = page.locator('app-native-ui ion-segment').first();
  await expect(segment).toHaveAttribute('data-native-ui-projected', '');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Capacitor.registerPlugin<NativeUIMock>('NativeUI')
          .updates.at(-1)
          ?.controls.some((control) => control.kind === 'tab-bar' && control.placement === 'vertical-bars'),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    const plugin = Capacitor.registerPlugin<NativeUIMock>('NativeUI');
    const update = plugin.update.bind(plugin);
    plugin.update = async () => {
      plugin.update = update;
      throw new Error('Temporary update failure');
    };
    const tab = document.querySelector('ion-tab-button[tab="album"]')!;
    tab.setAttribute('data-activations', '0');
    tab.addEventListener('click', () => tab.setAttribute('data-activations', String(Number(tab.getAttribute('data-activations')) + 1)));
  });
  await activate(page, 'Library', true);
  await expect(page).toHaveURL(/\/main\/album/);
  await expect(page.locator('ion-tab-button[tab="album"]')).toHaveAttribute('data-activations', '1');
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).nativeUI!.getStatus().state))
    .toBe('native');
  expect(await page.evaluate(() => (document.querySelector('ion-app') as TestAppElement).nativeUI!.getStatus().reason)).toBeUndefined();
  await activate(page, 'Index');
  await expect(segment).toHaveAttribute('data-native-ui-projected', '');
});
