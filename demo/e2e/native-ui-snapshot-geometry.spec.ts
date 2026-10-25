import { expect, test } from '@playwright/test';
import { buildSync } from 'esbuild';
import type { enableNativeUI } from '../../packages/capacitor-native-ui/src/core';
import type { createRuntime } from '../../packages/capacitor-native-ui/src/native/runtime';
import type { NativeUIPlugin, NativeUIRuntimeHandle, NativeUISuspension } from '../../packages/capacitor-native-ui/src/native/definitions';

const bundle = buildSync({
  stdin: {
    contents:
      "export { createRuntime } from '../../packages/capacitor-native-ui/src/native/runtime'; export { Capacitor } from '@capacitor/core'; export { enableNativeUI } from '../../packages/capacitor-native-ui/src/core';",
    resolveDir: __dirname,
  },
  bundle: true,
  format: 'iife',
  globalName: 'snapshotTest',
  write: false,
}).outputFiles[0].text;

type TestWindow = Window & {
  snapshotTest: {
    enableNativeUI: typeof enableNativeUI;
    createRuntime: typeof createRuntime;
    Capacitor: { convertFileSrc: (url: string) => string };
  };
  runtime: NativeUIRuntimeHandle;
  leases: NativeUISuspension[];
  captures: number;
  reject?: boolean;
  handoffAnimations?: number;
};

