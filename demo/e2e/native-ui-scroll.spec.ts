import { expect, test } from '@playwright/test';
import { buildSync } from 'esbuild';

const bundle = buildSync({
  stdin: {
    contents:
      "export { createRuntime } from '../../packages/capacitor-native-ui/src/native/runtime'; export { createCoveredSnapshots } from '../../packages/capacitor-native-ui/src/native/shared/covered-snapshot'; export { Capacitor } from '@capacitor/core';",
    resolveDir: __dirname,
  },
  bundle: true,
  format: 'iife',
  globalName: 'nativeScrollTest',
  write: false,
}).outputFiles[0].text;

for (const shadow of [false, true]) {
  test(`native-owned scroll preserves actions and skips layout updates (${shadow ? 'shadow' : 'light'} DOM)`, async ({ page }) => {
    await page.setContent('<main></main>');
    await page.addScriptTag({ content: bundle });
    await page.evaluate(async (shadow) => {
      const w = window as any;
      const host = document.querySelector('main')!;
      const root = shadow ? host.attachShadow({ mode: 'open' }) : host;
      root.innerHTML = '<div id="scroll" style="height:180px;width:300px;overflow:auto;border:3px solid"><slot></slot></div>';
      const scroll = root.querySelector<HTMLElement>('#scroll')!;
      const content = document.createElement('section');
      content.innerHTML =
        '<div style="height:60px"></div><div data-counter style="height:60px;width:240px"><button>Increment</button></div><div data-accessory style="width:240px;height:60px">Web accessory</div><div style="height:1500px"></div>';
      if (shadow) host.append(content);
      else scroll.append(content);
      w.scroll = scroll;
      w.holdSettled = true;
      const hold = (event: Event) => {
        if (w.holdSettled) event.stopImmediatePropagation();
      };
      window.addEventListener('scrollend', hold, true);
      if (shadow) root.addEventListener('scrollend', hold, true);
      w.updates = [];
      w.reads = 0;
      w.events = {};
      w.replies = [];
      w.count = 0;
      content.querySelector('button')!.onclick = () => {
        w.count++;
        content.querySelector('[data-counter]')!.setAttribute('data-count', String(w.count));
      };
      w.handle = await w.nativeScrollTest.createRuntime(
        document,
        {
          async addListener(name: string, listener: Function) {
            w.events[name] = listener;
            return { remove() {} };
          },
          async update(snapshot: any) {
            w.updates.push(snapshot);
            return { revision: snapshot.revision, rejectedControls: w.reject ? snapshot.controls.map((c: any) => c.id) : [] };
          },
          async clear() {},
          async completeExtensionAction(reply: any) {
            w.replies.push(reply);
          },
        },
        {
          controls: {},
          nativeScroll: true,
          extensions: [
            {
              name: 'counter',
              selector: '[data-counter]',
              scrollElement: () => scroll,
              read(element: HTMLElement) {
                w.reads++;
                return { props: { count: w.count }, actions: { increment: element.querySelector('button') } };
              },
            },
            { name: 'accessory', selector: '[data-accessory]', placement: 'tab-accessory', read: () => ({ props: {} }) },
          ],
        },
      );
    }, shadow);
    await expect(page.locator('[data-counter]')).toHaveAttribute('data-native-ui-projected', '');
    await page.waitForTimeout(200);
    const baseline = await page.evaluate(() => {
      const w = window as any;
      return { updates: w.updates.length, reads: w.reads, frame: w.updates.at(-1).controls[0].scroll.frame };
    });
    expect(baseline.frame.y).toBe(60);
    await page.evaluate(async () => {
      const w = window as any;
      for (const y of [20, 50, 90, 150, 250, 80]) {
        w.scroll.scrollTop = y;
        await new Promise(requestAnimationFrame);
      }
    });
    await page.waitForTimeout(100);
    expect(
      await page.evaluate(() => {
        const w = window as any;
        return { updates: w.updates.length, reads: w.reads };
      }),
    ).toEqual({ updates: baseline.updates, reads: baseline.reads });
    await page.evaluate(() => {
      const w = window as any;
      w.holdSettled = false;
      w.scroll.dispatchEvent(new Event('scrollend'));
    });
    await expect.poll(() => page.evaluate(() => (window as any).updates.length)).toBe(baseline.updates + 1);
    expect(await page.evaluate(() => (window as any).updates.at(-1).controls[0].scroll.reuse)).toBe(true);
    // Count is partially clipped; its surviving native action must remain usable.
    await page.evaluate(() => {
      const w = window as any,
        snapshot = w.updates.at(-1),
        node = snapshot.controls[0];
      w.events.activate({ revision: snapshot.revision, id: node.extension.actions.increment, sequence: 1, requestId: 'increment' });
    });
    await expect.poll(() => page.evaluate(() => (window as any).count)).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).replies)).toEqual([{ requestId: 'increment', accepted: true }]);
    await expect.poll(() => page.evaluate(() => JSON.parse((window as any).updates.at(-1).controls[0].extension.props).count)).toBe(1);
    // Rejected bindings restore the source and ordinary scroll reconciliation.
    await page.evaluate(() => {
      const w = window as any;
      w.reject = true;
      w.count = 2;
      document.querySelector('[data-counter]')!.setAttribute('data-count', '2');
    });
    await expect(page.locator('[data-counter]')).not.toHaveAttribute('data-native-ui-projected', '');
    await page.evaluate(() => {
      const w = window as any;
      w.reject = false;
      w.scroll.scrollTop = 0;
    });
    await expect(page.locator('[data-counter]')).toHaveAttribute('data-native-ui-projected', '');
  });
}

