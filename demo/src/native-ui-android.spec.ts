import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { NativeUIHandle, NativeUISnapshot } from '../../packages/capacitor-native-ui/src/native/definitions';

const bridge = vi.hoisted(() => ({
  available: true,
  configure: vi.fn(async () => ({ supported: true, extensions: ['app.counter'] })),
  addListener: vi.fn(async () => ({ remove: async () => {} })),
  update: vi.fn(async (snapshot: NativeUISnapshot) => ({ revision: snapshot.revision, rejectedControls: [] as string[] })),
  clear: vi.fn(async () => {}),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isPluginAvailable: () => bridge.available },
  registerPlugin: () => bridge,
}));
import { enableNativeUI } from '../../packages/capacitor-native-ui/src/core';

let shell: NativeUIHandle | undefined;
let root: HTMLElement;
let rail: HTMLElement;
const prepare = (element: HTMLElement) => {
  Object.assign(element.style, {
    visibility: 'visible',
    opacity: '1',
    transform: 'none',
    fontSize: '16px',
    color: 'rgb(0,0,0)',
    overflow: 'visible',
  });
  element.getBoundingClientRect = () => ({ x: 10, y: 10, left: 10, top: 10, right: 90, bottom: 54, width: 80, height: 44 }) as DOMRect;
};
beforeEach(() => {
  bridge.available = true;
  vi.clearAllMocks();
  bridge.update.mockImplementation(async (snapshot) => ({ revision: snapshot.revision, rejectedControls: [] }));
  document.body.innerHTML =
    '<main><button data-native-ui="button" data-native-ui-placement="rail">Back</button><section data-counter><button>Increment</button></section></main><aside></aside>';
  document.querySelectorAll<HTMLElement>('*').forEach(prepare);
  root = document.querySelector('main')!;
  rail = document.querySelector('aside')!;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MediaQueryList);
});
afterEach(async () => {
  await shell?.destroy();
  shell = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
const options = () => ({ root, verticalBars: { placement: { edge: 'trailing' as const, webHost: rail } } });

test.each([true, false])(
  'Android Web rail preserves original actions and live controls with native plugin available=%s',
  async (available) => {
    bridge.available = available;
    const source = root.querySelector('button')!;
    const click = vi.fn();
    source.addEventListener('click', click);
    shell = await enableNativeUI(options());
    await vi.waitFor(() => expect(rail.querySelector('button')).not.toBeNull());
    rail.querySelector('button')!.click();
    expect(click).toHaveBeenCalledOnce();
    expect(source.hasAttribute('data-native-ui-projected')).toBe(false);
    expect(bridge.update.mock.calls.every(([snapshot]) => snapshot.controls.length === 0)).toBe(true);
    await shell.disableVerticalControlArea();
    await vi.waitFor(() => expect(rail.children).toHaveLength(0));
    expect(source.hasAttribute('data-native-ui-web-source')).toBe(false);
    await shell.enableVerticalControlArea();
    await vi.waitFor(() => expect(rail.querySelector('button')).not.toBeNull());
    const lease = await shell.suspend();
    expect(rail.children).toHaveLength(0);
    await lease.resume();
    await vi.waitFor(() => expect(rail.querySelector('button')).not.toBeNull());
    await shell.destroy();
    expect(rail.children).toHaveLength(0);
    expect(source.hasAttribute('data-native-ui-web-source')).toBe(false);
  },
);

test.each([false, 'verticalOnly', 'horizontalOnly'] as const)(
  'Android extensions and explicit Web rails are independent of controls=%s',
  async (controls) => {
    shell = await enableNativeUI({
      ...options(),
      controls,
      ionic: { auto: false },
      extensions: [{ name: 'app.counter', selector: '[data-counter]', read: () => ({ props: { count: 0 } }) }],
    });
    await vi.waitFor(() => expect(shell!.getStatus().projected).toBe(2));
    expect(shell.getStatus().state).toBe('native');
    expect(bridge.update.mock.calls.at(-1)![0].controls.map((control) => control.kind)).toEqual(['extension']);
    await shell.disableVerticalControlArea();
    await vi.waitFor(() => expect(shell!.getStatus().projected).toBe(1));
    expect(root.querySelector('[data-counter]')!.hasAttribute('data-native-ui-projected')).toBe(true);
    expect(rail.children).toHaveLength(0);
  },
);

test('native extension ownership suppresses a Web rail proxy and rejection restores its original action', async () => {
  const source = root.querySelector('button')!;
  source.setAttribute('data-counter', '');
  root.querySelector('section')!.remove();
  const click = vi.fn();
  source.addEventListener('click', click);
  let count = 0;
  shell = await enableNativeUI({
    ...options(),
    extensions: [{ name: 'app.counter', selector: '[data-counter]', read: () => ({ props: { count } }) }],
  });
  await vi.waitFor(() => {
    expect(source.hasAttribute('data-native-ui-projected')).toBe(true);
    expect(rail.children).toHaveLength(0);
  });
  bridge.update.mockImplementation(async (snapshot) => ({
    revision: snapshot.revision,
    rejectedControls: snapshot.controls.map((control) => control.id),
  }));
  count++;
  shell.markForCheck();
  await vi.waitFor(() => {
    expect(source.hasAttribute('data-native-ui-projected')).toBe(false);
    expect(rail.querySelector('button')).not.toBeNull();
  });
  rail.querySelector('button')!.click();
  expect(click).toHaveBeenCalledOnce();
});

test('diagnostics identify late unregistered sources and reader failures without logging props or repeated messages', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const missing = vi.fn(() => ({ props: {} }));
  let broken = true;
  shell = await enableNativeUI({
    ...options(),
    debug: true,
    extensions: [
      { name: 'app.missing', selector: '[data-missing]', read: missing },
      {
        name: 'app.counter',
        selector: '[data-counter]',
        read: () => {
          if (broken) throw new Error('private-state');
          return { props: {} };
        },
      },
    ],
  });
  const source = root.querySelector<HTMLElement>('[data-counter]')!;
  await vi.waitFor(() =>
    expect(log.mock.calls.some(([message, element]) => String(message).includes('reader-error') && element === source)).toBe(true),
  );
  shell.markForCheck();
  const late = document.createElement('div');
  late.dataset['missing'] = '';
  prepare(late);
  root.append(late);
  await vi.waitFor(() =>
    expect(log.mock.calls.some(([message, element]) => String(message).includes('unregistered-extension') && element === late)).toBe(true),
  );
  expect(missing).not.toHaveBeenCalled();
  expect(log.mock.calls.filter(([message]) => String(message).includes('reader-error'))).toHaveLength(1);
  expect(log.mock.calls.some(([message]) => String(message).includes('private-state'))).toBe(false);
  broken = false;
  shell.markForCheck();
  await vi.waitFor(() => expect(source.hasAttribute('data-native-ui-projected')).toBe(true));
});

test.each([true, false])('native rejection retains usable Web source with debug=%s', async (debug) => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  bridge.update.mockImplementation(async (snapshot) => ({
    revision: snapshot.revision,
    rejectedControls: snapshot.controls.map((control) => control.id),
  }));
  shell = await enableNativeUI({
    ...options(),
    debug,
    extensions: [{ name: 'app.counter', selector: '[data-counter]', read: () => ({ props: {} }) }],
  });
  await vi.waitFor(() => expect(bridge.update).toHaveBeenCalled());
  await vi.waitFor(() => expect(root.querySelector('[data-counter]')!.hasAttribute('data-native-ui-projected')).toBe(false));
  if (debug) await vi.waitFor(() => expect(log.mock.calls.some(([message]) => String(message).includes('native-rejected'))).toBe(true));
  else expect(log).not.toHaveBeenCalled();
});

