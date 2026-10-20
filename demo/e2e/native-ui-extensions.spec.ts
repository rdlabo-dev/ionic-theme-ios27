import { expect, test } from '@playwright/test';
import { buildSync } from 'esbuild';

const bundle = buildSync({
  stdin: {
    contents:
      "export { createRuntime } from '../../packages/capacitor-native-ui/src/native/runtime'; export { defineNativeUI } from '../../packages/capacitor-native-ui/src/native/extensions';",
    resolveDir: __dirname,
  },
  bundle: true,
  format: 'iife',
  globalName: 'extensions',
  write: false,
}).outputFiles[0].text;

test.beforeEach(async ({ page }) => {
  await page.setContent(
    '<ion-app><section data-counter data-count="0" style="width:240px;height:60px"><button>Increment</button><span>Counter</span></section></ion-app>',
  );
  await page.addScriptTag({ content: bundle });
  await page.evaluate(async () => {
    const w = window as any;
    const source = document.querySelector<HTMLElement>('[data-counter]')!;
    source.querySelector('button')!.addEventListener('click', () => {
      source.dataset.count = String(Number(source.dataset.count) + 1);
    });
    w.snapshots = [];
    w.replies = [];
    w.reject = false;
    w.badReader = false;
    w.externalTarget = false;
    w.events = {};
    w.extension = w.extensions.defineNativeUI({
      name: 'app.counter',
      selector: '[data-counter]',
      read(element: HTMLElement) {
        if (w.badReader) throw new Error('Invalid app state');
        return {
          props: w.scalarProps ? 42 : { count: Number(element.dataset.count) },
          actions: { increment: w.externalTarget ? document.body : element.querySelector('button') },
        };
      },
    });
    w.plugin = {
      async addListener(name: string, listener: Function) {
        w.events[name] = listener;
        return { remove: async () => delete w.events[name] };
      },
      async update(snapshot: any) {
        w.snapshots.push(snapshot);
        return { revision: snapshot.revision, rejectedControls: w.reject ? snapshot.controls.map((c: any) => c.id) : [] };
      },
      async clear() {},
      async completeExtensionAction(reply: any) {
        w.replies.push(reply);
      },
    };
    w.handle = await w.extensions.createRuntime(document, w.plugin, { controls: {}, extensions: [w.extension] });
    w.tap = () => {
      const snapshot = w.snapshots.at(-1);
      const control = snapshot.controls.find((c: any) => c.kind === 'extension');
      w.events.activate({
        revision: snapshot.revision,
        id: control.extension.actions.increment,
        sequence: w.replies.length + 1,
        requestId: `request-${w.replies.length}`,
      });
    };
  });
  await expect(page.locator('[data-counter]')).toHaveAttribute('data-native-ui-projected', '');
});

test('projects an app-local reader, dispatches to Web once, and synchronizes new props', async ({ page }) => {
  await page.evaluate(() => (window as any).tap());
  await expect(page.locator('[data-counter]')).toHaveAttribute('data-count', '1');
  await expect.poll(() => page.evaluate(() => (window as any).replies)).toEqual([{ requestId: 'request-0', accepted: true }]);
  await expect.poll(() => page.evaluate(() => JSON.parse((window as any).snapshots.at(-1).controls[0].extension.props).count)).toBe(1);
});

test('revalidates disabled actions before dispatch', async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector('button')!.disabled = true;
    (window as any).tap();
  });
  await expect(page.locator('[data-counter]')).toHaveAttribute('data-count', '0');
  await expect.poll(() => page.evaluate(() => (window as any).replies[0]?.accepted)).toBe(false);
});

for (const shadow of [false, true]) {
  test(`clipped element projections return to Web and recover on ${shadow ? 'shadow' : 'light'} DOM scroll`, async ({ page }) => {
    await page.evaluate((shadow) => {
      const source = document.querySelector<HTMLElement>('[data-counter]')!;
      const host = document.createElement('div');
      source.before(host);
      const scroller = document.createElement('div');
      scroller.id = 'scroller';
      scroller.style.cssText = 'position:absolute;top:100px;left:10px;width:300px;height:80px;overflow:auto';
      source.style.marginTop = '100px';
      const tail = document.createElement('div');
      tail.style.height = '200px';
      if (shadow) {
        host.id = 'scroll-host';
        host.attachShadow({ mode: 'open' }).append(scroller);
        scroller.append(document.createElement('slot'), tail);
        host.append(source);
      } else {
        host.append(scroller);
        scroller.append(source, tail);
      }
    }, shadow);
    const source = page.locator('[data-counter]');
    await expect(source).not.toHaveAttribute('data-native-ui-projected', '');
    // Fully outside, partially clipped, then fully inside the same scroll container.
    await page.locator('#scroller').evaluate((element) => {
      element.scrollTop = 70;
    });
    await expect(source).not.toHaveAttribute('data-native-ui-projected', '');
    await page.locator('#scroller').evaluate((element) => {
      element.scrollTop = 100;
    });
    await expect(source).toHaveAttribute('data-native-ui-projected', '');
    await page.evaluate(() => (window as any).tap());
    await expect(source).toHaveAttribute('data-count', '1');
    await page.locator('#scroller').evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(source).not.toHaveAttribute('data-native-ui-projected', '');
  });
}