test('unsupported layouts and older native binaries keep usable Web content', async ({ page }) => {
  await page.setContent(
    '<div id="scroll" style="height:200px;width:300px;overflow:auto"><div data-counter style="height:60px;width:200px"><button>Increment</button></div><div style="height:1000px"></div></div>',
  );
  await page.addScriptTag({ content: bundle });
  await page.evaluate(async () => {
    const w = window as any;
    const scroll = document.querySelector<HTMLElement>('#scroll')!;
    const plugin = {
      async addListener() {
        return { remove() {} };
      },
      async update(snapshot: any) {
        return { revision: snapshot.revision };
      },
      async clear() {},
    };
    const extensions = [{ name: 'counter', selector: '[data-counter]', scrollElement: () => scroll, read: () => ({ props: {} }) }];
    w.handle = await w.nativeScrollTest.createRuntime(document, plugin, { controls: {}, extensions });
    w.start = async () => {
      await w.handle.destroy();
      w.handle = await w.nativeScrollTest.createRuntime(document, plugin, { controls: {}, extensions, nativeScroll: true });
    };
  });
  await page.waitForTimeout(150);
  await expect(page.locator('[data-counter]')).not.toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(async () => {
    document.querySelector<HTMLElement>('#scroll')!.style.transform = 'translateY(5px)';
    await (window as any).start();
  });
  await page.waitForTimeout(150);
  await expect(page.locator('[data-counter]')).not.toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#scroll')!.style.transform = '';
  });
  await expect(page.locator('[data-counter]')).toHaveAttribute('data-native-ui-projected', '');
  for (const [property, value] of [
    ['translate', '0px 5px'],
    ['border-radius', '12px'],
    ['clip-path', 'inset(2px)'],
  ]) {
    await page.evaluate(
      ([property, value]) => document.querySelector<HTMLElement>('#scroll')!.style.setProperty(property, value),
      [property, value],
    );
    await expect(page.locator('[data-counter]')).not.toHaveAttribute('data-native-ui-projected', '');
    await page.evaluate((property) => document.querySelector<HTMLElement>('#scroll')!.style.removeProperty(property), property);
    await expect(page.locator('[data-counter]')).toHaveAttribute('data-native-ui-projected', '');
  }
});

