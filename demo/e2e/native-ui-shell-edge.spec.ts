import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import type { NativeUIShellComponent, ShellControl, ShellItem, ShellSnapshot } from '../../src/native/definitions';
import type { ShellMockCore } from './native-shell-mock';

interface GeometryEvidence {
  id: string;
  frame: number;
  visibleFrame: number;
  backReleases: number;
  retirements: { frame: number; visibleFrame: number; visible: boolean; backProjected: boolean }[];
}

interface ShellMock extends ShellMockCore {
  rejectKind?: NativeUIShellComponent;
  /** Controls UIKit would still show; a rejected kind is omitted like the real host. */
  rendered: Map<string, ShellControl>;
  holdAcknowledgement: boolean;
  /** Resolves the held update() acknowledgement. */
  acknowledge?: () => void;
  onUpdate?: (snapshot: { controls: ShellControl[] }) => void;
  evidence?: GeometryEvidence;
}

const mockNative = async (page: Page) => {
  await page.addInitScript(() => {
    const mock = {
      updates: [] as ShellSnapshot[],
      sequence: 0,
      rejectKind: undefined as NativeUIShellComponent | undefined,
      rendered: new Map<string, ShellControl>(),
      holdAcknowledgement: false,
      acknowledge: undefined as (() => void) | undefined,
      onUpdate: undefined as ((snapshot: { controls: ShellControl[] }) => void) | undefined,
      evidence: undefined as GeometryEvidence | undefined,
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
      async configure() {
        return { supported: true };
      },
      async getWebViewMetrics() {
        return { radius: 0 };
      },
      async getDeviceLayout() {
        return {
          placement: { edge: 'right' as const, inset: 84 },
          hingeStatus: 'unavailable' as const,
          webViewMetrics: { radius: 0 },
        };
      },
      async startDeviceLayoutMonitoring() {},
      async stopDeviceLayoutMonitoring() {},
      async update(options: ShellSnapshot) {
        this.updates.push(options);
        return this.settle(options);
      },
      async clear(options: { revision: number }) {
        this.updates.push({ revision: options.revision, viewportWidth: 0, controls: [] });
        return this.settle({ ...options, controls: [] });
      },
      async settle(options: { revision?: number; controls: ShellControl[] }) {
        const controls = options.controls;
        const rejectedControls = controls.filter((control) => control.kind === this.rejectKind).map((control) => control.id);
        const ids = new Set(controls.map((control) => control.id));
        for (const id of this.rendered.keys()) if (!ids.has(id)) this.rendered.delete(id);
        for (const control of controls) {
          // UIKit retains an existing cover until a later snapshot retires its id.
          if (control.kind !== this.rejectKind) this.rendered.set(control.id, control);
        }
        this.onUpdate?.({ ...options, controls });
        if (this.holdAcknowledgement) await new Promise<void>((resolve) => (this.acknowledge = resolve));
        return { revision: options.revision, rejectedControls };
      },
    };

    window.CapacitorCustomPlatform = { name: 'ios' };
    // Substitute the mock as the plugin implementation when @capacitor/core
    // initialises its global, before the app registers 'IonicNativeUIShell'.
    let capacitor: { registerPlugin: (name: string, implementations?: Record<string, unknown>) => unknown } | undefined;
    Object.defineProperty(window, 'Capacitor', {
      configurable: true,
      get: () => capacitor,
      set: (instance) => {
        const registerPlugin = instance.registerPlugin;
        instance.registerPlugin = (name: string, implementations?: Record<string, unknown>) =>
          name === 'IonicNativeUIShell' ? mock : registerPlugin(name, implementations);
        capacitor = instance;
      },
    });
  });
};

const latestControl = (page: Page, kind: string) =>
  page.evaluate(
    (kind) =>
      Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell')
        .updates.at(-1)
        ?.controls.find((c: ShellControl) => c.kind === kind),
    kind,
  );