for (const failure of ['native-rejection', 'reader-error', 'outside-action', 'invalid-props', 'scalar-props']) {
  test(`returns to Web on ${failure} without stopping the shell`, async ({ page }) => {
    await page.evaluate((failure) => {
      const w = window as any;
      w.reject = failure === 'native-rejection';
      w.badReader = failure === 'reader-error';
      w.externalTarget = failure === 'outside-action';
      w.scalarProps = failure === 'scalar-props';
      document.querySelector<HTMLElement>('[data-counter]')!.dataset.count = failure === 'invalid-props' ? 'NaN' : '2';
    }, failure);
    await expect(page.locator('[data-counter]')).not.toHaveAttribute('data-native-ui-projected', '');
    expect(await page.evaluate(() => (window as any).handle.getStatus().state)).not.toBe('stopped');
  });
}

test('overlay, manual suspension and teardown restore Web ownership', async ({ page }) => {
  await page.evaluate(() => {
    const overlay = document.createElement('ion-alert');
    document.body.append(overlay);
    overlay.dispatchEvent(new Event('ionAlertWillPresent', { bubbles: true }));
  });
  await expect(page.locator('[data-counter]')).not.toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => {
    const overlay = document.querySelector('ion-alert')!;
    overlay.dispatchEvent(new Event('ionAlertDidDismiss', { bubbles: true }));
    overlay.remove();
  });
  await expect(page.locator('[data-counter]')).toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(async () => {
    (window as any).lease = await (window as any).handle.suspend();
  });
  await expect(page.locator('[data-counter]')).not.toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => (window as any).lease.resume());
  await expect(page.locator('[data-counter]')).toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => (window as any).handle.destroy());
  await expect(page.locator('[data-counter]')).not.toHaveAttribute('aria-hidden', 'true');
  expect(await page.evaluate(() => Object.keys((window as any).events))).toEqual([]);
});

test('an accessory waits for its native tab owner and recovers after competing sources disappear', async ({ page }) => {
  await page.evaluate(async () => {
    const w = window as any;
    await w.handle.destroy();
    const app = document.querySelector('ion-app')!;
    app.classList.add('ios-theme-vertical-bars');
    const source = document.querySelector('[data-counter]')!;
    const tabs = document.createElement('ion-tabs');
    app.append(tabs);
    tabs.append(source);
    const bar = document.createElement('ion-tab-bar');
    bar.style.cssText = 'display:flex;width:200px;height:50px';
    tabs.append(bar);
    w.handle = await w.extensions.createRuntime(document, w.plugin, {
      controls: { tabs: true },
      extensions: [{ ...w.extension, placement: 'tab-accessory' }],
    });
  });
  await expect(page.locator('[data-counter]')).not.toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => {
    document.querySelector('ion-tab-bar')!.innerHTML =
      '<ion-tab-button style="display:block;width:100px;height:50px">Home</ion-tab-button>';
  });
  await expect(page.locator('[data-counter]')).toHaveAttribute('data-native-ui-projected', '');
  await page.evaluate(() => {
    const source = document.querySelector('[data-counter]')!;
    const clone = source.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-native-ui-projected');
    clone.removeAttribute('aria-hidden');
    clone.id = 'competing';
    source.after(clone);
  });
  await expect(page.locator('[data-counter]').first()).not.toHaveAttribute('data-native-ui-projected', '');
  await expect(page.locator('#competing')).not.toHaveAttribute('data-native-ui-projected', '');
  await page.locator('#competing').evaluate((element) => element.remove());
  await expect(page.locator('[data-counter]')).toHaveAttribute('data-native-ui-projected', '');
});
