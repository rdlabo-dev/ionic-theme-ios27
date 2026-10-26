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
const prepare = async (
  page: Page,
  fail = false,
  shadow = false,
  proxy = false,
  shared = false,
  boundary: 'document' | 'surface' | 'shadow' = 'document',
) => {
  await boot(page);
  if (shadow)
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.attachShadow({ mode: 'open' }).append(document.querySelector('main')!);
      document.body.append(host);
      (window as any).sourceRoot = host.shadowRoot;
    });
  await page.evaluate(
    async ({ fail, proxy, shared, boundary }) => {
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
      w.scope = w.kit.createWebProjectionScope(
        boundary === 'surface' ? document.querySelector('#surface') : boundary === 'shadow' ? w.sourceRoot : document,
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
      w.manager = await w.kit.createWebProjection(
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
          resolveURL: () =>
            'data:image/svg+xml,' +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><path fill="red" d="M0 0h120v40H0z"/></svg>',
            ),
        },
        {
          wake() {},
          blocked: () => false,
          revision: () => w.revision,
          transient: boundary === 'surface',
          layer: shared ? document.getElementById('projection-host')! : () => w.projectionLayer,
          target: (source: HTMLElement) =>
            w.targetUnavailable ? undefined : proxy ? document.getElementById('proxy')! : (w.projectionTarget ?? source),
        },
      );
      w.manager.consider(1, [w.source]);
    },
    { fail, proxy, shared, boundary },
  );
  if (!fail) await expect(page.locator(proxy ? '#proxy' : '#source')).toHaveAttribute('data-native-ui-snapshot', /.+/);
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
      w.projectionLayer = document.querySelector('#surface');
      w.manager.begin();
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
  expect(await page.evaluate(() => (window as any).scope.owners.length)).toBe(0);
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
        owners: w.scope.owners.length,
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
        a = w.kit.createWebProjectionScope(document, 'ads'),
        b = w.kit.createWebProjectionScope(document, 'ui'),
        source = document.querySelector('#source');
      a.owners.push(source); // Mutating the returned copy cannot change ownership.
      return [a.owns(source), a.owners.length, b.owners.length, a.sourcesChangedEvent !== b.sourcesChangedEvent];
    }),
  ).toEqual([false, 0, 0, true]);
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
    w.secondScope = w.kit.createWebProjectionScope(document, 'ads');
    w.second = await w.kit.createWebProjection(
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
        resolveURL: () =>
          'data:image/svg+xml,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="blue"/></svg>',
          ),
      },
      { wake() {}, blocked: () => false, target: (source: HTMLElement) => source },
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
        owners: w.secondScope.owners.length,
        removed: !!w.secondRemoved,
        opacity: getComputedStyle(document.querySelector('#second')!, '::before').opacity,
      };
    }),
  ).toEqual({ owners: 1, removed: false, opacity: '1' });
});

for (const surface of [false, true])
  test(`delayed cover does not composite Web pixels over live Native (${surface})`, async ({ page }) => {
    await prepare(page);
    await page.evaluate((surface) => {
      const w = window as any;
      w.holdCover = true;
      w.projectionLayer = surface ? document.querySelector('#surface') : undefined;
      w.manager.begin();
      window.dispatchEvent(new Event(w.scope.targetsChangedEvent));
    }, surface);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(
      await page.evaluate(() => {
        const w = window as any;
        const layer = document.querySelector<HTMLElement>('[data-native-ui-snapshot-layer]');
        return {
          visible: document.querySelector('#source')!.hasAttribute('data-native-ui-snapshot-visible'),
          layerDisplay: layer && getComputedStyle(layer).display,
          pending: w.manager.handoffPending,
          visibleOwners: w.scope.visibleOwners.length,
          painted: w.calls.some((call: any) => call.action === 'painted'),
        };
      }),
    ).toEqual({ visible: false, layerDisplay: surface ? 'none' : null, pending: false, visibleOwners: 0, painted: false });
    await page.evaluate(() => (window as any).coverReplies.shift()({ shown: true }));
    if (surface) await expect(page.locator('[data-native-ui-snapshot-layer] img')).toBeVisible();
    else await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot-visible', '');
    await expect.poll(() => page.evaluate(() => (window as any).calls.filter((call: any) => call.action === 'painted').length)).toBe(1);
    expect(await page.evaluate(() => (window as any).calls.filter((call: any) => call.action === 'prepare').length)).toBe(1);
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
  await expect.poll(() => page.evaluate(() => (window as any).scope.owners.length)).toBe(0);
  await expect(page.locator('#source')).not.toHaveAttribute('data-native-ui-snapshot-visible');
  expect(await page.evaluate(() => (window as any).manager.token)).toBeUndefined();
});

