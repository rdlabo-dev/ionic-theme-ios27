import { expect, test } from '@playwright/test';
import { buildSync } from 'esbuild';
import type { NativeUIShellPlugin } from '../../packages/capacitor-native-ui/src/native/definitions';
import type { createOverlayController } from '../../packages/capacitor-native-ui/src/native/overlays/controller';
import type { enableNativeUIShell } from '../../packages/capacitor-native-ui/src/native';
import type { createRuntime } from '../../packages/capacitor-native-ui/src/native/runtime';

const bundle = buildSync({
  stdin: {
    contents:
      "export { createOverlayController } from '../../packages/capacitor-native-ui/src/native/overlays/controller'; export { createRuntime } from '../../packages/capacitor-native-ui/src/native/runtime'; export { enableNativeUIShell } from '../../packages/capacitor-native-ui/src/native';",
    resolveDir: __dirname,
  },
  bundle: true,
  format: 'iife',
  globalName: 'shellLifecycle',
  write: false,
}).outputFiles[0].text;

interface LifecycleState {
  done: boolean;
  failed: boolean;
  counts(): { native: number; dom: number };
  finish(): void;
  restart(): Promise<{ active: number; native: number; dom: number }>;
}

type LifecycleWindow = Window & {
  lifecycleState: LifecycleState;
  shellLifecycle: {
    createOverlayController: typeof createOverlayController;
    createRuntime: typeof createRuntime;
    enableNativeUIShell: typeof enableNativeUIShell;
  };
};

for (const eventName of ['overlay', 'activate', 'search']) {
  for (const failure of ['reject', 'timeout']) {
    test(`shell ${eventName} registration ${failure} releases resources and can restart`, async ({ page }) => {
      await page.clock.install();
      await page.addScriptTag({ content: bundle });
      await page.evaluate(
        ({ eventName, failure }) => {
          const api = (window as LifecycleWindow).shellLifecycle;
          const nativeListeners = new Set<symbol>();
          const domListeners = new Set<EventListenerOrEventListenerObject>();
          // These controller listeners have no AbortSignal; failed initialization
          // must never leave them installed on the source document/window.
          for (const target of [window, document]) {
            const add = target.addEventListener.bind(target);
            const remove = target.removeEventListener.bind(target);
            target.addEventListener = ((name: string, callback: EventListenerOrEventListenerObject, options?: AddEventListenerOptions) => {
              if (['resize', 'ionViewWillLeave', 'visibilitychange'].includes(name) && !options?.signal) domListeners.add(callback);
              add(name, callback, options);
            }) as typeof target.addEventListener;
            target.removeEventListener = ((name: string, callback: EventListenerOrEventListenerObject, options?: EventListenerOptions) => {
              domListeners.delete(callback);
              remove(name, callback, options);
            }) as typeof target.removeEventListener;
          }
          let fail = true;
          let finishRegistration: (() => void) | undefined;
          const plugin = {
            async addListener(name: string) {
              if (fail && name === eventName) {
                if (failure === 'reject') throw new Error('Unavailable bridge');
                await new Promise<void>((resolve) => (finishRegistration = resolve));
              }
              const registration = Symbol(name);
              nativeListeners.add(registration);
              return {
                remove: async () => {
                  nativeListeners.delete(registration);
                },
              };
            },
            async clear() {},
            async stopOverlays() {},
            async update(snapshot: { revision: number }) {
              return { revision: snapshot.revision };
            },
          } as unknown as NativeUIShellPlugin;
          const start = () =>
            eventName === 'overlay'
              ? api.createOverlayController(
                  document,
                  plugin,
                  { controls: { popover: true } },
                  () => () => {},
                  () => true,
                )
              : api.createRuntime(document, plugin);
          const state: LifecycleState = {
            done: false,
            failed: false,
            counts: () => ({ native: nativeListeners.size, dom: domListeners.size }),
            finish: () => finishRegistration?.(),
            async restart() {
              fail = false;
              const handle = await start();
              const active = nativeListeners.size;
              await handle.destroy();
              return { active, ...state.counts() };
            },
          };
          Object.assign(window, { lifecycleState: state });
          void start()
            .then(
              (handle) => {
                state.failed = 'getStatus' in handle && handle.getStatus().state === 'stopped';
              },
              () => {
                state.failed = true;
              },
            )
            .finally(() => {
              state.done = true;
            });
        },
        { eventName, failure },
      );
      // Advance the production timeout; do not shorten it or replace the bridge helper.
      await page.clock.runFor(failure === 'timeout' ? 5100 : 100);
      const state = () => page.evaluate(() => (window as LifecycleWindow).lifecycleState);
      await expect.poll(async () => (await state()).done).toBe(true);
      expect((await state()).failed).toBe(true);
      await page.evaluate(() => (window as LifecycleWindow).lifecycleState.finish());
      await expect.poll(() => page.evaluate(() => (window as LifecycleWindow).lifecycleState.counts())).toEqual({ native: 0, dom: 0 });
      // A clean second activation must own exactly one copy of each native listener.
      const restart = page.evaluate(() => (window as LifecycleWindow).lifecycleState.restart());
      await page.clock.runFor(100);
      expect(await restart).toEqual({ active: eventName === 'overlay' ? 1 : 2, native: 0, dom: 0 });
    });
  }
}

