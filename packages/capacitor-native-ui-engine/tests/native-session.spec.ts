import { expect, test } from '@playwright/test';
import { buildSync } from 'esbuild';
const bundle = buildSync({
  entryPoints: ['src/native-session.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'sessionEngine',
  write: false,
}).outputFiles[0].text;
const placementBundle = buildSync({
  entryPoints: ['src/projection-placement.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'placementEngine',
  write: false,
}).outputFiles[0].text;
const boot = async (
  page: import('@playwright/test').Page,
  present = true,
  projectionSelector = '#slot',
  failedFallback: 'web' | 'native' = 'web',
  unavailable = false,
  captureMode: 'view' | 'composited' = 'composited',
  placementHandoff = false,
) => {
  await page.setContent(present ? '<div id="slot" style="width:120px;height:40px"><button>Fallback</button></div>' : '<main></main>');
  await page.evaluate(() => {
    (window as any).Capacitor = {
      convertFileSrc: () => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"/>'),
    };
  });
  await page.addScriptTag({ content: bundle });
  await page.addScriptTag({ content: placementBundle });
  await page.evaluate(
    async ({ projectionSelector, failedFallback, unavailable, captureMode, placementHandoff }) => {
      const w = window as any;
      w.calls = [];
      w.events = {};
      w.removed = [];
      w.pendingResume = [];
      w.pendingCover = [];
      w.pendingPrepare = [];
      w.pendingHide = [];
      w.session = await w.sessionEngine.startNativeSession(
        {
          id: 'surface',
          plugin: 'Example',
          projectionSelector,
          failedFallback,
          captureMode,
          placementHandoff,
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
            if (request.action === 'track' && w.holdTrack)
              return new Promise((_resolve, reject) => {
                w.rejectTrack = reject;
              });
            if (request.action === 'track' && w.failTrack) throw new Error('Tracking reply unavailable');
            if (request.action === 'prepare' && w.holdPrepare) return new Promise((resolve) => w.pendingPrepare.push(resolve));
            if (request.action === 'prepare' && (unavailable || w.unavailable || w.noCapture)) return {};
            if (request.action === 'cover' && w.holdCover) return new Promise((resolve) => w.pendingCover.push(resolve));
            if (request.action === 'cover' && w.failCover) return { shown: false };
            if (request.action === 'prepare')
              return { token: 'pixels', parts: [{ ids: ['view'], url: 'file:///pixels.png', x: 8, y: 8, width: 120, height: 40 }] };
            if (request.action === 'release' && w.failRelease) throw new Error('Native release failed');
            if (request.action === 'visibility' && w.failVisibility) throw new Error('Native recovery failed');
            if (request.action === 'resume' && w.failResume) throw new Error('Native restore failed');
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
    },
    { projectionSelector, failedFallback, unavailable, captureMode, placementHandoff },
  );
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

for (const fallback of ['web', 'native'] as const) {
  test(`unavailable capture uses ${fallback} fallback during scroll`, async ({ page }) => {
    await boot(page, true, '#slot', fallback, true);
    await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'native');
    await page.evaluate(() => {
      const w = window as any;
      w.calls = [];
      document.dispatchEvent(new Event('scroll'));
    });
    await expect
      .poll(() => page.evaluate(() => (window as any).calls.filter((r: any) => r.action === 'visibility').at(-1)?.visible))
      .toBe(fallback === 'native');
    if (fallback === 'native') await expect(page.locator('#slot button')).toBeHidden();
    else await expect(page.locator('#slot button')).toBeVisible();
    await page.evaluate(() => (window as any).events.hidden({ slot: 1 }));
    await page.waitForTimeout(150);
    await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'none');
  });
}

test('native failed fallback recovers rejected handoff without capturing on motion', async ({ page }) => {
  await boot(page, true, '#slot', 'native');
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => {
    const w = window as any;
    w.failCover = true;
    w.calls = [];
    document.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(() => page.evaluate(() => (window as any).calls.some((r: any) => r.action === 'cover'))).toBe(true);
  await expect
    .poll(() => page.evaluate(() => (window as any).calls.filter((r: any) => r.action === 'visibility').at(-1)?.visible))
    .toBe(true);
  await expect(page.locator('#slot button')).toBeHidden();
});

test('explicit web and overlay coverage override native failed fallback', async ({ page }) => {
  await boot(page, true, '#slot', 'native', true);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'native');
  await page.evaluate(() => (window as any).events.moving({ slot: 1 }));
  await expect(page.locator('#slot button')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).calls.filter((r: any) => r.action === 'visibility').at(-1)?.visible))
    .toBe(false);
  await page.evaluate(() => (window as any).events.shown({ slot: 1 }));
  await expect(page.locator('#slot button')).toBeHidden();
  await page.addScriptTag({ content: ionicBundle });
  await page.evaluate(() => {
    (window as any).ionicEngine.enableSupportIonicOverlays();
    const modal = document.createElement('ion-modal');
    document.body.append(modal);
    modal.dispatchEvent(new CustomEvent('ionModalWillPresent', { bubbles: true }));
    document.dispatchEvent(new Event('scroll'));
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).calls.filter((r: any) => r.action === 'visibility').at(-1)?.visible))
    .toBe(false);
});

