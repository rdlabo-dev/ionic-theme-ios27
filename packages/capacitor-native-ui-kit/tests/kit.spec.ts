import { expect, test, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
const bundle = buildSync({ entryPoints: ['src/index.ts'], bundle: true, format: 'iife', globalName: 'kit', write: false }).outputFiles[0]
  .text;
const boot = async (page: Page) => {
  await page.setContent(
    '<main id="surface" style="position:relative"><div id="scroll" style="height:300px;width:300px;overflow:auto"><div style="height:100px"></div><div id="source" style="width:120px;height:40px"><button>Web action</button></div><div style="height:900px"></div></div></main><div id="other"></div>',
  );
  await page.addScriptTag({ content: bundle });
};
const prepare = async (page: Page, fail = false, shadow = false) => {
  await boot(page);
  if (shadow)
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.attachShadow({ mode: 'open' }).append(document.querySelector('main')!);
      document.body.append(host);
      (window as any).sourceRoot = host.shadowRoot;
    });
  await page.evaluate(async (fail) => {
    const w = window as any,
      source = (w.sourceRoot ?? document).querySelector('#source') as HTMLElement,
      owner = (w.sourceRoot ?? document).querySelector('#scroll') as HTMLElement;
    const rect = source.getBoundingClientRect(),
      viewport = owner.getBoundingClientRect();
    w.calls = [];
    w.revision = 1;
    w.failCover = false;
    w.scope = w.kit.createSnapshotScope('test');
    w.source = {
      element: source,
      scrollElement: owner,
      control: {
        id: 'counter',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        scroll: {
          id: 'owner',
          offsetX: 0,
          offsetY: 0,
          viewport: { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height },
          clip: { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height },
          contentWidth: 300,
          contentHeight: 1040,
          frame: { x: 0, y: 100, width: 120, height: 40 },
        },
      },
    };
    w.manager = await w.kit.createSnapshotHandoff(
      document,
      {
        send: async (request: any) => {
          w.calls.push(request);
          if (request.action === 'prepare')
            return fail
              ? {}
              : {
                  token: 'image',
                  parts: [{ ids: ['counter'], url: 'file:///image.png', x: rect.x, y: rect.y, width: rect.width, height: rect.height }],
                };
          if (request.action === 'cover') return { shown: !w.failCover };
          return {};
        },
        listen: async (listener: Function) => {
          w.interact = listener;
          return {
            remove() {
              w.removed = true;
            },
          };
        },
        resolveURL: () =>
          'data:image/svg+xml,' +
          encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><path fill="red" d="M0 0h120v40H0z"/></svg>'),
      },
      w.scope,
      { wake() {}, blocked: () => false, revision: () => w.revision },
    );
    w.manager.consider(1, [w.source]);
  }, fail);
  if (!fail) await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot', /.+/);
};

test('prepared pixels appear without a new capture; only matching restore ACK retires them', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => (window as any).manager.begin());
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#source')!, '::before').opacity)).toBe('1');
  expect(await page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'prepare').length)).toBe(1);
  await page.evaluate(() => {
    const w = window as any;
    w.manager.end();
    w.manager.updated(undefined, ['counter'], 1);
  });
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() => (window as any).manager.updated(undefined, ['counter'], 2));
  await expect(page.locator('#source')).not.toHaveAttribute('data-native-ui-snapshot-visible');
  await expect(page.locator('button')).toBeVisible();
});
for (const related of [true, false])
  test(`image geometry invalidation is owner-scoped (${related})`, async ({ page }) => {
    await prepare(page);
    const layers = await page.evaluate((related) => {
      const w = window as any,
        owner = document.querySelector('#scroll') as HTMLElement;
      if (related) owner.scrollTop = 50;
      w.manager.changed(related ? owner : document.querySelector('#other'));
      w.manager.begin(document.querySelector('#surface'));
      return document.querySelectorAll('[data-native-ui-snapshot-layer]').length;
    }, related);
    expect(layers).toBe(related ? 0 : 1);
  });