const activate = (page: Page, kind: string, label?: string, count = 1) =>
  page.evaluate(
    ({ kind, label, count }) => {
      const state = Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell');
      const snapshot = state.updates.at(-1)!;
      const item = label
        ? snapshot.controls
            .filter((c: ShellControl) => c.kind === kind)
            .flatMap((c: ShellControl) => c.items)
            .find((i) => i.label === label)
        : snapshot.controls.find((c: ShellControl) => c.kind === kind)!.items[0];
      for (let index = 0; index < count; index++) {
        state.notifyListeners('activate', { id: item!.id, revision: snapshot.revision, sequence: ++state.sequence });
      }
    },
    { kind, label, count },
  );

const tabState = (page: Page) =>
  page.locator('ion-tab-bar').evaluate((bar) => ({
    frame: bar.getBoundingClientRect().toJSON(),
    role: bar.getAttribute('role'),
    items: Array.from(bar.querySelectorAll<HTMLIonTabButtonElement>('ion-tab-button:not(.ion-cloned-element)')).map((button) => ({
      label: button.querySelector('ion-label')?.textContent?.trim(),
      frame: button.getBoundingClientRect().toJSON(),
      selected: button.selected,
      disabled: button.disabled,
      role: button.shadowRoot?.querySelector('[part=native]')?.getAttribute('role'),
      ariaSelected: button.shadowRoot?.querySelector('[part=native]')?.getAttribute('aria-selected'),
      color: getComputedStyle(button.shadowRoot!.querySelector('[part=native]')!).color,
    })),
  }));