test('slotted content receives non-composed shadow scroller events and tears them down', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const host = document.createElement('ion-content');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<div id="inner" style="height:80px;overflow:auto"><slot></slot></div>';
    const content = document.createElement('div');
    content.style.height = '800px';
    content.append(document.querySelector('#slot')!);
    host.append(content);
    document.body.append(host);
    (window as any).scroller = root.querySelector('#inner');
    (window as any).events.updated({ slot: 1 });
  });
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => {
    (window as any).calls = [];
    (window as any).scroller.dispatchEvent(new Event('scroll', { composed: false }));
  });
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  expect(await page.evaluate(() => (window as any).calls.filter((r: any) => r.action === 'cover').length)).toBe(1);
  await page.evaluate(async () => {
    await (window as any).session.destroy();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    (window as any).calls = [];
    (window as any).scroller.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).calls.length)).toBe(0);
});

test('native fallback also recovers failed native restoration', async ({ page }) => {
  await boot(page, true, '#slot', 'native');
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => document.dispatchEvent(new Event('scroll')));
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.evaluate(() => {
    (window as any).failResume = true;
  });
  await expect.poll(() => page.evaluate(() => (window as any).calls.some((r: any) => r.action === 'resume'))).toBe(true);
  await expect
    .poll(() => page.evaluate(() => (window as any).calls.filter((r: any) => r.action === 'visibility').at(-1)?.visible))
    .toBe(true);
  await expect(page.locator('#slot button')).toBeHidden();
});

test('moving a host between scroll roots refreshes the binding even without a size change', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    for (const id of ['one', 'two']) {
      const owner = document.createElement('div');
      owner.id = id;
      owner.style.cssText = 'width:160px;height:80px;overflow:auto';
      owner.innerHTML = '<div style="height:800px"></div>';
      document.body.append(owner);
    }
    document.querySelector('#one > div')!.prepend(document.querySelector('#slot')!);
  });
  await expect.poll(() => page.evaluate(() => (window as any).calls.filter((r: any) => r.action === 'track').length)).toBeGreaterThan(1);
  await page.evaluate(() => {
    (window as any).calls = [];
    document.querySelector('#two > div')!.prepend(document.querySelector('#slot')!);
  });
  await expect.poll(() => page.evaluate(() => (window as any).calls.filter((r: any) => r.action === 'track').length)).toBeGreaterThan(0);
});

