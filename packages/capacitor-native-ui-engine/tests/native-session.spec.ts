import { expect, test } from '@playwright/test';
import { buildSync } from 'esbuild';
const bundle = buildSync({
  entryPoints: ['src/native-session.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'sessionEngine',
  write: false,
}).outputFiles[0].text;
const boot = async (page: import('@playwright/test').Page, present = true, projectionSelector = '#slot') => {
  await page.setContent(present ? '<div id="slot" style="width:120px;height:40px"><button>Fallback</button></div>' : '<main></main>');
  await page.evaluate(() => {
    (window as any).Capacitor = {
      convertFileSrc: () => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"/>'),
    };
  });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(async (projectionSelector) => {
    const w = window as any;
    w.calls = [];
    w.events = {};
    w.removed = [];
    w.pendingResume = [];
    w.pendingHide = [];
    w.session = await w.sessionEngine.startNativeSession(
      {
        id: 'surface',
        plugin: 'Example',
        projectionSelector,
        receiveListeners: {
          update: ['updated'],
          projection: { native: ['shown'], web: ['moving'], none: ['hidden'] },
          match: { slot: 1 },
        },
      },
      {
        send: async (request: any) => {
          w.calls.push(request);
          if (request.action === 'visibility' && !request.visible && w.holdHide) {
            w.holdHide = false;
            return new Promise((resolve) => w.pendingHide.push(resolve));
          }
          if (request.action === 'track' && w.failTrack) throw new Error('Tracking reply unavailable');
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
  }, projectionSelector);
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

test('a custom element host binds and unbinds when its selector attributes change', async ({ page }) => {
  await boot(page, false, 'native-ad[placement="home"]');
  await expect.poll(() => page.evaluate(() => (window as any).calls.at(-1))).toEqual({ action: 'visibility', visible: false });
  const waitingCalls = await page.evaluate(() => (window as any).calls.length);
  await page.evaluate(() => {
    const slot = document.createElement('native-ad');
    slot.style.cssText = 'display:block;width:120px;height:40px';
    slot.attachShadow({ mode: 'open' }).innerHTML = '<button>Ad fallback</button>';
    document.body.append(slot);
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(await page.evaluate(() => (window as any).calls.length)).toBe(waitingCalls);
  await page.evaluate(() => document.querySelector('native-ad')!.setAttribute('placement', 'home'));
  await expect(page.locator('native-ad')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await expect(page.locator('native-ad button')).toBeHidden();
  const prepared = await page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'prepare').length);
  await page.evaluate(() => (window as any).events.moving({ slot: 1 }));
  await expect(page.locator('native-ad')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await expect(page.locator('native-ad button')).toBeHidden();
  expect(await page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'prepare').length)).toBe(prepared);
  await page.evaluate(() => document.querySelector('native-ad')!.setAttribute('placement', 'other'));
  await expect(page.locator('native-ad')).not.toHaveAttribute('data-native-ui-snapshot');
  await expect(page.locator('native-ad button')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).calls.at(-1))).toEqual({ action: 'visibility', visible: false });
});

test('a failed native reconciliation hides native content before exposing the fallback and can retry', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => {
    const w = window as any;
    w.failTrack = true;
    w.calls = [];
    w.events.updated({ slot: 1 });
  });
  await expect(page.locator('#slot')).not.toHaveAttribute('data-native-ui-session-surface');
  await expect.poll(() => page.evaluate(() => (window as any).calls.at(-1))).toEqual({ action: 'visibility', visible: false });
  await expect(page.locator('#slot button')).toBeVisible();
  await page.evaluate(() => {
    const w = window as any;
    w.failTrack = false;
    w.events.updated({ slot: 1 });
  });
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'native');
  await expect(page.locator('#slot button')).toBeHidden();
});

