import { afterEach, expect, test, vi } from 'vitest';
import { createRuntime } from '../../packages/capacitor-native-ui/src/native/runtime';
import type { NativeUIPlugin, NativeUIRuntimeHandle, NativeUISnapshot } from '../../packages/capacitor-native-ui/src/native/definitions';

let runtime: NativeUIRuntimeHandle | undefined;
afterEach(async () => {
  await runtime?.destroy();
  runtime = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const mount = (vertical: boolean) => {
  document.body.innerHTML = `<ion-app class="${vertical ? 'ios-theme-vertical-bars' : ''}"><main class="ion-page"><ion-tabs>
    <ion-tab-bar class="ios"><ion-tab-button><ion-label>Home</ion-label></ion-tab-button></ion-tab-bar>
    </ion-tabs></main></ion-app>`;
  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    element.style.cssText = 'display:block;visibility:visible;opacity:1;transform:none;overflow:visible;color:rgb(0,0,0)';
    element.getBoundingClientRect = () => ({ x: 10, y: 10, left: 10, top: 10, right: 110, bottom: 54, width: 100, height: 44 }) as DOMRect;
  });
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MediaQueryList);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  return document.querySelector<HTMLElement>('ion-tab-bar')!;
};

for (const vertical of [false, true]) {
  test.each([
    [true, true],
    [false, false],
    ['horizontalOnly', !vertical],
    ['verticalOnly', vertical],
  ] as const)('tabs placement vertical=' + vertical + ' respects controls=%s', async (controls, selected) => {
    const tabs = mount(vertical);
    const updates: NativeUISnapshot[] = [];
    const plugin = {
      addListener: async () => ({ remove: async () => {} }),
      update: async (snapshot: NativeUISnapshot) => {
        updates.push(snapshot);
        return { revision: snapshot.revision };
      },
      clear: async () => {},
    } as unknown as NativeUIPlugin;
    runtime = await createRuntime(document, plugin, { controls: { tabs: controls } });
    await vi.waitFor(() => expect(updates.length).toBeGreaterThan(0));
    expect(updates.at(-1)!.controls.map((control) => control.kind)).toEqual(selected ? ['tab-bar'] : []);
    if (selected) expect(updates.at(-1)!.controls[0].placement).toBe(vertical ? 'vertical-bars' : undefined);

    // A local opt-in/out overrides the matching placement default and updates the native snapshot.
    tabs.setAttribute(vertical ? 'data-vertical-bars' : 'data-horizontal-bars', selected ? 'false' : 'true');
    await vi.waitFor(() => expect(runtime!.getStatus().projected).toBe(selected ? 0 : 1));
  });
}

const bridge = vi.hoisted(() => ({
  configure: vi.fn(async () => ({ supported: true })),
  getWebViewMetrics: vi.fn(async () => ({ radius: 48 })),
  addListener: vi.fn(async () => ({ remove: async () => {} })),
  update: vi.fn(async (snapshot: NativeUISnapshot) => ({ revision: snapshot.revision })),
  clear: vi.fn(async () => {}),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isPluginAvailable: () => true },
  registerPlugin: () => bridge,
}));
import { enableNativeUI } from '../../packages/capacitor-native-ui/src/core';
import { nativeWebViewMetrics } from '../../packages/capacitor-native-ui/src/native-integration';

test.each([
  [true, true],
  [false, false],
  ['horizontalOnly', true],
  ['verticalOnly', false],
] as const)('controls=%s preserves Web scroll-edge effects without ordinary default selection', async (controls, suppress) => {
  nativeWebViewMetrics.radius = 0;
  runtime = await enableNativeUI({ controls });
  expect(bridge.configure).toHaveBeenLastCalledWith({ suppressScrollEdgeEffect: suppress });
  expect(nativeWebViewMetrics.radius).toBe(suppress ? 48 : 0);
});