test('late reconciliation failure after destroy cannot restore native visibility', async ({ page }) => {
  await boot(page, true, '#slot', 'native');
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => {
    const w = window as any;
    w.holdTrack = true;
    w.events.updated({ slot: 1 });
  });
  await expect.poll(() => page.evaluate(() => !!(window as any).rejectTrack)).toBe(true);
  await page.evaluate(async () => {
    const w = window as any;
    await w.session.destroy();
    w.calls = [];
    w.rejectTrack(new Error('late failure'));
  });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as any).calls.filter((r: any) => r.action === 'visibility'))).toEqual([]);
});

test('native-confirmed hide removes Web pixels synchronously without another bridge round trip', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => (window as any).events.moving({ slot: 1 }));
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  const hidden = await page.evaluate(() => {
    const w = window as any;
    w.holdHide = true;
    w.session.hide();
    const slot = document.querySelector('#slot')!;
    return {
      image: slot.hasAttribute('data-native-ui-snapshot-visible'),
      destination: slot.getAttribute('data-native-ui-session-surface'),
    };
  });
  expect(hidden).toEqual({ image: false, destination: 'none' });
});

test('opaque view mode prepaints its image beneath native before scrolling', async ({ page }) => {
  await boot(page, true, '#slot', 'native', false, 'view');
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  expect(await page.evaluate(() => (window as any).calls.some((call: any) => call.action === 'cover'))).toBe(false);
  await page.evaluate(() => (window as any).session.hide());
  await expect(page.locator('#slot')).not.toHaveAttribute('data-native-ui-snapshot-visible');
});

test('opaque movement retains decoded pixels and local coordinates until content changes', async ({ page }) => {
  await boot(page, true, '#slot', 'native', false, 'view');
  await page.evaluate(() => {
    document.body.style.height = '3000px';
  });
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  await page.waitForTimeout(200);
  const preparations = await page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'prepare').length);
  for (let i = 1; i <= 3; i++) {
    await page.evaluate((y) => scrollTo(0, y), i * 10);
    await expect.poll(() => page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'resume').length)).toBe(i);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'prepare').length)).toBe(preparations);
    await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#slot')!, '::before').top)).toBe('0px');
  }
  await page.evaluate(() => (window as any).events.updated({ slot: 1 }));
  await expect
    .poll(() => page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'prepare').length))
    .toBeGreaterThan(preparations);
});

test('full-view pixels remain host-local when native position lags DOM during first preparation', async ({ page }) => {
  await boot(page, true, '#slot', 'native', false, 'view');
  await page.evaluate(() => {
    document.body.style.marginTop = '150px';
  });
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-visible', '');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#slot')!, '::before').top)).toBe('0px');
});

for (const confirmation of ['notification', 'show'] as const) {
  test(`scroll without capture waits for placement confirmation through ${confirmation}`, async ({ page }) => {
    await boot(page, false);
    await page.evaluate(() => {
      (window as any).noCapture = true;
      document.body.innerHTML =
        '<div id="scroller" style="height:100px;overflow:auto"><div style="height:400px;padding-top:60px"><div id="slot" style="width:120px;height:40px">Fallback</div></div></div>';
    });
    await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'native');
    await page.evaluate(() => {
      (window as any).calls = [];
      document.querySelector('#scroller')!.scrollTop = 30;
    });
    await expect(page.locator('#slot')).not.toHaveAttribute('data-native-ui-session-surface');
    // Wait beyond scroll settling and force another reconciliation through an appearance event.
    await page.waitForTimeout(200);
    await page.evaluate(() => (window as any).events.updated({ slot: 1 }));
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).calls.some((c: any) => c.action === 'visibility' && c.visible))).toBe(false);
    await expect(page.locator('#slot')).not.toHaveAttribute('data-native-ui-session-surface');
    await page.evaluate((confirmation) => {
      const w = window as any;
      if (confirmation === 'notification') w.events.shown({ slot: 1 });
      else {
        w.session.hide();
        w.session.show();
      }
    }, confirmation);
    await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'native');
  });
}

