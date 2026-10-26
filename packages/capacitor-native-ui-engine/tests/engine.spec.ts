import { expect, test, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
const bundle = buildSync({ entryPoints: ['src/index.ts'], bundle: true, format: 'iife', globalName: 'engine', write: false }).outputFiles[0]
  .text;
const boot = async (page: Page) => {
  await page.setContent(
    '<main id="surface" style="position:relative"><div id="scroll" style="height:300px;width:300px;overflow:auto"><div style="height:100px"></div><div id="source" style="width:120px;height:40px"><button>Web action</button></div><div style="height:900px"></div></div></main><div id="other"></div>',
  );
  await page.evaluate(() => {
    (window as any).Capacitor = {
      convertFileSrc: (url: string) =>
        'data:image/svg+xml,' +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="${url.endsWith('/ad.png') ? 'blue' : 'red'}"/></svg>`,
        ),
    };
  });
  await page.addScriptTag({ content: bundle });
};
const prepare = async (page: Page, fail = false, shadow = false, proxy = false, shared = false, events = false) => {
  await boot(page);
  if (shadow)
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.attachShadow({ mode: 'open' }).append(document.querySelector('main')!);
      document.body.append(host);
      (window as any).sourceRoot = host.shadowRoot;
    });
  await page.evaluate(
    async ({ fail, proxy, shared, events }) => {
      const w = window as any,
        source = (w.sourceRoot ?? document).querySelector('#source') as HTMLElement,
        owner = (w.sourceRoot ?? document).querySelector('#scroll') as HTMLElement;
      const rect = source.getBoundingClientRect(),
        viewport = owner.getBoundingClientRect();
      w.calls = [];
      w.revision = 1;
      w.failCover = false;
      w.coverReplies = [];
      if (proxy) {
        const target = document.createElement('button');
        target.id = 'proxy';
        target.textContent = 'Web proxy';
        document.body.append(target);
      }
      if (shared) {
        const host = document.createElement('div');
        host.id = 'projection-host';
        host.style.cssText = 'position:absolute;inset:0;z-index:7;pointer-events:none';
        document.querySelector('#surface')!.append(host);
      }
      w.scope = w.engine.createWebProjectionScope(
        shared ? document.getElementById('projection-host') : proxy ? document.getElementById('proxy') : source,
        'test',
      );
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
      w.manager = await w.engine.createWebProjection(
        w.scope,
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
            if (request.action === 'cover') {
              if (w.holdCover) return new Promise((resolve) => w.coverReplies.push(resolve));
              return { shown: !w.failCover };
            }
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
        },
        {
          wake() {},
          blocked: () => false,
          revision: () => w.revision,
          events: events
            ? {
                addListener: async (name: string, callback: Function) => {
                  (w.eventListeners ??= {})[name] = callback;
                  return { remove: () => (w.removedEvents ??= []).push(name) };
                },
                update: ['setColors', 'shown'],
                projection: { native: ['shown'], web: ['transitionStarted'], none: ['hidden'] },
                accepts: (event: any) => event.id === 'counter',
              }
            : undefined,
        },
      );
      w.manager.consider(1, [w.source]);
    },
    { fail, proxy, shared, events },
  );
  if (!fail)
    await expect(page.locator(shared ? '#projection-host' : proxy ? '#proxy' : '#source')).toHaveAttribute('data-native-ui-snapshot', /.+/);
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
      w.manager.begin();
      return w.manager.owners.length;
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
  expect(await page.evaluate(() => (window as any).manager.owners.length)).toBe(0);
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
        owners: w.manager.owners.length,
        reset: w.calls.some((c: any) => c.action === 'reset'),
        released: w.calls.some((c: any) => c.action === 'release'),
        styles: document.querySelectorAll('style[data-native-ui-snapshot]').length,
      };
    }),
  ).toEqual({ removed: true, owners: 0, reset: false, released: true, styles: 0 });
});
test('a scope fixes an existing fallback DOM and rejects a document', async ({ page }) => {
  await boot(page);
  expect(
    await page.evaluate(() => {
      const w = window as any,
        fallback = document.querySelector('#source')!;
      const scope = w.engine.createWebProjectionScope(fallback, 'test');
      let rejected = false;
      try {
        w.engine.createWebProjectionScope(document, 'bad');
      } catch {
        rejected = true;
      }
      return { same: scope.element === fallback, frozen: Object.isFrozen(scope), rejected };
    }),
  ).toEqual({ same: true, frozen: true, rejected: true });
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
      const p = w.engine.readScrollPlacement(source, owner, () => 'owner');
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
      return w.engine.readScrollPlacement(document.querySelector('#source'), owner, () => 'owner');
    }),
  ).toBeUndefined();
});
test('ACK during motion never establishes a stale origin; content resize requires reacquisition', async ({ page }) => {
  await prepare(page);
  expect(
    await page.evaluate(() => {
      const w = window as any,
        b = w.engine.createScrollBindings(),
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

test('identical native tokens stay isolated across plugin scopes and teardown', async ({ page }) => {
  await prepare(page, false, false, true);
  await page.evaluate(async () => {
    const w = window as any,
      element = document.createElement('div');
    element.id = 'second';
    element.style.cssText = 'height:40px;width:120px';
    element.textContent = 'Ad slot';
    document.body.append(element);
    const r = element.getBoundingClientRect();
    w.secondScope = w.engine.createWebProjectionScope(element, 'ads');
    w.second = await w.engine.createWebProjection(
      w.secondScope,
      {
        send: async (request: any) =>
          request.action === 'prepare'
            ? { token: 'image', parts: [{ ids: ['ad'], url: 'file:///ad.png', x: r.x, y: r.y, width: r.width, height: r.height }] }
            : { shown: true },
        listen: async () => ({
          remove() {
            w.secondRemoved = true;
          },
        }),
      },
      { wake() {}, blocked: () => false },
    );
    w.second.consider(1, [{ element, control: { id: 'ad', x: r.x, y: r.y, width: r.width, height: r.height } }]);
  });
  await expect(page.locator('#second')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(async () => {
    const w = window as any;
    w.manager.begin();
    w.second.begin();
  });
  await expect(page.locator('#second')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await expect(page.locator('#proxy')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  expect(
    await page.evaluate(() => {
      const first = document.querySelector('#proxy')!,
        second = document.querySelector('#second')!;
      return {
        distinct: first.getAttribute('data-native-ui-snapshot') !== second.getAttribute('data-native-ui-snapshot'),
        first: decodeURIComponent(getComputedStyle(first, '::before').backgroundImage).includes('fill="red"'),
        second: decodeURIComponent(getComputedStyle(second, '::before').backgroundImage).includes('fill="blue"'),
      };
    }),
  ).toEqual({ distinct: true, first: true, second: true });
  await page.evaluate(() => (window as any).manager.destroy());

  await expect(page.locator('#proxy')).not.toHaveAttribute('data-native-ui-snapshot-prepared');
  await expect(page.locator('#proxy')).toBeVisible();
  expect(
    await page.evaluate(() => {
      const w = window as any;
      return {
        owners: w.second.owners.length,
        removed: !!w.secondRemoved,
        opacity: getComputedStyle(document.querySelector('#second')!, '::before').opacity,
      };
    }),
  ).toEqual({ owners: 1, removed: false, opacity: '1' });
});

for (const shared of [false, true])
  test(`delayed cover never exposes pixels before Native is hidden (${shared})`, async ({ page }) => {
    await prepare(page, false, false, false, shared);
    const host = page.locator(shared ? '#projection-host' : '#source');
    await page.evaluate(() => {
      const w = window as any;
      w.holdCover = true;
      w.manager.begin();
    });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(host).not.toHaveAttribute('data-native-ui-snapshot-visible');
    expect(
      await page.evaluate(() => {
        const w = window as any;
        return {
          pending: w.manager.handoffPending,
          visible: w.manager.visibleOwners.length,
          painted: w.calls.some((c: any) => c.action === 'painted'),
        };
      }),
    ).toEqual({ pending: false, visible: 0, painted: false });
    await page.evaluate(() => (window as any).coverReplies.shift()({ shown: true }));
    await expect(host).toHaveAttribute('data-native-ui-snapshot-visible', '');
    await expect.poll(() => page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'painted').length)).toBe(1);
    expect(await page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'prepare').length)).toBe(1);
  });

test('a late cover reply cannot expose a reopened cached image before its own cover succeeds', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => {
    const w = window as any;
    w.holdCover = true;
    w.manager.begin();
    w.manager.end();
    w.manager.updated(undefined, ['counter'], 2);
    w.manager.begin();
    w.coverReplies.shift()({ shown: true });
  });
  await expect(page.locator('#source')).not.toHaveAttribute('data-native-ui-snapshot-visible');
  await page.evaluate(() => (window as any).coverReplies.shift()({ shown: true }));
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  expect(await page.evaluate(() => (window as any).calls.filter((call: any) => call.action === 'prepare').length)).toBe(1);
});

test('cover without a positive acknowledgement restores Web ownership', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => {
    const w = window as any;
    w.holdCover = true;
    w.manager.begin();
    w.coverReplies.shift()({});
  });
  await expect.poll(() => page.evaluate(() => (window as any).manager.owners.length)).toBe(0);
  await expect(page.locator('#source')).not.toHaveAttribute('data-native-ui-snapshot-visible');
  expect(await page.evaluate(() => (window as any).manager.token)).toBeUndefined();
});

test('existing fallback DOM, listeners, values and application updates survive handoff', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => {
    const w = window as any,
      host = w.scope.element;
    w.originalHost = host;
    w.originalButton = host.querySelector('button');
    w.clicks = 0;
    w.originalButton.addEventListener('click', () => w.clicks++);
    host.setAttribute('aria-hidden', 'false');
    const input = document.createElement('input');
    input.value = 'before';
    host.append(input);
    w.originalInput = input;
    w.originalStyle = host.getAttribute('style');
    w.manager.begin();
  });
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() => {
    const w = window as any;
    w.originalInput.value = 'updated';
    w.originalButton.disabled = true;
    w.manager.end();
    w.manager.updated(undefined, ['counter'], 2);
  });
  expect(
    await page.evaluate(() => {
      const w = window as any,
        host = document.querySelector('#source')!;
      return {
        same: host === w.originalHost,
        button: host.querySelector('button') === w.originalButton,
        input: host.querySelector('input') === w.originalInput,
        value: w.originalInput.value,
        disabled: w.originalButton.disabled,
        inert: host.hasAttribute('inert'),
        aria: host.getAttribute('aria-hidden'),
        style: host.getAttribute('style') === w.originalStyle,
      };
    }),
  ).toEqual({ same: true, button: true, input: true, value: 'updated', disabled: true, inert: false, aria: 'false', style: true });
  await page.evaluate(() => {
    (window as any).originalButton.disabled = false;
  });
  await page.locator('#source button').click();
  expect(await page.evaluate(() => (window as any).clicks)).toBe(1);
});

test('fixed fallback follows its renderer-owned parent without recapturing', async ({ page }) => {
  await prepare(page, false, false, true);
  await page.evaluate(() => {
    const w = window as any,
      surface = document.querySelector<HTMLElement>('#surface')!;
    surface.style.transform = 'translate(10px,20px)';
    surface.append(w.scope.element);
    w.manager.begin();
  });
  await expect(page.locator('#proxy')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  expect(await page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'prepare').length)).toBe(1);
  await page.evaluate(() => (window as any).manager.destroy());
  await expect(page.locator('#surface #proxy')).toBeVisible();
});

test('detached fallback cannot be replaced by an unrelated DOM', async ({ page }) => {
  await prepare(page, false, false, true);
  await page.evaluate(() => {
    const w = window as any;
    w.scope.element.remove();
    w.manager.begin();
  });
  expect(await page.evaluate(() => (window as any).calls.some((c: any) => c.action === 'cover'))).toBe(false);
});

test('fallback adopted into another document is rejected on return', async ({ page }) => {
  await prepare(page, false, false, true);
  await page.evaluate(() => (window as any).manager.begin());
  await expect(page.locator('#proxy')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  expect(
    await page.evaluate(() => {
      const w = window as any,
        frame = document.createElement('iframe');
      document.body.append(frame);
      frame.contentDocument!.body.append(w.scope.element);
      w.manager.end();
      return {
        owners: w.manager.owners.length,
        restoring: w.manager.restoring,
        visible: w.scope.element.hasAttribute('data-native-ui-snapshot-visible'),
        restores: w.calls.filter((c: any) => c.action === 'restore').length,
      };
    }),
  ).toEqual({ owners: 0, restoring: false, visible: false, restores: 0 });
});

test('batch uses one capture, listener and cover for multiple fixed fallback DOMs', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const w = window as any,
      first = document.querySelector<HTMLElement>('#source')!,
      second = document.querySelector<HTMLElement>('#other')!;
    second.style.cssText = 'width:120px;height:40px';
    w.calls = [];
    w.listeners = 0;
    w.batch = await w.engine.createWebProjectionBatch(
      {
        send: async (request: any) => {
          w.calls.push(request);
          return request.action === 'prepare'
            ? {
                token: 'batch',
                parts: request.ids.map((id: string) => ({ ids: [id], url: 'file:///pixels', x: 0, y: 0, width: 120, height: 40 })),
              }
            : { shown: true };
        },
        listen: async () => {
          w.listeners++;
          return { remove() {} };
        },
      },
      { wake() {}, blocked: () => false },
    );
    w.batchSources = [first, second].map((element, index) => ({
      scope: w.engine.createWebProjectionScope(element, 'batch'),
      element,
      control: { id: String(index), x: 0, y: 0, width: 120, height: 40 },
    }));
    w.batch.consider(1, w.batchSources);
  });
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await expect(page.locator('#other')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => (window as any).batch.begin());
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await expect(page.locator('#other')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  expect(
    await page.evaluate(() => {
      const w = window as any;
      return {
        listeners: w.listeners,
        captures: w.calls.filter((c: any) => c.action === 'prepare').length,
        covers: w.calls.filter((c: any) => c.action === 'cover').length,
      };
    }),
  ).toEqual({ listeners: 1, captures: 1, covers: 1 });
  await page.evaluate(async () => {
    const w = window as any;
    w.batch.end();
    w.batch.updated(undefined, ['0', '1'], 2);
    await w.batch.destroy();
  });
  await expect(page.locator('#source button')).toBeVisible();
  await expect(page.locator('#other')).not.toHaveAttribute('data-native-ui-snapshot');
});

test('empty batch can begin and be destroyed before a document is known', async ({ page }) => {
  await boot(page);
  expect(
    await page.evaluate(async () => {
      const w = window as any;
      let listeners = 0;
      const batch = await w.engine.createWebProjectionBatch(
        {
          send: async () => ({}),
          listen: async () => {
            listeners++;
            return { remove() {} };
          },
        },
        { wake() {}, blocked: () => false },
      );
      batch.begin();
      batch.end();
      await batch.destroy();
      return listeners;
    }),
  ).toBe(0);
});

test('batch rejects mixed documents and disposes a listener resolved after teardown', async ({ page }) => {
  await boot(page);
  expect(
    await page.evaluate(async () => {
      const w = window as any;
      const source = document.querySelector<HTMLElement>('#source')!;
      const frame = document.createElement('iframe');
      document.body.append(frame);
      const foreign = frame.contentDocument!.body;
      let resolveListener!: (handle: { remove(): void }) => void;
      let removed = 0;
      let sends = 0;
      const batch = await w.engine.createWebProjectionBatch(
        {
          send: async () => {
            sends++;
            return {};
          },
          listen: () =>
            new Promise((resolve) => {
              resolveListener = resolve;
            }),
        },
        { wake() {}, blocked: () => false },
      );
      const candidate = (element: HTMLElement) => ({
        scope: w.engine.createWebProjectionScope(element, 'batch'),
        element,
        control: { id: 'a', x: 0, y: 0, width: 120, height: 40 },
      });
      let rejected = false;
      try {
        batch.consider(1, [candidate(source), candidate(foreign)]);
      } catch {
        rejected = true;
      }
      batch.consider(2, [candidate(source)]);
      let laterRejected = false;
      try {
        batch.consider(3, [candidate(foreign)]);
      } catch {
        laterRejected = true;
      }
      const destroyed = batch.destroy();
      resolveListener({
        remove() {
          removed++;
        },
      });
      await destroyed;
      batch.consider(4, [candidate(source)]);
      return { rejected, laterRejected, removed, sends };
    }),
  ).toEqual({ rejected: true, laterRejected: true, removed: 1, sends: 0 });
});

test('replacing a fallback scope invalidates the old image even with unchanged native geometry', async ({ page }) => {
  await prepare(page);
  await page.evaluate(async () => {
    const w = window as any;
    await w.manager.destroy();
    w.batch = await w.engine.createWebProjectionBatch(
      {
        send: async (request: any) => {
          if (request.action === 'prepare')
            return { token: 'same', parts: [{ ids: ['counter'], url: 'file:///image', ...w.source.control }] };
          return { shown: true };
        },
        listen: async () => ({ remove() {} }),
      },
      { wake() {}, blocked: () => false },
    );
    w.batch.consider(1, [{ ...w.source, scope: w.scope }]);
  });
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => {
    const w = window as any;
    const other = document.querySelector<HTMLElement>('#other')!;
    other.style.cssText = 'width:120px;height:40px';
    w.batch.consider(1, [{ ...w.source, scope: w.engine.createWebProjectionScope(other, 'test') }]);
  });
  await expect(page.locator('#source')).not.toHaveAttribute('data-native-ui-snapshot');
  await expect(page.locator('#other')).toHaveAttribute('data-native-ui-snapshot', /.+/);
});

for (const detached of [false, true]) {
  test(`in-flight capture cannot adopt a replaced scope (old DOM detached: ${detached})`, async ({ page }) => {
    await boot(page);
    await page.evaluate(async () => {
      const w = window as any;
      w.captures = 0;
      w.released = [];
      const source = document.querySelector<HTMLElement>('#source')!;
      const old = document.createElement('div');
      old.id = 'old-fallback';
      old.style.cssText = 'width:120px;height:40px';
      document.body.append(old);
      const fallback = document.querySelector<HTMLElement>('#other')!;
      fallback.style.cssText = old.style.cssText;
      w.old = old;
      w.source = { element: source, control: { id: 'counter', x: 0, y: 0, width: 120, height: 40 } };
      w.batch = await w.engine.createWebProjectionBatch(
        {
          send: async (request: any) => {
            if (request.action === 'release') w.released.push(request.token);
            if (request.action !== 'prepare') return { shown: true };
            const serial = ++w.captures;
            const result = {
              token: String(serial),
              parts: [{ ids: ['counter'], url: 'file:///image', x: 0, y: 0, width: 120, height: 40 }],
            };
            if (serial === 1)
              return new Promise((resolve) => {
                w.finish = () => resolve(result);
              });
            return result;
          },
          listen: async () => ({ remove() {} }),
        },
        { wake() {}, blocked: () => false },
      );
      w.batch.consider(1, [{ ...w.source, scope: w.engine.createWebProjectionScope(old, 'test') }]);
    });
    await expect.poll(() => page.evaluate(() => (window as any).captures)).toBe(1);
    await page.evaluate((detached) => {
      const w = window as any;
      if (detached) w.old.remove();
      w.batch.consider(1, [{ ...w.source, scope: w.engine.createWebProjectionScope(document.querySelector('#other'), 'test') }]);
      w.finish();
    }, detached);
    await expect(page.locator('#other')).toHaveAttribute('data-native-ui-snapshot', /.+/);
    expect(
      await page.evaluate(() => {
        const w = window as any;
        return { old: w.old.hasAttribute('data-native-ui-snapshot'), captures: w.captures, released: w.released };
      }),
    ).toEqual({ old: false, captures: 2, released: ['1'] });
  });
}

test('replaced fallback elements are rejected before native ownership can change', async ({ page }) => {
  await boot(page);
  expect(
    await page.evaluate(() => {
      const w = window as any;
      return ['img', 'input', 'video', 'canvas', 'select', 'textarea', 'iframe'].map((tag) => {
        try {
          w.engine.createWebProjectionScope(document.createElement(tag), 'test');
          return false;
        } catch (error) {
          return error instanceof TypeError;
        }
      });
    }),
  ).toEqual([true, true, true, true, true, true, true]);
});

test('plugin events preserve web projection through updates and ignore other surfaces', async ({ page }) => {
  await prepare(page, false, false, false, false, true);
  await page.evaluate(() => (window as any).eventListeners.transitionStarted({ id: 'other' }));
  await expect(page.locator('#source')).not.toHaveAttribute('data-native-ui-snapshot-visible');
  await page.evaluate(() => (window as any).eventListeners.transitionStarted({ id: 'counter' }));
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() => {
    const w = window as any;
    for (let i = 0; i < 20; i++) w.eventListeners.setColors({ id: 'counter' });
  });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as any).calls.filter((call: any) => call.action === 'prepare').length)).toBe(1);
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() => (window as any).eventListeners.shown({ id: 'counter' }));
  // Notifications never bypass the native draw acknowledgement.
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() => (window as any).manager.updated(undefined, ['counter'], 2));
  await expect(page.locator('#source')).not.toHaveAttribute('data-native-ui-snapshot-visible');
});

test('hidden notification invalidates delayed cover and updates cannot resurrect it', async ({ page }) => {
  await prepare(page, false, false, false, false, true);
  await page.evaluate(() => {
    const w = window as any;
    w.holdCover = true;
    w.eventListeners.transitionStarted({ id: 'counter' });
    w.eventListeners.hidden({ id: 'counter' });
    w.coverReplies.splice(0).forEach((resolve: Function) => resolve({ shown: true }));
    w.eventListeners.setColors({ id: 'counter' });
  });
  await page.waitForTimeout(100);
  await expect(page.locator('#source')).not.toHaveAttribute('data-native-ui-snapshot-visible');
  expect(await page.evaluate(() => (window as any).calls.filter((call: any) => call.action === 'prepare').length)).toBe(1);
  await page.evaluate(() => (window as any).eventListeners.shown({ id: 'counter' }));
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(async () => {
    const w = window as any;
    await w.manager.destroy();
    Object.values(w.eventListeners).forEach((callback: any) => callback({ id: 'counter' }));
  });
  await expect(page.locator('#source')).not.toHaveAttribute('data-native-ui-snapshot');
  expect(await page.evaluate(() => (window as any).removedEvents.sort())).toEqual(['hidden', 'setColors', 'shown', 'transitionStarted']);
});

test('renderer visibility excludes Engine hiding without changing authored visibility or projection ownership', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => {
    const source = document.querySelector('#source') as HTMLElement;
    source.setAttribute('data-native-ui-session-fixture', 'native');
    const style = document.createElement('style');
    style.textContent = '[data-native-ui-session-fixture] { visibility:hidden!important }';
    document.head.append(style);
  });
  const read = () =>
    page.evaluate(() => {
      const source = document.querySelector('#source') as HTMLElement;
      const before = source.outerHTML;
      const visibility = (window as any).engine.getUnprojectedVisibility(source);
      return { visibility, unchanged: before === source.outerHTML, projected: getComputedStyle(source).visibility };
    });
  expect(await read()).toEqual({ visibility: 'visible', unchanged: true, projected: 'hidden' });
  await page.evaluate(() => (document.querySelector<HTMLElement>('#scroll')!.style.visibility = 'hidden'));
  expect(await read()).toEqual({ visibility: 'hidden', unchanged: true, projected: 'hidden' });
  await page.evaluate(() => (document.querySelector<HTMLElement>('#source')!.style.visibility = 'visible'));
  expect(await read()).toEqual({ visibility: 'visible', unchanged: true, projected: 'hidden' });
});