test('RTL horizontal coordinates retain CSS offsets for native RTL origin conversion', async ({ page }) => {
  await page.setContent(
    '<div id="scroll" style="width:300px;height:180px;overflow:auto;direction:rtl"><section style="width:1200px;height:1200px"><div data-counter style="width:240px;height:60px">Count</div></section></div>',
  );
  await page.addScriptTag({ content: bundle });
  await page.evaluate(async () => {
    const w = window as any;
    w.updates = [];
    w.scroll = document.querySelector('#scroll');
    w.handle = await w.nativeScrollTest.createRuntime(
      document,
      {
        async addListener() {
          return { remove() {} };
        },
        async update(snapshot: any) {
          w.updates.push(snapshot);
          return { revision: snapshot.revision };
        },
        async clear() {},
      },
      {
        controls: {},
        nativeScroll: true,
        extensions: [{ name: 'counter', selector: '[data-counter]', scrollElement: () => w.scroll, read: () => ({ props: {} }) }],
      },
    );
  });
  await expect(page.locator('[data-counter]')).toHaveAttribute('data-native-ui-projected', '');
  expect(await page.evaluate(() => (window as any).updates.at(-1).controls[0].scroll.frame.x)).toBe(60);
  await page.evaluate(async () => {
    const w = window as any;
    w.scroll.scrollLeft = -150;
    await w.handle.markForCheck();
  });
  await expect.poll(() => page.evaluate(() => (window as any).updates.at(-1).controls[0].x)).toBe(218);
  expect(await page.evaluate(() => (window as any).updates.at(-1).controls[0].scroll.frame.x)).toBe(60);
});

for (const resize of [false, true]) {
  test(`motion during ${resize ? 'resized' : 'initial'} acknowledgement keeps Web until a fresh settled binding`, async ({ page }) => {
    await page.setContent(
      '<div id="scroll" style="height:200px;width:300px;overflow:auto"><div data-counter style="height:60px">Count</div><div style="height:1000px"></div></div>',
    );
    await page.addScriptTag({ content: bundle });
    await page.evaluate(async (resize) => {
      const w = window as any;
      const owner = document.querySelector<HTMLElement>('#scroll')!;
      w.updates = [];
      w.hold = true;
      window.addEventListener(
        'scrollend',
        (e) => {
          if (w.hold) e.stopImmediatePropagation();
        },
        true,
      );
      w.handle = await w.nativeScrollTest.createRuntime(
        document,
        {
          async addListener() {
            return { remove() {} };
          },
          async clear() {},
          async update(snapshot: any) {
            w.updates.push(snapshot);
            if (w.updates.length === (resize ? 2 : 1))
              await new Promise((resolve) => {
                w.ack = resolve;
              });
            return { revision: snapshot.revision };
          },
        },
        {
          controls: {},
          nativeScroll: true,
          extensions: [{ name: 'counter', selector: '[data-counter]', scrollElement: () => owner, read: () => ({ props: {} }) }],
        },
      );
    }, resize);
    if (resize) {
      await expect(page.locator('[data-counter]')).toHaveAttribute('data-native-ui-projected', '');
      await page.locator('#scroll > div:last-child').evaluate((element) => {
        (element as HTMLElement).style.height = '1200px';
      });
    }
    await expect.poll(() => page.evaluate(() => typeof (window as any).ack)).toBe('function');
    await page.evaluate(() => {
      const w = window as any,
        owner = document.querySelector<HTMLElement>('#scroll')!;
      owner.scrollTop = 40;
      owner.dispatchEvent(new Event('scroll'));
      w.ack();
    });
    await expect.poll(() => page.evaluate(() => (window as any).updates.length)).toBeGreaterThan(resize ? 2 : 1);
    await expect(page.locator('[data-counter]')).not.toHaveAttribute('data-native-ui-projected', '');
    expect(await page.evaluate(() => (window as any).updates.at(-1).controls)).toEqual([]);
    await page.evaluate(() => {
      (window as any).hold = false;
      document.querySelector('#scroll')!.dispatchEvent(new Event('scrollend'));
    });
    await expect(page.locator('[data-counter]')).toHaveAttribute('data-native-ui-projected', '');
    expect(await page.evaluate(() => (window as any).updates.at(-1).controls[0].scroll.reuse)).toBe(false);
  });
}