test('scroll with a prepared image still restores through the native placement acknowledgement', async ({ page }) => {
  await boot(page, false);
  await page.evaluate(() => {
    document.body.innerHTML =
      '<div id="scroller" style="height:100px;overflow:auto"><div style="height:400px;padding-top:60px"><div id="slot" style="width:120px;height:40px">Fallback</div></div></div>';
  });
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => {
    (window as any).calls = [];
    document.querySelector('#scroller')!.scrollTop = 30;
  });
  await expect.poll(() => page.evaluate(() => (window as any).calls.some((c: any) => c.action === 'restore'))).toBe(true);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-session-surface', 'native');
  await expect(page.locator('#slot')).not.toHaveAttribute('data-native-ui-snapshot-visible');
  const calls = await page.evaluate(() => (window as any).calls);
  expect(calls.find((c: any) => c.action === 'restore').parts[0].y).toBe(-22);
  expect(calls.some((c: any) => c.action === 'resume')).toBe(true);
});

const bindPlacement = async (page: import('@playwright/test').Page, enabled = true) => {
  await boot(page, true, '#slot', 'native', false, 'view', enabled);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot', /.+/);
  await page.evaluate(() => {
    const w = window as any;
    w.measureCount = 0;
    w.latestPlacement = { sequence: 1, x: 10, y: 20 };
    w.binding = w.placementEngine.bindProjectionPlacement(document.querySelector('#slot'), () => {
      w.measureCount++;
      return { ...w.latestPlacement };
    });
  });
};

test('placement handoff measures latest geometry once and waits for cover and resume acknowledgements', async ({ page }) => {
  await bindPlacement(page);
  await page.evaluate(() => {
    const w = window as any;
    w.holdCover = true;
    w.holdResume = true;
    w.events.moving({ slot: 1 });
  });
  await expect.poll(() => page.evaluate(() => (window as any).pendingCover.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).binding.projected)).toBe(false);
  await page.evaluate(() => (window as any).pendingCover.shift()({ shown: true }));
  await expect.poll(() => page.evaluate(() => (window as any).binding.projected)).toBe(true);
  await page.evaluate(() => {
    const w = window as any;
    w.latestPlacement = { sequence: 9, x: 30, y: 80 };
    w.events.shown({ slot: 1 });
  });
  await expect.poll(() => page.evaluate(() => (window as any).pendingResume.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).binding.projected)).toBe(true);
  expect(await page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'restore').map((c: any) => c.placement))).toEqual([
    { sequence: 9, x: 30, y: 80 },
  ]);
  expect(await page.evaluate(() => (window as any).measureCount)).toBe(1);
  await page.evaluate(() => (window as any).pendingResume.shift()({}));
  await expect.poll(() => page.evaluate(() => (window as any).binding.projected)).toBe(false);
});

test('late cover acknowledgement cannot mark a hidden placement projected again', async ({ page }) => {
  await bindPlacement(page);
  await page.evaluate(() => {
    const w = window as any;
    w.holdCover = true;
    w.events.moving({ slot: 1 });
  });
  await expect.poll(() => page.evaluate(() => (window as any).pendingCover.length)).toBe(1);
  await page.evaluate(() => (window as any).session.hide());
  await page.evaluate(() => (window as any).pendingCover.shift()({ shown: true }));
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => (window as any).binding.projected)).toBe(false);
});

test('releasing an idle cached image does not measure a final native placement', async ({ page }) => {
  await bindPlacement(page);
  await page.evaluate(() => (window as any).events.updated({ slot: 1 }));
  await expect.poll(() => page.evaluate(() => (window as any).calls.some((c: any) => c.action === 'release'))).toBe(true);
  expect(await page.evaluate(() => (window as any).measureCount)).toBe(0);
  expect(
    await page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'release').some((c: any) => 'placement' in c)),
  ).toBe(false);
});