test('initialization-owned projection layer preserves stacking and survives teardown', async ({ page }) => {
  await prepare(page, false, false, false, true);
  await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.id = 'overlay';
    overlay.style.cssText = 'position:absolute;inset:0;z-index:8';
    document.querySelector('#surface')!.append(overlay);
    (window as any).manager.begin();
  });
  await expect(page.locator('#projection-host img')).toBeVisible();
  expect(
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('#projection-host')!;
      return {
        top: document.elementFromPoint(20, 120)?.id,
        zIndex: host.style.zIndex,
        imageZ: getComputedStyle(host.querySelector('[data-native-ui-snapshot-layer]')!).zIndex,
      };
    }),
  ).toEqual({ top: 'overlay', zIndex: '7', imageZ: 'auto' });
  await page.evaluate(async () => {
    const w = window as any;
    w.manager.end();
    w.manager.updated(undefined, ['counter'], 2);
    await w.manager.destroy();
  });
  await expect(page.locator('#projection-host')).toHaveCount(1);
  await expect(page.locator('#projection-host img')).toHaveCount(0);
  await expect(page.locator('#projection-host')).toHaveCSS('z-index', '7');
});

test('missing target or disconnected layer cannot select another projection layer', async ({ page }) => {
  await prepare(page);
  expect(
    await page.evaluate(() => {
      const w = window as any;
      w.projectionLayer = document.createElement('div');
      w.manager.begin();
      const detached = w.manager.token;
      w.projectionLayer = undefined;
      w.targetUnavailable = true;
      w.manager.begin();
      return {
        detached,
        missing: w.manager.token,
        owns: w.scope.owns(w.source.element),
        covers: w.calls.filter((request: any) => request.action === 'cover').length,
      };
    }),
  ).toEqual({ detached: undefined, missing: undefined, owns: false, covers: 0 });
});

test('removing the active target releases ownership instead of relocating the image', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => (window as any).manager.begin());
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot-visible');
  await page.evaluate(() => {
    const w = window as any;
    w.targetUnavailable = true;
    window.dispatchEvent(new Event(w.scope.targetsChangedEvent));
  });
  await expect.poll(() => page.evaluate(() => (window as any).manager.token)).toBeUndefined();
  await expect(page.locator('#source')).not.toHaveAttribute('data-native-ui-snapshot-visible');
  await expect(page.locator('button')).toBeVisible();
});

test('an explicit target can also host the shared projection layer', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => {
    const w = window as any;
    const host = document.createElement('div');
    host.id = 'shared-projection-host';
    host.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none';
    document.querySelector('#surface')!.append(host);
    w.projectionTarget = host;
    window.dispatchEvent(new Event(w.scope.targetsChangedEvent));
    w.projectionLayer = host;
    w.manager.begin();
  });
  await expect(page.locator('#shared-projection-host img')).toBeVisible();
  await page.evaluate(() => (window as any).manager.destroy());
  await expect(page.locator('#shared-projection-host')).toHaveCount(1);
  await expect(page.locator('#shared-projection-host')).not.toHaveAttribute('data-native-ui-snapshot-source');
});