for (const direction of ['ltr', 'rtl']) {
  for (const position of ['start', 'center', 'end']) {
    test(`tab placement and selection match Web: ${direction} ${position}`, async ({ page, context }) => {
      test.setTimeout(60000);
      await page.setViewportSize({ width: 440, height: 956 });
      const web = await context.newPage();
      await web.setViewportSize({ width: 440, height: 956 });
      await mockNative(page);
      await Promise.all([page.goto('/main/index'), web.goto('/main/index')]);
      for (const slot of ['bottom', 'top']) {
        await Promise.all(
          [page, web].map((p) =>
            p.locator('ion-tab-bar').evaluate(
              (bar, state) => {
                document.documentElement.dir = state.direction;
                bar.classList.remove('tab-bar-position-start', 'tab-bar-position-center', 'tab-bar-position-end');
                bar.classList.add(`tab-bar-position-${state.position}`);
                bar.slot = state.slot;
              },
              { direction, position, slot },
            ),
          ),
        );
        await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-shell', '');
        const anchor = {
          x: position === 'center' ? 0.5 : (position === 'start') === (direction === 'ltr') ? 0 : 1,
          y: slot === 'bottom' ? 1 : 0,
        };
        await expect.poll(async () => (await latestControl(page, 'ion-tab-bar'))?.tabBarAnchor).toEqual(anchor);
        for (const label of ['Docs', 'Index']) {
          await activate(page, 'ion-tab-bar', label);
          await web.getByRole('tab', { name: label, exact: true }).click();
          await expect(page).toHaveURL(`/main/${label.toLowerCase()}`);
          await expect(web).toHaveURL(`/main/${label.toLowerCase()}`);
          await expect
            .poll(async () =>
              (await latestControl(page, 'ion-tab-bar'))?.items.filter((i: ShellItem) => i.selected).map((i: ShellItem) => i.label),
            )
            .toEqual([label]);
          // A real Web click runs the press animation; compare after both settle.
          await web.locator('ion-tab-bar').evaluate(async (bar) => {
            await Promise.all(bar.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
          });
          await expect.poll(async () => JSON.stringify(await tabState(page)) === JSON.stringify(await tabState(web))).toBe(true);
          const native = (await latestControl(page, 'ion-tab-bar'))!;
          const actual = await tabState(page);
          const reference = await tabState(web);
          expect(actual).toEqual(reference);
          for (const key of ['x', 'y', 'width', 'height'] as const) expect(native[key]).toBeCloseTo(reference.frame[key], 1);
          expect(native.rtl).toBe(direction === 'rtl');
          for (const [index, item] of native.items.entries()) {
            const dom = reference.items[index];
            expect(item.label).toBe(dom.label);
            expect(item.selected).toBe(dom.selected);
            expect(item.disabled).toBe(dom.disabled);
            expect(item.color).toBe(dom.color);
            expect(item.iconTemplate).toBe(true);
            expect(item.width).toBeCloseTo(dom.frame.width, 1);
            expect(item.x + native.x).toBeCloseTo(dom.frame.x, 1);
            expect(dom.role).toBe('tab');
            expect(dom.ariaSelected).toBe(item.selected ? 'true' : null);
          }
        }
      }
      await web.close();
    });
  }
}

for (const fixed of [false, true]) {
  test(`Push and repeated back match Web with ${fixed ? 'fixed native' : 'collapsing Web'} headers`, async ({ page, context }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 402, height: 874 });
    const web = await context.newPage();
    await web.setViewportSize({ width: 402, height: 874 });
    await mockNative(page);
    await Promise.all([page.goto('/main/index'), web.goto('/main/index')]);
    const backSelector = '.ion-page:not(.ion-page-hidden) > ion-header > ion-toolbar ion-back-button';
    const appearance = (p: Page) =>
      p.locator(backSelector).evaluate((button) => ({
        frame: button.getBoundingClientRect().toJSON(),
        label: button.shadowRoot?.querySelector('[part=text]')?.textContent?.trim() ?? '',
        icon: button.shadowRoot?.querySelector('ion-icon')?.getAttribute('icon'),
        accessibilityLabel: button.shadowRoot?.querySelector('[part=native]')?.getAttribute('aria-label'),
      }));
    const checkBack = async () => {
      await Promise.all([page, web].map((p) => expect(p.locator(backSelector)).toHaveCount(1)));
      if (fixed) {
        await Promise.all(
          [page, web].map((p) =>
            p.locator(backSelector).evaluate((button) => {
              const owner = button.closest('.ion-page')!;
              owner.querySelectorAll('ion-content ion-header[collapse=condense]').forEach((header) => header.remove());
              // Replace this sample's collapsing configuration with a fixed header fixture.
              const header = button.closest('ion-header')!;
              header.classList.remove('header-collapse-main', 'header-collapse-condense-inactive');
              header.style.removeProperty('--opacity-scale');
            }),
          ),
        );
        await expect(page.locator(backSelector)).toHaveAttribute('data-native-ui-shell', '');
      } else {
        await expect(page.locator(backSelector)).not.toHaveAttribute('data-native-ui-shell');
        await expect(page.locator(backSelector)).toBeVisible();
      }
      await expect.poll(async () => JSON.stringify(await appearance(page)) === JSON.stringify(await appearance(web))).toBe(true);
      if (fixed) {
        const control = (await latestControl(page, 'ion-back-button'))!;
        const original = await appearance(web);
        expect(control.items[0].label).toBe(original.label);
        expect(control.items[0].accessibilityLabel).toBe(original.accessibilityLabel);
        for (const key of ['x', 'y', 'width', 'height'] as const) expect(control[key]).toBeCloseTo(original.frame[key], 1);
      }
    };
    const clickBack = async (p: Page, count = 1) => {
      if (p === page && fixed) await activate(p, 'ion-back-button', undefined, count);
      else
        await p.locator(backSelector).evaluate((button: HTMLIonBackButtonElement, count) => {
          for (let i = 0; i < count; i++) button.click();
        }, count);
    };
    // With fixed native headers the toolbar button is projected, so tap it through the native activation path.
    const clickPush = (p: Page) =>
      p === page && fixed ? activate(p, 'ion-button', 'Push') : p.getByRole('button', { name: 'Push', exact: true }).click();
    for (let cycle = 0; cycle < 3; cycle++) {
      await Promise.all([page, web].map((p) => p.getByRole('button', { name: 'button', exact: true }).click()));
      await Promise.all([page, web].map((p) => expect(p).toHaveURL('/main/index/button')));
      await checkBack();
      await Promise.all([page, web].map((p) => clickPush(p)));
      await Promise.all([page, web].map((p) => expect(p).toHaveURL('/main/index/action-sheet')));
      await checkBack();
      await Promise.all([page, web].map((p) => clickBack(p, cycle === 2 ? 3 : 1)));
      await Promise.all(
        [page, web].map((p) => expect(p, `${p === page ? 'native' : 'Web'} back cycle ${cycle}`).toHaveURL('/main/index/button')),
      );
      await checkBack();
      await Promise.all([page, web].map((p) => clickBack(p)));
      await Promise.all([page, web].map((p) => expect(p).toHaveURL('/main/index')));
      await expect(page.locator('.ion-page-hidden [data-native-ui-shell]')).toHaveCount(0);
    }
    await web.close();
  });
}