test('placement binding stays inert for registrations without handoff opt-in', async ({ page }) => {
  await bindPlacement(page, false);
  await page.evaluate(() => (window as any).events.moving({ slot: 1 }));
  await expect.poll(() => page.evaluate(() => (window as any).calls.some((c: any) => c.action === 'cover'))).toBe(true);
  expect(await page.evaluate(() => (window as any).binding.projected)).toBe(false);
  await page.evaluate(() => (window as any).events.shown({ slot: 1 }));
  await expect.poll(() => page.evaluate(() => (window as any).calls.some((c: any) => c.action === 'resume'))).toBe(true);
  expect(await page.evaluate(() => (window as any).measureCount)).toBe(0);
  expect(await page.evaluate(() => (window as any).calls.some((c: any) => 'placement' in c))).toBe(false);
});

test('late unused capture release preserves an active placement without measuring', async ({ page }) => {
  await bindPlacement(page);
  await page.evaluate(() => {
    const w = window as any;
    w.holdPrepare = true;
    w.events.updated({ slot: 1 });
  });
  await expect.poll(() => page.evaluate(() => (window as any).pendingPrepare.length)).toBe(1);
  await page.evaluate(() => (window as any).events.moving({ slot: 1 }));
  await expect.poll(() => page.evaluate(() => (window as any).binding.projected)).toBe(true);
  await page.evaluate(() =>
    (window as any).pendingPrepare.shift()({
      token: 'unused-late-image',
      parts: [{ ids: ['view'], url: 'file:///unused.png', x: 0, y: 0, width: 120, height: 40 }],
    }),
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).calls.some((c: any) => c.action === 'release' && c.token === 'unused-late-image')))
    .toBe(true);
  expect(await page.evaluate(() => (window as any).measureCount)).toBe(0);
  expect(await page.evaluate(() => (window as any).binding.projected)).toBe(true);
});

for (const failure of ['resume', 'release'] as const) {
  test(`placement ${failure} rejection resumes consumer measurement when recovery rejects`, async ({ page }) => {
    await bindPlacement(page);
    await page.evaluate(() => {
      const w = window as any;
      w.invalidations = 0;
      w.resumedMeasurements = 0;
      w.binding.dispose();
      w.binding = w.placementEngine.bindProjectionPlacement(
        document.querySelector('#slot'),
        () => {
          w.measureCount++;
          return { ...w.latestPlacement };
        },
        () => {
          w.invalidations++;
          if (!w.binding.projected) w.resumedMeasurements++;
        },
      );
      w.events.moving({ slot: 1 });
    });
    await expect.poll(() => page.evaluate(() => (window as any).binding.projected)).toBe(true);
    await page.evaluate((failure) => {
      const w = window as any;
      w.failRelease = true;
      w.failVisibility = true;
      if (failure === 'resume') {
        w.failResume = true;
        w.events.shown({ slot: 1 });
      } else document.querySelector<HTMLElement>('#slot')!.style.width = '130px';
    }, failure);
    await expect.poll(() => page.evaluate((action) => (window as any).calls.some((c: any) => c.action === action), failure)).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).binding.projected)).toBe(false);
    expect(await page.evaluate(() => (window as any).invalidations)).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as any).resumedMeasurements)).toBeGreaterThan(0);
  });
}