for (const stop of ['disable', 'destroy then disable', 'destroy', 'destroy with different controls']) {
  test(`replacement startup waits for native teardown (${stop})`, async ({ page }) => {
    await page.clock.install();
    await page.evaluate(() => {
      const callbacks = new Set<unknown>();
      const state = {
        configured: 0,
        clearStarted: false,
        release: () => {},
        listeners: () => callbacks.size,
      };
      const plugin = {
        async configure() {
          state.configured++;
          return { supported: true };
        },
        async addListener(_name: string, callback: unknown) {
          callbacks.add(callback);
          return {
            remove: async () => {
              callbacks.delete(callback);
            },
          };
        },
        async update(snapshot: { revision: number }) {
          return { revision: snapshot.revision };
        },
        async clear() {
          if (state.clearStarted) return;
          state.clearStarted = true;
          await new Promise<void>((resolve) => {
            state.release = resolve;
          });
        },
      };
      window.CapacitorCustomPlatform = { name: 'ios' };
      let capacitor: { registerPlugin: (name: string) => unknown } | undefined;
      Object.defineProperty(window, 'Capacitor', {
        configurable: true,
        get: () => capacitor,
        set: (value) => {
          const available = value.isPluginAvailable;
          value.isPluginAvailable = (name: string) => name === 'IonicNativeUIShell' || available(name);
          const register = value.registerPlugin;
          value.registerPlugin = (name: string) => (name === 'IonicNativeUIShell' ? plugin : register(name));
          capacitor = value;
        },
      });
      Object.assign(window, { restartState: state });
      document.body.innerHTML = '<ion-app></ion-app>';
    });
    await page.addScriptTag({ content: bundle });
    await page.evaluate(async (stop) => {
      const { enableNativeUIShell } = (window as LifecycleWindow).shellLifecycle;
      const options = { verticalBarsOnly: true, controls: {} };
      const first = await enableNativeUIShell(options);
      const destroying = stop !== 'disable' ? first.destroy() : undefined;
      const disabling = stop.includes('disable') ? enableNativeUIShell({ enabled: false }) : destroying;
      const second = enableNativeUIShell(
        stop === 'destroy with different controls' ? { ...options, controls: { toolbar: true } } : options,
      );
      Object.assign(window, {
        restartCompleted: Promise.all([disabling, second]).then(([, handle]) => {
          Object.assign(window, { restartedHandle: handle });
        }),
      });
    }, stop);
    await page.clock.runFor(100);
    const evidence = await page.evaluate(() => {
      const state = (window as Window & { restartState: { configured: number; clearStarted: boolean } }).restartState;
      return { configured: state.configured, clearStarted: state.clearStarted };
    });
    expect(evidence).toEqual({ configured: 1, clearStarted: true });
    await page.evaluate(async () => {
      const state = window as Window & { restartState: { release(): void }; restartCompleted: Promise<void> };
      state.restartState.release();
      await state.restartCompleted;
    });
    expect(
      await page.evaluate(() => {
        const state = (window as Window & { restartState: { configured: number; listeners(): number } }).restartState;
        return { configured: state.configured, listeners: state.listeners() };
      }),
    ).toEqual({ configured: 2, listeners: 3 });
    const destroy = page.evaluate(() => (window as Window & { restartedHandle: { destroy(): Promise<void> } }).restartedHandle.destroy());
    await page.clock.runFor(100);
    await destroy;
    expect(await page.evaluate(() => (window as Window & { restartState: { listeners(): number } }).restartState.listeners())).toBe(0);
  });
}

test('a completed teardown failure does not poison later disable calls', async ({ page }) => {
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const { enableNativeUIShell } = (window as LifecycleWindow).shellLifecycle;
    const first = await enableNativeUIShell();
    const destroy = first.destroy;
    // Fail at the teardown boundary after releasing the actual Web resources.
    first.destroy = async () => {
      await destroy();
      throw new Error('Teardown failed');
    };
    const failures = await Promise.allSettled([enableNativeUIShell({ enabled: false }), enableNativeUIShell({ enabled: false })]);
    const disabled = await enableNativeUIShell({ enabled: false });
    const replacement = await enableNativeUIShell();
    await replacement.destroy();
    const disabledAgain = await enableNativeUIShell({ enabled: false });
    return {
      failures: failures.map((result) => result.status),
      disabled: disabled.getStatus().reason,
      disabledAgain: disabledAgain.getStatus().reason,
    };
  });
  expect(result).toEqual({ failures: ['rejected', 'rejected'], disabled: 'Disabled', disabledAgain: 'Disabled' });
});

