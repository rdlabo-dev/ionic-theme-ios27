import { expect, test } from '@playwright/test';
import { buildSync } from 'esbuild';
const bundle = buildSync({
  entryPoints: ['src/native-session.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'sessionEngine',
  write: false,
}).outputFiles[0].text;
const boot = async (page: import('@playwright/test').Page, present = true) => {
  await page.setContent(present ? '<div id="slot" style="width:120px;height:40px"><button>Fallback</button></div>' : '<main></main>');
  await page.evaluate(() => {
    (window as any).Capacitor = {
      convertFileSrc: () => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"/>'),
    };
  });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(async () => {
    const w = window as any;
    w.calls = [];
    w.events = {};
    w.removed = [];
    w.pendingResume = [];
    w.session = await w.sessionEngine.startNativeSession(
      {
        id: 'surface',
        plugin: 'Example',
        fallbackSelector: '#slot',
        receiveListeners: {
          update: ['updated'],
          projection: { native: ['shown'], web: ['moving'], none: ['hidden'] },
          match: { slot: 1 },
        },
      },
      {
        send: async (request: any) => {
          w.calls.push(request);
          if (request.action === 'prepare')
            return { token: 'pixels', parts: [{ ids: ['view'], url: 'file:///pixels.png', x: 8, y: 8, width: 120, height: 40 }] };
          if (request.action === 'resume' && w.holdResume) return new Promise((resolve) => w.pendingResume.push(resolve));
          if (request.action === 'cover' || request.action === 'restore') return { shown: true };
          return {};
        },
        listen: async () => ({ remove() {} }),
      },
      {
        addListener: async (name: string, callback: Function) => {
          w.events[name] = callback;
          return {
            remove() {
              w.removed.push(name);
            },
          };
        },
      },
    );
  });
};

test('native startup waits for a corresponding DOM and owns subscription teardown', async ({ page }) => {
  await boot(page, false);
  await page.evaluate(() => {
    const slot = document.createElement('div');
    slot.id = 'slot';
    slot.style.cssText = 'width:120px;height:40px';
    document.body.append(slot);
  });
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(async () => {
    await (window as any).session.destroy();
  });
  await expect(page.locator('#slot')).not.toHaveAttribute('data-native-ui-snapshot');
  expect(await page.evaluate(() => (window as any).removed.sort())).toEqual(['hidden', 'moving', 'shown', 'updated']);
});

test('event-driven return retains pixels until the engine receives native draw completion', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => (window as any).events.moving({ slot: 1 }));
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() => {
    const w = window as any;
    w.holdResume = true;
    w.events.shown({ slot: 1 });
  });
  await expect.poll(() => page.evaluate(() => (window as any).pendingResume.length)).toBe(1);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() => (window as any).pendingResume.shift()({}));
  await expect(page.locator('#slot')).not.toHaveAttribute('data-native-ui-snapshot-visible');
});

test('a late native draw completion cannot resurrect a hidden surface', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => {
    const w = window as any;
    w.events.moving({ slot: 1 });
  });
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() => {
    const w = window as any;
    w.holdResume = true;
    w.events.shown({ slot: 1 });
  });
  await expect.poll(() => page.evaluate(() => (window as any).pendingResume.length)).toBe(1);
  await page.evaluate(() => {
    const w = window as any;
    w.events.hidden({ slot: 1 });
    w.events.updated({ slot: 1 });
    w.pendingResume.shift()({});
  });
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'none');
  await expect(page.locator('#slot')).not.toHaveAttribute('data-native-ui-snapshot-visible');
});

test('replacing a DOM creates a new fixed scope; another slot event cannot move it', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => {
    const w = window as any;
    w.old = document.querySelector('#slot');
    const replacement = document.createElement('div');
    replacement.id = 'slot';
    replacement.style.cssText = 'width:120px;height:40px';
    w.old.replaceWith(replacement);
  });
  await expect.poll(() => page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'prepare').length)).toBe(2);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  expect(await page.evaluate(() => (window as any).old.hasAttribute('data-native-ui-snapshot'))).toBe(false);
  await page.evaluate(() => (window as any).events.moving({ slot: 2 }));
  await expect(page.locator('#slot')).not.toHaveAttribute('data-native-ui-snapshot-visible');
});

test('automatic scroll restoration cannot override explicit none', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => {
    const owner = document.createElement('div');
    owner.id = 'scroll';
    owner.style.cssText = 'height:80px;width:160px;overflow:auto';
    const content = document.createElement('div');
    content.style.height = '800px';
    content.append(document.querySelector('#slot')!);
    owner.append(content);
    document.body.append(owner);
    (window as any).events.updated({ slot: 1 });
  });
  await expect.poll(() => page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'prepare').length)).toBe(2);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => {
    document.querySelector('#scroll')!.scrollTop = 20;
  });
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() => (window as any).events.hidden({ slot: 1 }));
  await page.waitForTimeout(150);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'none');
  await expect(page.locator('#slot')).not.toHaveAttribute('data-native-ui-snapshot-visible');
  expect(await page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'resume').length)).toBe(0);
});