test('an older session resume acknowledgement cannot clear a newer session placement owner', async ({ page }) => {
  await bindPlacement(page);
  await page.evaluate(() => {
    const w = window as any;
    w.holdResume = true;
    w.events.moving({ slot: 1 });
  });
  await expect.poll(() => page.evaluate(() => (window as any).binding.projected)).toBe(true);
  await page.evaluate(async () => {
    const w = window as any;
    w.newEvents = {};
    w.newPrepared = false;
    w.newSession = await w.sessionEngine.startNativeSession(
      {
        id: 'replacement',
        plugin: 'Example',
        projectionSelector: '#slot',
        failedFallback: 'native',
        captureMode: 'view',
        placementHandoff: true,
        receiveListeners: { projection: { web: ['replacementMoving'] } },
      },
      {
        send: async (request: any) => {
          if (request.action === 'prepared') w.newPrepared = true;
          if (request.action === 'prepare')
            return {
              token: 'replacement-pixels',
              parts: [{ ids: ['view'], url: 'file:///replacement.png', x: 8, y: 8, width: 120, height: 40 }],
            };
          if (request.action === 'cover' || request.action === 'restore') return { shown: true };
          return {};
        },
        listen: async () => ({ remove() {} }),
      },
      {
        addListener: async (name: string, callback: Function) => {
          w.newEvents[name] = callback;
          return { remove() {} };
        },
      },
    );
  });
  await expect.poll(() => page.evaluate(() => (window as any).newPrepared)).toBe(true);
  await page.evaluate(() => (window as any).events.shown({ slot: 1 }));
  await expect.poll(() => page.evaluate(() => (window as any).pendingResume.length)).toBe(1);
  await page.evaluate(() => (window as any).newEvents.replacementMoving({}));
  await expect.poll(() => page.evaluate(() => (window as any).binding.projected)).toBe(true);
  await page.evaluate(() => (window as any).pendingResume.shift()({}));
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => (window as any).binding.projected)).toBe(true);
  await page.evaluate(() => (window as any).session.destroy());
  expect(await page.evaluate(() => (window as any).binding.projected)).toBe(true);
});

test('a previous automatic-scroll resume cannot finish a newer image presentation', async ({ page }) => {
  await bindPlacement(page);
  await page.evaluate(() => {
    const w = window as any;
    w.holdResume = true;
    document.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(() => page.evaluate(() => (window as any).pendingResume.length), { intervals: [10] }).toBe(1);
  await page.evaluate(() => document.dispatchEvent(new Event('scroll')));
  await expect
    .poll(() => page.evaluate(() => (window as any).calls.filter((c: any) => c.action === 'restore').length), { intervals: [10] })
    .toBe(2);
  await page.evaluate(() => (window as any).pendingResume.shift()({}));
  // The old draw acknowledgement must start a new resume, not retire its image.
  await expect.poll(() => page.evaluate(() => (window as any).pendingResume.length), { intervals: [10] }).toBe(1);
  await expect(page.locator('#slot')).toHaveAttribute('data-native-ui-snapshot-source', '');
  expect(await page.evaluate(() => (window as any).binding.projected)).toBe(true);
  await page.evaluate(() => (window as any).pendingResume.shift()({}));
  await expect(page.locator('#slot')).not.toHaveAttribute('data-native-ui-snapshot-source');
  await expect.poll(() => page.evaluate(() => (window as any).binding.projected)).toBe(false);
});

for (const next of ['scroll', 'web'] as const) {
  test(`reentering a returning image through ${next} does not send an intermediate visibility request`, async ({ page }) => {
    await bindPlacement(page);
    await page.evaluate(() => {
      const w = window as any;
      w.holdResume = true;
      document.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(() => page.evaluate(() => (window as any).pendingResume.length), { intervals: [10] }).toBe(1);
    const actions = await page.evaluate((next) => {
      const w = window as any;
      w.calls = [];
      if (next === 'scroll') document.dispatchEvent(new Event('scroll'));
      else w.events.moving({ slot: 1 });
      return w.calls.map((request: any) => ({ action: request.action, visible: request.visible }));
    }, next);
    expect(actions.filter((request: any) => request.action === 'cover')).toHaveLength(1);
    expect(actions.filter((request: any) => request.action === 'visibility')).toHaveLength(0);
    await expect.poll(() => page.evaluate(() => (window as any).binding.projected), { intervals: [10] }).toBe(true);
  });
}