test('RTL native back icon mirrors the Web chevron', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  await expect(page.locator('app-native-ui-shell ion-back-button')).toHaveAttribute('data-native-ui-shell', '');
  const ltr = (await latestControl(page, 'ion-back-button'))!.items[0].icon!;
  await page.evaluate(() => (document.documentElement.dir = 'rtl'));
  await expect.poll(async () => (await latestControl(page, 'ion-back-button'))?.rtl).toBe(true);
  const rtl = (await latestControl(page, 'ion-back-button'))!.items[0].icon!;
  expect(rtl).not.toBe(ltr);
  const error = await page.evaluate(
    async ({ ltr, rtl }) => {
      const pixels = async (source: string) => {
        const image = new Image();
        image.src = source.startsWith('data:') ? source : `data:image/png;base64,${source}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height);
      };
      const [left, right] = await Promise.all([pixels(ltr), pixels(rtl)]);
      let sum = 0;
      for (let y = 0; y < left.height; y++) {
        for (let x = 0; x < left.width; x++) {
          for (let channel = 0; channel < 4; channel++) {
            sum += Math.abs(
              left.data[(y * left.width + x) * 4 + channel] - right.data[(y * right.width + right.width - 1 - x) * 4 + channel],
            );
          }
        }
      }
      return sum / left.data.length;
    },
    { ltr, rtl },
  );
  expect(error).toBeLessThan(1);
});

test('tab layouts outside icon-top stay Web and recover when restored', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 956 });
  await mockNative(page);
  await page.goto('/main/index');
  const bar = page.locator('ion-tab-bar');
  const button = bar.locator('ion-tab-button').first();
  await expect(bar).toHaveAttribute('data-native-ui-shell', '');
  for (const layout of ['icon-start', 'icon-end', 'icon-bottom', 'icon-hide', 'label-hide']) {
    await test.step(layout, async () => {
      await button.evaluate((button: HTMLIonTabButtonElement, layout) => {
        button.layout = layout as HTMLIonTabButtonElement['layout'];
      }, layout);
      await expect(bar).not.toHaveAttribute('data-native-ui-shell');
      await expect.poll(() => latestControl(page, 'ion-tab-bar')).toBeUndefined();
      await expect(bar).toHaveCSS('visibility', 'visible');
      await expect(button).toHaveClass(new RegExp(`tab-layout-${layout}`));
      await button.evaluate((button: HTMLIonTabButtonElement) => (button.layout = 'icon-top'));
      await expect(bar).toHaveAttribute('data-native-ui-shell', '');
    });
  }
  await button.evaluate((button: HTMLIonTabButtonElement) => (button.layout = 'label-hide'));
  await expect(bar).not.toHaveAttribute('data-native-ui-shell');
  await button.evaluate((button: HTMLIonTabButtonElement) => (button.layout = undefined));
  await expect(bar).toHaveAttribute('data-native-ui-shell', '');
});

test('unequal tab widths stay Web and recover when the custom width is removed', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 956 });
  await mockNative(page);
  await page.goto('/main/index');
  const bar = page.locator('ion-tab-bar');
  const button = bar.locator('ion-tab-button').first();
  await expect(bar).toHaveAttribute('data-native-ui-shell', '');
  await button.evaluate((button) => (button.style.flex = '0 0 140px'));
  await expect(bar).not.toHaveAttribute('data-native-ui-shell');
  await expect.poll(() => latestControl(page, 'ion-tab-bar')).toBeUndefined();
  const widths = await bar
    .locator('ion-tab-button')
    .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().width));
  expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(1);
  await expect(bar).toHaveCSS('visibility', 'visible');
  await button.evaluate((button) => button.style.removeProperty('flex'));
  await expect(bar).toHaveAttribute('data-native-ui-shell', '');
});

test('native geometry rejection paints Web before retirement and retries after layout or native refresh', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 956 });
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const bar = page.locator('ion-tab-bar');
  const back = page.locator('app-native-ui-shell ion-back-button');
  await expect(bar).toHaveAttribute('data-native-ui-shell', '');
  await expect(back).toHaveAttribute('data-native-ui-shell', '');
  await page.evaluate(() => {
    const state = Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell');
    const bar = document.querySelector('ion-tab-bar')!;
    const back = document.querySelector('app-native-ui-shell ion-back-button')!;
    const id = state.updates.at(-1)!.controls.find((control: ShellControl) => control.kind === 'ion-tab-bar')!.id;
    state.evidence = { id, frame: 0, visibleFrame: -1, backReleases: 0, retirements: [] };
    const tick = () => {
      state.evidence!.frame++;
      if (!back.hasAttribute('data-native-ui-shell')) state.evidence!.backReleases++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    bar.addEventListener('nativeUIShellChange', () => {
      if (!bar.hasAttribute('data-native-ui-shell') && getComputedStyle(bar).visibility === 'visible') {
        state.evidence!.visibleFrame = state.evidence!.frame;
      }
    });
    state.onUpdate = (snapshot: { controls: ShellControl[] }) => {
      if (!snapshot.controls.some((control: ShellControl) => control.id === id)) {
        state.evidence!.retirements.push({
          frame: state.evidence!.frame,
          visibleFrame: state.evidence!.visibleFrame,
          visible: getComputedStyle(bar).visibility === 'visible',
          backProjected: back.hasAttribute('data-native-ui-shell'),
        });
      }
    };
    state.rejectKind = 'ion-tab-bar';
    state.holdAcknowledgement = true;
  });
  await bar.evaluate((bar) => (bar.style.width = '300px'));
  await expect.poll(() => page.evaluate(() => !!Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell').acknowledge)).toBe(true);
  await expect(bar).toHaveAttribute('data-native-ui-shell', '');
  expect(
    await page.evaluate(() => {
      const state = Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell');
      return state.rendered.has(state.evidence!.id);
    }),
  ).toBe(true);
  await page.evaluate(() => {
    const state = Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell');
    state.holdAcknowledgement = false;
    state.acknowledge!();
  });
  await expect(bar).not.toHaveAttribute('data-native-ui-shell');
  await expect(bar).toHaveCSS('visibility', 'visible');
  await expect(bar).not.toHaveAttribute('aria-hidden');
  await expect(back).toHaveAttribute('data-native-ui-shell', '');
  await expect.poll(() => latestControl(page, 'ion-tab-bar')).toBeUndefined();
  const retirement = await page.evaluate(() => Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell').evidence!.retirements[0]);
  expect(retirement.visible).toBe(true);
  expect(retirement.backProjected).toBe(true);
  expect(retirement.visibleFrame).toBeGreaterThanOrEqual(0);
  expect(retirement.frame - retirement.visibleFrame).toBeGreaterThanOrEqual(2);
  const counts = await page.evaluate(async () => {
    const state = Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell');
    // Let the restoration's mutation notification settle, then re-read identical data.
    for (let frame = 0; frame < 4; frame++) await new Promise(requestAnimationFrame);
    const before = state.updates.length;
    for (let frame = 0; frame < 12; frame++) {
      window.dispatchEvent(new Event('resize'));
      await new Promise(requestAnimationFrame);
    }
    return { before, after: state.updates.length };
  });
  expect(counts.after).toBe(counts.before);
  await page.evaluate(() => (Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell').rejectKind = undefined));
  // Recovery is driven by a new DOM layout, without recreating the runtime.
  await bar.evaluate((bar) => bar.style.removeProperty('width'));
  await expect(bar).toHaveAttribute('data-native-ui-shell', '');
  await expect(back).toHaveAttribute('data-native-ui-shell', '');
  expect(await page.evaluate(() => Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell').updates.length)).toBeGreaterThan(counts.after);
  await page.evaluate(() => {
    Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell').rejectKind = 'ion-tab-bar';
    window.dispatchEvent(new Event('nativeUIShellRefresh'));
  });
  await expect(bar).not.toHaveAttribute('data-native-ui-shell');
  await expect.poll(() => latestControl(page, 'ion-tab-bar')).toBeUndefined();
  await page.evaluate(() => {
    Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell').rejectKind = undefined;
    window.dispatchEvent(new Event('nativeUIShellRefresh'));
  });
  await expect(bar).toHaveAttribute('data-native-ui-shell', '');
  expect(await page.evaluate(() => Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell').evidence!.backReleases)).toBe(0);
});

test('native refresh during a pending rejection retries after the stale acknowledgement', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 956 });
  await mockNative(page);
  await page.goto('/main/index/native-ui-shell');
  const bar = page.locator('ion-tab-bar');
  const back = page.locator('app-native-ui-shell ion-back-button');
  await expect(bar).toHaveAttribute('data-native-ui-shell', '');
  await expect(back).toHaveAttribute('data-native-ui-shell', '');
  await page.evaluate(() => {
    const state = Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell');
    state.rejectKind = 'ion-tab-bar';
    state.holdAcknowledgement = true;
  });
  await bar.evaluate((bar) => (bar.style.width = '300px'));
  await expect.poll(() => page.evaluate(() => !!Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell').acknowledge)).toBe(true);
  const pending = await page.evaluate(() => {
    const state = Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell');
    const snapshot = state.updates.at(-1)!;
    // UIKit now has usable geometry, but its earlier rejection has not reached JS.
    state.rejectKind = undefined;
    window.dispatchEvent(new Event('nativeUIShellRefresh'));
    state.holdAcknowledgement = false;
    state.acknowledge!();
    return { revision: snapshot.revision, id: snapshot.controls.find((control: ShellControl) => control.kind === 'ion-tab-bar')!.id };
  });
  await expect
    .poll(() =>
      page.evaluate(({ revision, id }) => {
        const snapshot = Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell').updates.at(-1)!;
        return snapshot.revision > revision && snapshot.controls.some((control: ShellControl) => control.id === id);
      }, pending),
    )
    .toBe(true);
  await expect(bar).toHaveAttribute('data-native-ui-shell', '');
  await expect(back).toHaveAttribute('data-native-ui-shell', '');
});

for (const path of ['/main/index', '/main/album']) {
  for (const variant of ['icon-only', 'label-only', 'badges']) {
    test(`tab content variants: ${path} ${variant}`, async ({ page }) => {
      await page.setViewportSize({ width: 440, height: 956 });
      await mockNative(page);
      await page.goto(path);
      await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-shell', '');
      if (variant === 'badges') {
        // These pages do not import IonBadge; register the real component for this fixture.
        await page.addScriptTag({
          content: buildSync({
            stdin: {
              contents:
                "import { initialize } from '@ionic/core/components'; import { defineCustomElement } from '@ionic/core/components/ion-badge.js'; initialize({ mode: 'ios' }); defineCustomElement();",
              resolveDir: __dirname,
            },
            bundle: true,
            format: 'iife',
            write: false,
          }).outputFiles[0].text,
        });
      }
      await page.locator('ion-tab-bar').evaluate((bar, variant) => {
        bar.setAttribute('color', 'light');
        const buttons = [...bar.querySelectorAll<HTMLIonTabButtonElement>('ion-tab-button:not(.ion-cloned-element)')];
        buttons.forEach((button) => button.setAttribute('aria-label', button.textContent!.trim()));
        if (variant === 'icon-only') buttons.forEach((button) => button.querySelector('ion-label')?.remove());
        if (variant === 'label-only') buttons.forEach((button) => button.querySelector('ion-icon')?.remove());
        if (variant === 'badges') {
          ['heart', 'musical-note', 'calendar'].forEach((name, index) =>
            buttons[index].querySelector('ion-icon')!.setAttribute('name', name),
          );
          for (const [index, text] of [
            [0, ''],
            [2, '47'],
          ] as const) {
            const badge = document.createElement('ion-badge');
            badge.setAttribute('color', 'danger');
            badge.textContent = text;
            buttons[index].append(badge);
          }
        }
      }, variant);
      const current = () => latestControl(page, 'ion-tab-bar');
      if (variant === 'icon-only') {
        await expect.poll(async () => (await current())?.items.every((item: ShellItem) => item.label === '' && !!item.icon)).toBe(true);
        expect((await current())!.items.every((item: ShellItem) => !!item.accessibilityLabel)).toBe(true);
      } else if (variant === 'label-only') {
        await expect.poll(async () => (await current())?.items.every((item: ShellItem) => !!item.label && !item.icon)).toBe(true);
      } else {
        await expect(page.locator('ion-badge').first()).toHaveClass(/hydrated/);
        await expect
          .poll(async () => (await current())?.items.map((item: ShellItem) => item.badge?.value ?? null))
          .toEqual([null, null, '47', null]);
        // Ionic iOS hides an empty badge; a visible empty badge maps to a notification dot.
        await page
          .locator('ion-badge')
          .first()
          .evaluate((badge: HTMLElement) => {
            badge.style.cssText = 'display:block;min-width:8px;height:8px';
          });
        await expect.poll(async () => (await current())?.items[0].badge?.value).toBe('');
        const colors = await page.locator('ion-badge').evaluateAll((badges) =>
          badges.map((badge) => {
            const style = getComputedStyle(badge);
            return { color: style.backgroundColor, textColor: style.color };
          }),
        );
        const snapshot = (await current())!;
        expect(colors.every(({ color }) => color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)')).toBe(true);
        expect(snapshot.items[0].badge).toEqual({ value: '', ...colors[0] });
        expect(snapshot.items[2].badge).toEqual({ value: '47', ...colors[1] });
        await page
          .locator('ion-badge')
          .nth(1)
          .evaluate((badge) => {
            badge.textContent = '48';
            badge.setAttribute('color', 'success');
          });
        await expect.poll(async () => (await current())?.items[2].badge?.value).toBe('48');
        await page
          .locator('ion-badge')
          .nth(0)
          .evaluate((badge: HTMLElement) => {
            badge.style.display = 'none';
          });
        await expect.poll(async () => (await current())?.items[0].badge).toBeUndefined();
        await page
          .locator('ion-badge')
          .nth(1)
          .evaluate((badge) => badge.remove());
        await expect.poll(async () => (await current())?.items[2].badge).toBeUndefined();
      }
      await expect(page.locator('ion-tab-bar')).toHaveAttribute('data-native-ui-shell', '');
      // Selection stays owned by the actual Ionic tab button, including icon-only tabs.
      await page.evaluate(() => {
        const state = Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell');
        const snapshot = state.updates.at(-1)!;
        const item = snapshot.controls.find((control: ShellControl) => control.kind === 'ion-tab-bar')!.items[1];
        state.notifyListeners('activate', { id: item.id, revision: snapshot.revision, sequence: ++state.sequence });
      });
      await expect(page).toHaveURL('/main/docs');
      await expect.poll(async () => (await current())?.items[1].selected).toBe(true);
    });
  }
}