for (const related of [true, false]) {
  test(`prepared image ${related ? 'expires with its scroll owner' : 'survives unrelated scrolling'}`, async ({ page }) => {
    await page.setContent(
      '<main id="surface" style="position:relative"><div id="scroll" style="height:300px;width:300px;overflow:auto"><div style="height:100px"></div><div id="source" style="height:40px;width:120px">Count</div><div style="height:900px"></div></div></main><div id="other"></div>',
    );
    await page.addScriptTag({ content: bundle });
    await page.evaluate(async () => {
      const w = window as any,
        source = document.querySelector<HTMLElement>('#source')!,
        owner = document.querySelector<HTMLElement>('#scroll')!;
      const r = source.getBoundingClientRect(),
        v = owner.getBoundingClientRect();
      w.nativeScrollTest.Capacitor.convertFileSrc = () =>
        'data:image/svg+xml,' +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><path fill="red" d="M0 0h120v40H0z"/></svg>');
      w.calls = [];
      w.manager = await w.nativeScrollTest.createCoveredSnapshots(
        document,
        {
          coveredSnapshot: async (args: any) => {
            w.calls.push(args);
            return args.action === 'prepare'
              ? {
                  token: 'snapshot',
                  parts: [{ ids: ['counter'], url: 'file:///image.png', x: r.x, y: r.y, width: r.width, height: r.height }],
                }
              : { shown: true };
          },
        },
        async () => ({ remove() {} }),
        { wake() {}, blocked: () => false },
      );
      w.manager.consider(1, [
        {
          element: source,
          scrollElement: owner,
          actions: new Map(),
          icons: [],
          control: {
            id: 'counter',
            kind: 'extension',
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            items: [],
            dark: false,
            rtl: false,
            scroll: { clip: { x: v.x, y: v.y, width: v.width, height: v.height } },
          },
        },
      ]);
    });
    await expect(page.locator('#source')).toHaveAttribute('data-native-ui-snapshot', /.+/);
    const result = await page.evaluate((related) => {
      const w = window as any,
        owner = document.querySelector<HTMLElement>('#scroll')!;
      if (related) owner.scrollTop = 50;
      w.manager.changed(related ? owner : document.querySelector('#other'));
      w.manager.begin(document.querySelector('#surface'));
      return {
        layers: w.manager.owners.length,
        captures: w.calls.filter((c: any) => c.action === 'prepare').length,
      };
    }, related);
    expect(result).toEqual({ layers: related ? 0 : 1, captures: 1 });
  });
}

for (const retryRejected of [false, true]) {
  test(`lost native scroll binding ${retryRejected ? 'stays usable on Web after one failed reacquisition' : 'reacquires once through the normal acknowledgement'}`, async ({
    page,
  }) => {
    await page.setContent(
      '<div id="scroll" style="height:200px;width:300px;overflow:auto"><div data-counter style="height:60px">Count</div><div style="height:1000px"></div></div>',
    );
    await page.addScriptTag({ content: bundle });
    await page.evaluate(async (retryRejected) => {
      const w = window as any,
        owner = document.querySelector<HTMLElement>('#scroll')!;
      w.updates = [];
      w.handle = await w.nativeScrollTest.createRuntime(
        document,
        {
          async addListener() {
            return { remove() {} };
          },
          async clear() {},
          async update(snapshot: any) {
            w.updates.push(snapshot);
            if (w.updates.length === 3)
              await new Promise((resolve) => {
                w.retryAck = resolve;
              });
            const reject = w.updates.length === 2 || (retryRejected && w.updates.length === 3);
            return { revision: snapshot.revision, rejectedControls: reject ? snapshot.controls.map((c: any) => c.id) : [] };
          },
        },
        {
          controls: {},
          nativeScroll: true,
          extensions: [
            {
              name: 'counter',
              selector: '[data-counter]',
              scrollElement: () => owner,
              read: (element: HTMLElement) => ({ props: { count: element.dataset['count'] ?? '0' } }),
            },
          ],
        },
      );
    }, retryRejected);
    await expect(page.locator('[data-counter]')).toHaveAttribute('data-native-ui-projected', '');
    await page.locator('[data-counter]').evaluate((element) => element.setAttribute('data-count', '1'));
    await expect.poll(() => page.evaluate(() => (window as any).updates.length)).toBeGreaterThanOrEqual(3);
    const reuses = await page.evaluate(() => (window as any).updates.slice(0, 3).map((s: any) => s.controls[0]?.scroll.reuse));
    expect(reuses).toEqual([false, true, false]);
    await expect(page.locator('[data-counter]')).not.toHaveAttribute('data-native-ui-projected', '');
    await page.evaluate(() => (window as any).retryAck());
    if (retryRejected) {
      await expect(page.locator('[data-counter]')).not.toHaveAttribute('data-native-ui-projected', '');
      await expect.poll(() => page.evaluate(() => (window as any).updates.at(-1).controls)).toEqual([]);
    } else {
      await expect(page.locator('[data-counter]')).toHaveAttribute('data-native-ui-projected', '');
    }
    const count = await page.evaluate(() => (window as any).updates.length);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => (window as any).updates.length)).toBe(count);
  });
}