for (const stalled of ['configure', 'metrics listener', 'metrics', 'listener removal']) {
  test(`native lifecycle settles when ${stalled} stalls`, async ({ page }) => {
    await page.clock.install();
    await page.evaluate((stalled) => {
      const listeners = new Set<symbol>();
      let finish: () => void = () => {};
      const pending = new Promise<void>((resolve) => (finish = resolve));
      const plugin = {
        async configure() {
          if (stalled === 'configure') await pending;
          return { supported: true };
        },
        async getWebViewMetrics() {
          if (stalled === 'metrics') await pending;
          return { radius: 0 };
        },
        async addListener(name: string) {
          if (stalled === 'metrics listener' && name === 'webViewMetricsChange') await pending;
          const registration = Symbol(name);
          listeners.add(registration);
          return {
            async remove() {
              if (stalled === 'listener removal' && name === 'webViewMetricsChange') await pending;
              listeners.delete(registration);
            },
          };
        },
        async clear() {},
        async update(snapshot: { revision: number }) {
          return { revision: snapshot.revision };
        },
      };
      window.CapacitorCustomPlatform = { name: 'ios' };
      let capacitor: { registerPlugin: (name: string) => unknown } | undefined;
      Object.defineProperty(window, 'Capacitor', {
        configurable: true,
        get: () => capacitor,
        set: (value) => {
          const available = value.isPluginAvailable;
          value.isPluginAvailable = (name: string) => name === 'IonicNativeUIShell' || available(name);
          const register = value.registerPlugin;
          value.registerPlugin = (name: string) => (name === 'IonicNativeUIShell' ? plugin : register(name));
          capacitor = value;
        },
      });
      Object.assign(window, { stalledBridge: { finish, count: () => listeners.size, settled: false } });
      document.body.innerHTML = '<ion-app></ion-app>';
    }, stalled);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => {
      const state = window as LifecycleWindow & { stalledBridge: { settled: boolean; reason?: string } };
      void state.shellLifecycle.enableNativeUIShell().then(async (handle) => {
        state.stalledBridge.reason = handle.getStatus().reason;
        await handle.destroy();
        state.stalledBridge.settled = true;
      });
    });
    await page.clock.runFor(5300);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { stalledBridge: { settled: boolean } }).stalledBridge.settled))
      .toBe(true);
    if (stalled === 'configure' || stalled === 'metrics listener') {
      expect(await page.evaluate(() => (window as unknown as { stalledBridge: { reason: string } }).stalledBridge.reason)).toContain(
        'timed out',
      );
    }
    // Late registrations are released, and late configure/metrics results cannot restart a stopped runtime.
    await page.evaluate(() => (window as unknown as { stalledBridge: { finish(): void } }).stalledBridge.finish());
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { stalledBridge: { count(): number } }).stalledBridge.count()))
      .toBe(0);
    expect(await page.locator('html').getAttribute('class')).not.toContain('ios-theme-native-ui-shell-prehide');
  });
}

test('destroy waits for teardown already started by a native bridge failure', async ({ page }) => {
  await page.clock.install();
  await page.addScriptTag({ content: bundle });
  await page.evaluate(async () => {
    const state = { clearStarted: false, destroyed: false, release: () => {} };
    const plugin = {
      async addListener() {
        return { remove: async () => {} };
      },
      async update() {
        throw new Error('Bridge lost');
      },
      async clear() {
        state.clearStarted = true;
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
      },
    } as unknown as NativeUIShellPlugin;
    const runtime = await (window as LifecycleWindow).shellLifecycle.createRuntime(document, plugin);
    Object.assign(window, {
      failureState: state,
      destroyFailedRuntime: () =>
        runtime.destroy().then(() => {
          state.destroyed = true;
        }),
    });
  });
  await page.clock.runFor(100);
  expect(await page.evaluate(() => (window as unknown as { failureState: { clearStarted: boolean } }).failureState.clearStarted)).toBe(
    true,
  );
  const destroying = page.evaluate(() => (window as unknown as { destroyFailedRuntime(): Promise<void> }).destroyFailedRuntime());
  await page.clock.runFor(100);
  expect(await page.evaluate(() => (window as unknown as { failureState: { destroyed: boolean } }).failureState.destroyed)).toBe(false);
  await page.evaluate(() => (window as unknown as { failureState: { release(): void } }).failureState.release());
  await destroying;
  expect(await page.evaluate(() => (window as unknown as { failureState: { destroyed: boolean } }).failureState.destroyed)).toBe(true);
});