test('capture absence preserves interactive Web without a presentation wait', async ({ page }) => {
  await prepare(page, true);
  await page.waitForTimeout(100);
  await page.evaluate(() => (window as any).manager.begin());
  await expect(page.locator('button')).toBeVisible();
  expect(await page.evaluate(() => (window as any).calls.some((c: any) => c.action === 'cover'))).toBe(false);
});
test('cover refusal restores Web and removes snapshot ownership', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => {
    const w = window as any;
    w.failCover = true;
    w.manager.begin();
  });
  await expect(page.locator('#source')).not.toHaveAttribute('data-native-ui-snapshot-visible');
  await expect(page.locator('button')).toBeVisible();
  expect(await page.evaluate(() => (window as any).scope.owners.size)).toBe(0);
});
test('interaction keeps the completed pre-interaction image', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => {
    const w = window as any;
    w.interact({ active: true });
    w.manager.changed();
    w.manager.begin();
  });
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  expect(await page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'prepare').length)).toBe(1);
});
test('destruction releases only owned tokens, listeners and CSS', async ({ page }) => {
  await prepare(page);
  await page.evaluate(async () => {
    const w = window as any;
    w.manager.begin();
    await w.manager.destroy();
  });
  await expect(page.locator('button')).toBeVisible();
  expect(
    await page.evaluate(() => {
      const w = window as any;
      return {
        removed: w.removed,
        owners: w.scope.owners.size,
        reset: w.calls.some((c: any) => c.action === 'reset'),
        released: w.calls.some((c: any) => c.action === 'release'),
        styles: document.querySelectorAll('style[data-native-ui-snapshot]').length,
      };
    }),
  ).toEqual({ removed: true, owners: 0, reset: false, released: true, styles: 0 });
});
test('plugin scopes do not share ownership or events', async ({ page }) => {
  await boot(page);
  expect(
    await page.evaluate(() => {
      const w = window as any,
        a = w.kit.createSnapshotScope('ads'),
        b = w.kit.createSnapshotScope('ui'),
        source = document.querySelector('#source');
      a.owners.add(source);
      return [b.owners.size, a.coveredSourcesChanged !== b.coveredSourcesChanged];
    }),
  ).toEqual([0, true]);
});
for (const rtl of [false, true])
  test(`fractional layout and direction remain intact (${rtl ? 'RTL' : 'LTR'})`, async ({ page }) => {
    await boot(page);
    const result = await page.evaluate((rtl) => {
      const w = window as any,
        owner = document.querySelector('#scroll') as HTMLElement,
        source = document.querySelector('#source') as HTMLElement;
      owner.style.cssText = 'width:300.5px;height:300px;overflow:auto;border:0.5px solid;direction:' + (rtl ? 'rtl' : 'ltr');
      source.parentElement!.firstElementChild!.setAttribute('style', 'width:1200px;height:100px');
      const p = w.kit.readScrollPlacement(source, owner, () => 'owner');
      const r = source.getBoundingClientRect();
      return { actual: p.frame.x + p.viewport.x - owner.scrollLeft, expected: r.x };
    }, rtl);
    expect(result.actual).toBeCloseTo(result.expected, 5);
  });