for (const destination of ['shown', 'hidden']) {
  test(`a ${destination} event during failure cleanup is not lost or overwritten`, async ({ page }) => {
    await boot(page);
    await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
    await page.evaluate(() => {
      const w = window as any;
      w.failTrack = true;
      w.holdHide = true;
      w.events.updated({ slot: 1 });
    });
    await expect.poll(() => page.evaluate(() => (window as any).pendingHide.length)).toBe(1);
    await page.evaluate((destination) => {
      const w = window as any;
      w.failTrack = false;
      w.events[destination]({ slot: 1 });
    }, destination);
    if (destination === 'hidden') await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'none');
    await page.evaluate(() => (window as any).pendingHide.shift()({}));
    if (destination === 'shown') {
      await expect.poll(() => page.evaluate(() => (window as any).calls.at(-1)?.action)).toBe('track');
    }
    await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', destination === 'shown' ? 'native' : 'none');
    await expect(page.locator('#slot button')).toBeHidden();
  });
}

const ionicBundle = buildSync({
  stdin: { contents: "export * from './src/ionic'; export * from './src/overlays';", resolveDir: process.cwd() },
  bundle: true,
  format: 'iife',
  globalName: 'ionicEngine',
  write: false,
}).outputFiles[0].text;

test('shared overlays temporarily cover native sessions without changing the explicit destination', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.addScriptTag({ content: ionicBundle });
  await page.evaluate(() => {
    const w = window as any;
    w.ionicEngine.enableSupportIonicOverlays();
    const modal = document.createElement('ion-modal');
    const alert = document.createElement('ion-alert');
    document.body.append(modal, alert);
    modal.dispatchEvent(new CustomEvent('ionModalWillPresent', { bubbles: true }));
    alert.dispatchEvent(new CustomEvent('ionAlertWillPresent', { bubbles: true }));
  });
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() => document.querySelector('ion-modal')!.dispatchEvent(new CustomEvent('ionModalDidDismiss', { bubbles: true })));
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() => (window as any).events.hidden({ slot: 1 }));
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'none');
  await page.evaluate(() => document.querySelector('ion-alert')!.dispatchEvent(new CustomEvent('ionAlertDidDismiss', { bubbles: true })));
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'none');
  const destinations = await page.evaluate(() =>
    (window as any).calls.filter((c: any) => c.action === 'destination').map((c: any) => c.destination),
  );
  expect(destinations).toEqual(['none']);
  await page.evaluate(() => (window as any).events.shown({ slot: 1 }));
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'native');
});

test('a native popover claim prevents image handoff; failed native presentation returns to DOM coverage', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.addScriptTag({ content: ionicBundle });
  await page.evaluate(() => {
    const w = window as any;
    w.overlays = w.ionicEngine.enableSupportIonicOverlays();
    const popover = document.createElement('ion-popover');
    document.body.append(popover);
    document.addEventListener('ionPopoverWillPresent', () => w.overlays.setNative(popover, true), { once: true });
    popover.dispatchEvent(new CustomEvent('ionPopoverWillPresent', { bubbles: true }));
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(await page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'cover').length)).toBe(0);
  await page.evaluate(() => (window as any).overlays.setNative(document.querySelector('ion-popover'), false));
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() =>
    document.querySelector('ion-popover')!.dispatchEvent(new CustomEvent('ionPopoverDidDismiss', { bubbles: true })),
  );
  await expect(page.locator('#slot')).not.toHaveAttribute('data-native-ui-snapshot-visible');
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'native');
});

test('moving a projection host into the foreground modal restores it without a new registration', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.addScriptTag({ content: ionicBundle });
  await page.evaluate(() => {
    (window as any).ionicEngine.enableSupportIonicOverlays();
    const modal = document.createElement('ion-modal');
    document.body.append(modal);
    modal.dispatchEvent(new CustomEvent('ionModalWillPresent', { bubbles: true }));
  });
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() => document.querySelector('ion-modal')!.append(document.querySelector('#slot')!));
  await expect(page.locator('#slot')).not.toHaveAttribute('data-native-ui-snapshot-visible');
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'native');
  expect(await page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'connect').length)).toBe(1);
});