test('plain HTML extensions follow CSS color-scheme without theme variables', async () => {
  const source = root.querySelector<HTMLElement>('[data-counter]')!;
  source.style.colorScheme = 'dark';
  shell = await enableNativeUI({
    ...options(),
    extensions: [{ name: 'app.counter', selector: '[data-counter]', read: () => ({ props: {} }) }],
  });
  await vi.waitFor(() => expect(bridge.update.mock.calls.at(-1)?.[0].controls[0]?.dark).toBe(true));
  source.style.colorScheme = 'light';
  await vi.waitFor(() => expect(bridge.update.mock.calls.at(-1)?.[0].controls[0]?.dark).toBe(false));
});

test.each(['bridge', 'pagehide', 'bridge then pagehide'])('shell restarts after %s without duplicate ownership', async (cause) => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  let count = 0;
  const config = {
    ...options(),
    extensions: [{ name: 'app.counter', selector: '[data-counter]', read: () => ({ props: { count } }) }],
  };
  shell = await enableNativeUI(config);
  const previous = shell;
  await vi.waitFor(() => expect(previous.getStatus().projected).toBe(2));
  if (cause !== 'pagehide') {
    bridge.update.mockRejectedValueOnce(new Error('Temporary bridge failure'));
    count++;
    previous.markForCheck();
  } else window.dispatchEvent(new Event('pagehide'));
  await vi.waitFor(() => expect(bridge.clear).toHaveBeenCalled());
  if (cause !== 'pagehide') {
    await vi.waitFor(() => expect(previous.getStatus().state).toBe('web'));
    expect(rail.querySelectorAll('button')).toHaveLength(1);
    if (cause === 'bridge then pagehide') {
      window.dispatchEvent(new Event('pagehide'));
      await vi.waitFor(() => expect(previous.getStatus().state).toBe('stopped'));
      expect(rail.querySelectorAll('button')).toHaveLength(0);
    }
  }
  shell = await enableNativeUI(config);
  expect(shell).not.toBe(previous);
  await vi.waitFor(() => expect(shell!.getStatus().projected).toBe(2));
  expect(previous.getStatus().state).toBe('stopped');
  expect(rail.querySelectorAll('button')).toHaveLength(1);
  expect(bridge.configure).toHaveBeenCalledTimes(2);
  await previous.destroy();
  expect(shell.getStatus().state).toBe('native');
});