for (const boundary of ['surface', 'shadow'] as const) {
  test(`scope includes its composed DOM and excludes other sources (${boundary})`, async ({ page }) => {
    await prepare(page, false, boundary === 'shadow', true, false, boundary);
    await page.evaluate(() => {
      const w = window as any;
      const outside = document.querySelector('#other')!;
      w.manager.consider(2, [w.source, { ...w.source, element: outside, control: { ...w.source.control, id: 'outside' } }]);
    });
    await expect.poll(() => page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'prepare').length)).toBe(2);
    expect(await page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'prepare').at(-1).ids)).toEqual(['counter']);
    await page.evaluate(() => (window as any).manager.begin());
    // The same-document proxy is outside the source root and must remain usable.
    await expect(page.locator('#proxy')).toHaveAttribute('data-native-ui-snapshot-visible', '');
    await page.evaluate(() => {
      const w = window as any;
      document.querySelector('#other')!.append(w.source.element);
      window.dispatchEvent(new Event(w.scope.targetsChangedEvent));
    });
    await expect.poll(() => page.evaluate(() => (window as any).scope.owners.length)).toBe(0);
    await expect(page.locator('#proxy')).not.toHaveAttribute('data-native-ui-snapshot-visible');
  });
}

test('group members outside the scope cannot acquire ownership', async ({ page }) => {
  await prepare(page, false, false, false, false, 'surface');
  await page.evaluate(() => {
    const w = window as any;
    w.manager.invalidate();
    w.calls.length = 0;
    w.manager.consider(2, [{ ...w.source, sources: [document.querySelector('#other')] }]);
  });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as any).calls.some((c: any) => c.action === 'prepare'))).toBe(false);
});

for (const destination of ['target', 'layer'] as const) {
  test(`connected ${destination} from another document cannot receive pixels`, async ({ page }) => {
    await prepare(page);
    await page.evaluate((destination) => {
      const w = window as any;
      const frame = document.createElement('iframe');
      document.body.append(frame);
      const foreign = frame.contentDocument!.body;
      if (destination === 'target') {
        w.projectionTarget = foreign;
        window.dispatchEvent(new Event(w.scope.targetsChangedEvent));
      } else w.projectionLayer = foreign;
      w.manager.begin();
    }, destination);
    expect(
      await page.evaluate(() => ({
        token: (window as any).manager.token,
        owners: (window as any).scope.owners.length,
        covers: (window as any).calls.filter((c: any) => c.action === 'cover').length,
        foreign: document.querySelector('iframe')!.contentDocument!.querySelectorAll('[data-native-ui-snapshot],img').length,
      })),
    ).toEqual({ token: undefined, owners: 0, covers: 0, foreign: 0 });
  });
}

test('scope rejects cross-document target registration and follows shadow hosts', async ({ page }) => {
  await boot(page);
  expect(
    await page.evaluate(() => {
      const w = window as any,
        host = document.createElement('div');
      document.querySelector('#surface')!.append(host);
      const shadow = host.attachShadow({ mode: 'open' }),
        source = document.createElement('button');
      shadow.append(source);
      const scope = w.kit.createWebProjectionScope(document.querySelector('#surface'), 'root');
      const frame = document.createElement('iframe');
      document.body.append(frame);
      let rejected = false;
      try {
        scope.setTarget(source, frame.contentDocument!.body);
      } catch {
        rejected = true;
      }
      return { contained: scope.contains(source), outside: scope.contains(document.querySelector('#other')), rejected };
    }),
  ).toEqual({ contained: true, outside: false, rejected: true });
});

test('returning after a source leaves the scope abandons without native restore', async ({ page }) => {
  await prepare(page, false, false, false, false, 'surface');
  await page.evaluate(() => (window as any).manager.begin());
  await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() => {
    const w = window as any;
    document.querySelector('#other')!.append(w.source.element);
    w.manager.changed();
    w.manager.end();
  });
  expect(
    await page.evaluate(() => {
      const w = window as any;
      return {
        owners: w.scope.owners.length,
        restoring: w.manager.restoring,
        restores: w.calls.filter((c: any) => c.action === 'restore').length,
      };
    }),
  ).toEqual({ owners: 0, restoring: false, restores: 0 });
  await expect(page.locator('#source')).not.toHaveAttribute('data-native-ui-snapshot-visible');
});