test('unsupported transforms keep the Web layout intact', async ({ page }) => {
  await boot(page);
  expect(
    await page.evaluate(() => {
      const w = window as any,
        owner = document.querySelector('#scroll') as HTMLElement;
      owner.style.transform = 'translateY(1px)';
      return w.kit.readScrollPlacement(document.querySelector('#source'), owner, () => 'owner');
    }),
  ).toBeUndefined();
});
test('ACK during motion never establishes a stale origin; content resize requires reacquisition', async ({ page }) => {
  await prepare(page);
  expect(
    await page.evaluate(() => {
      const w = window as any,
        b = w.kit.createScrollBindings(),
        s = w.source,
        owner = s.scrollElement;
      const attempt = b.acquiring([s], innerWidth);
      b.changed(owner);
      const stale = b.unconfirmed([s], attempt).has(owner),
        moving = b.eligible(s, innerWidth);
      b.settled(owner);
      b.acknowledge([s], innerWidth);
      const reuse = b.reuse(s, innerWidth);
      const changed = { ...s, control: { ...s.control, scroll: { ...s.control.scroll, contentHeight: 2000 } } };
      return { stale, moving, reuse, resized: b.reuse(changed, innerWidth) };
    }),
  ).toEqual({ stale: true, moving: false, reuse: true, resized: false });
});

test('image presentation works inside a shadow tree and restores Web', async ({ page }) => {
  await prepare(page, false, true);
  await page.evaluate(() => (window as any).manager.begin());
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  expect(await page.evaluate(() => getComputedStyle((window as any).source.element, '::before').opacity)).toBe('1');
  await page.evaluate(async () => (window as any).manager.destroy());
  await expect(page.locator('button')).toBeVisible();
  expect(await page.evaluate(() => (window as any).sourceRoot.querySelectorAll('style[data-native-ui-snapshot]').length)).toBe(0);
});

test('destroying one plugin leaves another plugin image and listener intact', async ({ page }) => {
  await prepare(page);
  await page.evaluate(async () => {
    const w = window as any,
      element = document.createElement('div');
    element.id = 'second';
    element.style.cssText = 'height:40px;width:120px';
    element.textContent = 'Ad slot';
    document.body.append(element);
    const r = element.getBoundingClientRect();
    w.secondScope = w.kit.createSnapshotScope('ads');
    w.second = await w.kit.createSnapshotHandoff(
      document,
      {
        send: async (request: any) =>
          request.action === 'prepare'
            ? { token: 'second-image', parts: [{ ids: ['ad'], url: 'file:///ad.png', x: r.x, y: r.y, width: r.width, height: r.height }] }
            : { shown: true },
        listen: async () => ({
          remove() {
            w.secondRemoved = true;
          },
        }),
        resolveURL: () =>
          'data:image/svg+xml,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="blue"/></svg>',
          ),
      },
      w.secondScope,
      { wake() {}, blocked: () => false },
    );
    w.second.consider(1, [{ element, control: { id: 'ad', x: r.x, y: r.y, width: r.width, height: r.height } }]);
  });
  await expect(page.locator('#second')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(async () => {
    const w = window as any;
    w.manager.begin();
    w.second.begin();
    await w.manager.destroy();
  });
  await expect(page.locator('#second')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  expect(
    await page.evaluate(() => {
      const w = window as any;
      return {
        owners: w.secondScope.owners.size,
        removed: !!w.secondRemoved,
        opacity: getComputedStyle(document.querySelector('#second')!, '::before').opacity,
      };
    }),
  ).toEqual({ owners: 1, removed: false, opacity: '1' });
});

test('coordinate placement preserves full size while clipping partially scrolled content', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(() => {
    const owner = document.querySelector('#scroll') as HTMLElement;
    const source = document.querySelector('#source') as HTMLElement;
    owner.style.border = '2px solid black';
    owner.scrollTop = 120;
    const placement = (window as any).kit.readPlacement(source);
    const bounds = owner.getBoundingClientRect();
    owner.style.borderRadius = '20px';
    const shaped = (window as any).kit.readPlacement(source);
    owner.style.borderRadius = '0';
    owner.scrollTop = 200;
    return { placement, top: bounds.top + 2, shaped, offscreen: (window as any).kit.readPlacement(source) };
  });
  expect(result.placement.frame.height).toBe(40);
  expect(result.placement.clip.height).toBe(20);
  expect(result.placement.clip.y).toBe(result.top);
  expect(result.shaped).toBeUndefined();
  expect(result.offscreen).toBeUndefined();
});