for (const tag of ['button', 'div', 'ion-button', 'span-auto', 'span-sized']) {
  for (const direction of ['ltr', 'rtl']) {
    test(`snapshot keeps native dimensions without theme: ${tag}, ${direction}`, async ({ page }) => {
      if (tag === 'ion-button') {
        // Hydrate real Ionic without loading the app theme stylesheet.
        await page.route('**/styles.css', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
        await page.goto('/main/index');
        await page.evaluate(async () => {
          await (document.querySelector('ion-app') as HTMLElement & { nativeUI?: NativeUIRuntimeHandle }).nativeUI?.destroy();
        });
      }
      await page.evaluate(
        ({ tag, direction }) => {
          const element = tag.startsWith('span') ? 'span' : tag;
          document.body.innerHTML = `<main id="surface" dir="${direction}"><${element} role="button" id="source" data-native-ui="button">${tag.startsWith('span') ? 'i' : 'Save'}</${element}></main>`;
        },
        { tag, direction },
      );
      await page.addStyleTag({
        content: `
        #surface { position:absolute; left:65.25px; top:80.5px; transform-origin:0 0; }
        #source { display:block; zoom:1.25; box-sizing:border-box; width:127.5px; height:63.25px; margin:0; padding:9px 13px; border:3px solid black; }
        #source:disabled { border-width:7px; }
        ${tag === 'button' ? '#source { transition:border-width 300ms linear; }' : ''}
        ${tag.startsWith('span') ? `#source { display:inline; width:${tag === 'span-auto' ? 'auto' : '100px'}; height:auto; padding:0; border:0; font:17.3px Arial; }` : ''}
      `,
      });
      await page.addScriptTag({ content: bundle });
      await page.evaluate(async () => {
        const w = window as TestWindow;
        const source = document.querySelector<HTMLElement>('#source')!;
        await (source as HTMLElement & { componentOnReady?: () => Promise<unknown> }).componentOnReady?.();
        w.captures = 0;
        w.leases = [];
        // A solid decoded image makes the same path testable without a native binary.
        w.snapshotTest.Capacitor.convertFileSrc = () =>
          'data:image/svg+xml,' +
          encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="74" height="58"><path fill="red" d="M0 0h74v58H0z"/></svg>');
        const plugin = {
          addListener: async () => ({ remove: async () => {} }),
          update: async (snapshot) => ({ revision: snapshot.revision }),
          clear: async () => {},
          coveredSnapshot: async (args) => {
            if (args.action !== 'prepare') return { shown: true };
            return {
              token: `capture-${++w.captures}`,
              parts: [{ ids: args.ids!, url: 'file:///snapshot.png', x: 100.25, y: 110.5, width: 74, height: 58 }],
            };
          },
        } as NativeUIPlugin;
        w.runtime = await w.snapshotTest.createRuntime(document, plugin, {
          source: 'html',
          root: document.querySelector('#surface')!,
          coveredSnapshots: true,
        });
      });
      const source = page.locator('#source');
      await expect(source).toHaveAttribute('data-native-ui-snapshot');
      const before = await source.boundingBox();
      const captures = await page.evaluate(() => (window as TestWindow).captures);
      await source.evaluate((element) => {
        const w = window as TestWindow;
        w.handoffAnimations = 0;
        const animate = element.animate.bind(element);
        element.animate = (...args) => {
          w.handoffAnimations!++;
          return animate(...args);
        };
      });
      await page.evaluate(
        async (disable) => {
          if (disable) document.querySelector('#source')!.setAttribute('disabled', '');
          const w = window as TestWindow;
          w.leases.push(await w.runtime.suspend({ covered: true }));
        },
        tag === 'button' && direction === 'ltr',
      );
      if (tag === 'button' && direction === 'rtl') await source.evaluate((element) => element.setAttribute('disabled', ''));
      await expect(source).toHaveAttribute('data-native-ui-snapshot-visible', '');
      expect(await page.evaluate(() => (window as TestWindow).handoffAnimations)).toBe(0);
      expect(await source.boundingBox()).toEqual(before);
      const frame = () =>
        source.evaluate((element, before) => {
          const rect = element.getBoundingClientRect();
          const css = getComputedStyle(element);
          const image = getComputedStyle(element, '::before');
          const scaleX = element.tagName === 'SPAN' ? (rect.width / before!.width) * 1.25 : rect.width / parseFloat(css.width);
          const scaleY = element.tagName === 'SPAN' ? (rect.height / before!.height) * 1.25 : rect.height / parseFloat(css.height);
          return {
            x: rect.x + (parseFloat(css.borderLeftWidth) + parseFloat(image.left)) * scaleX,
            y: rect.y + (parseFloat(css.borderTopWidth) + parseFloat(image.top)) * scaleY,
            width: parseFloat(image.width) * scaleX,
            height: parseFloat(image.height) * scaleY,
          };
        }, before);
      expect(await frame()).toEqual({ x: 100.25, y: 110.5, width: 74, height: 58 });
      if (tag === 'button') {
        const errors = await source.evaluate(async (element) => {
          const errors: number[] = [];
          const start = performance.now();
          while (performance.now() - start < 350) {
            await new Promise(requestAnimationFrame);
            const rect = element.getBoundingClientRect();
            const css = getComputedStyle(element);
            const image = getComputedStyle(element, '::before');
            const x = rect.x + ((parseFloat(css.borderLeftWidth) + parseFloat(image.left)) * rect.width) / parseFloat(css.width);
            const y = rect.y + ((parseFloat(css.borderTopWidth) + parseFloat(image.top)) * rect.height) / parseFloat(css.height);
            errors.push(Math.abs(x - 100.25), Math.abs(y - 110.5));
          }
          return errors;
        });
        expect(Math.max(...errors)).toBeLessThan(0.01);
      }
      // The image follows the same animation as its source, with no recapture.
      await page.locator('#surface').evaluate((element) => {
        element.style.transform = 'translate(20px, 30px) scale(0.8, 0.75)';
      });
      const moved = await frame();
      expect(moved.x).toBeCloseTo(65.25 + 20 + 35 * 0.8, 2);
      expect(moved.y).toBeCloseTo(80.5 + 30 + 30 * 0.75, 2);
      expect(moved.width).toBeCloseTo(74 * 0.8, 2);
      expect(moved.height).toBeCloseTo(58 * 0.75, 2);
      expect(await page.evaluate(() => (window as TestWindow).captures)).toBe(captures);
      await page.locator('#surface').evaluate((element) => {
        element.style.transform = '';
      });
      await page.evaluate(async () => {
        await (window as TestWindow).leases.pop()!.resume();
      });
      await expect(source).not.toHaveAttribute('data-native-ui-snapshot-visible');
      await expect(source).toHaveAttribute('data-native-ui-projected', '');
      expect(await source.boundingBox()).toEqual(before);
      // Ordinary suspension still gives the application interactive Web controls,
      // even when nested within a covered suspension.
      await page.evaluate(async () => {
        const w = window as TestWindow;
        w.leases.push(await w.runtime.suspend({ covered: true }));
        w.leases.push(await w.runtime.suspend());
      });
      await expect(source).not.toHaveAttribute('data-native-ui-snapshot-visible');
      await expect(source).not.toHaveAttribute('data-native-ui-projected');
      await expect(source).toBeVisible();
      await page.evaluate(async () => {
        const w = window as TestWindow;
        await w.leases.pop()!.resume();
      });
      await expect(source).not.toHaveAttribute('data-native-ui-projected');
      await page.evaluate(async () => {
        await (window as TestWindow).leases.pop()!.resume();
      });
      await expect(source).toHaveAttribute('data-native-ui-projected', '');
      // Theme opt-out also opts out of native projection; keep that contract.
      await source.evaluate((element) => element.classList.add('ios-theme-disabled'));
      await expect(source).not.toHaveAttribute('data-native-ui-projected');
      await page.evaluate(async () => {
        const w = window as TestWindow;
        const lease = await w.runtime.suspend({ covered: true });
        await lease.resume();
      });
      await expect(source).not.toHaveAttribute('data-native-ui-snapshot-visible');
      await expect(source).toBeVisible();
      await page.evaluate(async () => {
        await (window as TestWindow).runtime.destroy();
      });
      await expect(page.locator('[data-native-ui-snapshot-layer], style[data-native-ui-snapshot]')).toHaveCount(0);
    });
  }
}

for (const direction of ['ltr', 'rtl']) {
  test(`public core shell anchors HTML rail images to their display DOM and native size: ${direction}`, async ({ page }) => {
    await page.setContent(`
      <style>
        #root { position:absolute; left:25px; top:60px; }
        #root button { width:129.5px; height:37.25px; }
        #rail { position:fixed; top:100px; ${direction === 'ltr' ? 'right' : 'left'}:20px; width:90px; height:400px; display:flex; flex-direction:column; justify-content:center; }
        #rail > button { display:block; box-sizing:border-box; width:31.5px; height:29.25px; padding:4px; border:3px solid black; }
      </style>
      <main id="root" dir="${direction}">
        <button data-native-ui="back-button" data-native-ui-placement="rail">Back</button>
        <button data-native-ui="button" data-native-ui-placement="rail">Save</button>
      </main>
      <aside id="rail"><span id="unrelated">Application content</span></aside>
    `);
    const unrelatedFrame = await page.locator('#unrelated').boundingBox();
    await page.evaluate((direction) => {
      const w = window as TestWindow;
      w.captures = 0;
      let controls: { id: string; kind: string }[] = [];
      const plugin = {
        configure: async () => ({ supported: true, coveredSnapshots: true }),
        getWebViewMetrics: async () => ({ verticalBarEdge: 'trailing' }),
        addListener: async () => ({ remove: async () => {} }),
        update: async (snapshot: { revision: number; controls: typeof controls }) => {
          controls = snapshot.controls;
          return { revision: snapshot.revision, rejectedControls: w.reject ? controls.map((control) => control.id) : [] };
        },
        clear: async () => {},
        coveredSnapshot: async (args: { action: string; ids?: string[] }) => {
          if (args.action !== 'prepare') return { shown: true };
          return {
            token: `rail-${++w.captures}`,
            parts: args.ids!.map((id) => ({
              ids: [id],
              url: 'file:///rail.png',
              x: direction === 'ltr' ? innerWidth - 90 : 20,
              y: controls.find((control) => control.id === id)!.kind === 'back-button' ? 160 : 240,
              width: 60.25,
              height: 48.5,
            })),
          };
        },
      };
      window.CapacitorCustomPlatform = { name: 'ios' };
      let capacitor: unknown;
      Object.defineProperty(window, 'Capacitor', {
        configurable: true,
        get: () => capacitor,
        set: (value) => {
          const available = value.isPluginAvailable;
          const register = value.registerPlugin;
          value.isPluginAvailable = (name: string) => name === 'NativeUI' || available(name);
          value.registerPlugin = (name: string) => (name === 'NativeUI' ? plugin : register(name));
          capacitor = value;
        },
      });
    }, direction);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(async () => {
      const w = window as TestWindow;
      w.snapshotTest.Capacitor.convertFileSrc = () =>
        'data:image/svg+xml,' +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="61" height="49"><path fill="red" d="M0 0h61v49H0z"/></svg>');
      w.runtime = await w.snapshotTest.enableNativeUI({
        root: document.querySelector('#root')!,
        verticalBars: { placement: { edge: 'trailing', webHost: document.querySelector('#rail')! } },
      });
      w.leases = [];
    });
    const sources = page.locator('#root button');
    const proxies = page.locator('#rail > button');
    await expect(sources.first()).toHaveAttribute('data-native-ui-projected', '');
    await expect(proxies).toHaveCount(2);
    await expect(proxies.last()).toHaveAttribute('data-native-ui-snapshot');
    await expect(proxies.last()).toHaveAttribute('inert', '');
    await expect(proxies.last()).toBeHidden();
    expect(await page.locator('#unrelated').boundingBox()).toEqual(unrelatedFrame);
    expect(await page.evaluate(() => (window as TestWindow).runtime.getStatus().projected)).toBe(2);
    // Prewarming proxies must settle, rather than triggering another capture on each render.
    await page.waitForTimeout(150);
    const settledCaptures = await page.evaluate(() => (window as TestWindow).captures);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as TestWindow).captures)).toBe(settledCaptures);
    const original = await sources.last().boundingBox();
    const readFrames = () =>
      proxies.evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          const css = getComputedStyle(element);
          const image = getComputedStyle(element, '::before');
          return {
            x: rect.x + parseFloat(css.borderLeftWidth) + parseFloat(image.left),
            y: rect.y + parseFloat(css.borderTopWidth) + parseFloat(image.top),
            width: parseFloat(image.width),
            height: parseFloat(image.height),
          };
        }),
      );
    const expected = [160, 240].map((y) => ({ x: direction === 'ltr' ? 1190 : 20, y, width: 60.25, height: 48.5 }));
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.evaluate(async () => {
        const w = window as TestWindow;
        w.leases.push(await w.runtime.suspend({ covered: true }));
      });
      await expect(proxies.last()).toHaveAttribute('data-native-ui-snapshot-visible', '');
      expect(await readFrames()).toEqual(expected);
      expect(await sources.last().boundingBox()).toEqual(original);
      await expect(page.locator('#unrelated')).toBeVisible();
      // Source scrolling and state changes cannot move the rail's frozen image.
      await page.locator('#root').evaluate((element) => {
        element.style.transform = 'translateY(55px)';
      });
      await sources.last().evaluate((element: HTMLButtonElement) => {
        element.disabled = true;
      });
      expect(await readFrames()).toEqual(expected);
      await expect(proxies.last()).toHaveAttribute('inert', '');
      await page.locator('#root').evaluate((element) => {
        element.style.transform = '';
      });
      await sources.last().evaluate((element: HTMLButtonElement) => {
        element.disabled = false;
      });
      await page.evaluate(async () => {
        await (window as TestWindow).leases.pop()!.resume();
      });
      await expect(sources.last()).toHaveAttribute('data-native-ui-projected', '');
      await expect(proxies.last()).not.toHaveAttribute('data-native-ui-snapshot-visible');
      await expect(proxies).toHaveCount(2);
    }
    // Placement changes must not reuse a detached rail target for an element image.
    await sources.last().evaluate((element) => element.setAttribute('data-native-ui-placement', 'element'));
    await expect(proxies).toHaveCount(1);
    await expect(sources.last()).toHaveAttribute('data-native-ui-snapshot');
    await page.evaluate(async () => {
      const w = window as TestWindow;
      w.leases.push(await w.runtime.suspend({ covered: true }));
    });
    await expect(sources.last()).toHaveAttribute('data-native-ui-snapshot-visible', '');
    await expect(proxies.first()).toHaveAttribute('data-native-ui-snapshot-visible', '');
    await page.evaluate(async () => {
      await (window as TestWindow).leases.pop()!.resume();
    });
    await expect(sources.last()).toHaveAttribute('data-native-ui-projected', '');
    await sources.last().evaluate((element) => element.setAttribute('data-native-ui-placement', 'rail'));
    await expect(proxies).toHaveCount(2);
    await expect(proxies.last()).toHaveAttribute('data-native-ui-snapshot');
    // Reject Native after image use: normal Web must regain its own CSS size,
    // positioning and interaction rather than keeping the prepared image geometry.
    await page.evaluate(() => {
      const w = window as TestWindow;
      w.reject = true;
      const source = document.querySelector<HTMLButtonElement>('#root button:last-child')!;
      source.textContent = 'Save on Web';
      source.addEventListener('click', () => {
        source.dataset.clicks = String(Number(source.dataset.clicks ?? 0) + 1);
      });
      w.runtime.markForCheck();
    });
    await expect(proxies.last()).toBeVisible();
    await expect(proxies.last()).not.toHaveAttribute('inert');
    await expect(proxies.last()).not.toHaveAttribute('data-native-ui-snapshot');
    await expect(proxies.last()).not.toHaveAttribute('data-native-ui-snapshot-prepared');
    await expect(proxies.last()).toHaveCSS('position', 'static');
    const webFrame = await proxies.last().boundingBox();
    expect(webFrame!.width).toBe(31.5);
    expect(webFrame!.height).toBe(29.25);
    await proxies.last().click();
    await expect(sources.last()).toHaveAttribute('data-clicks', '1');
    await sources.last().evaluate((source: HTMLButtonElement) => {
      source.disabled = true;
    });
    await expect(proxies.last()).toBeDisabled();
    await page.evaluate(async () => {
      await (window as TestWindow).runtime.destroy();
    });
    await expect(proxies).toHaveCount(0);
    await expect(page.locator('[data-native-ui-snapshot-layer], style[data-native-ui-snapshot]')).toHaveCount(0);
    await expect(page.locator('#unrelated')).toBeVisible();
    await expect(sources.last()).toBeVisible();
  });
}
