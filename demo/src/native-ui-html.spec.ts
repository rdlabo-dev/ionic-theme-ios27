import { afterEach, expect, test, vi } from 'vitest';
import { createHTMLWebProjection, readHTMLControl } from '../../packages/capacitor-native-ui/src/native/html';
import { createRuntime } from '../../packages/capacitor-native-ui/src/native/runtime';
import type {
  NativeUIShellRuntimeHandle,
  NativeUIShellRuntimeOptions,
  NativeUIShellPlugin,
  ShellSnapshot,
} from '../../packages/capacitor-native-ui/src/native/definitions';

const handles: NativeUIShellRuntimeHandle[] = [];
const mount = (markup = '<button type="button" data-native-ui="button">Add</button>') => {
  document.body.innerHTML = `<main id="root">${markup}</main><aside id="rail"></aside><button data-native-ui="button">Outside</button>`;
  document.querySelectorAll<HTMLElement>('*').forEach((node) => {
    Object.assign(node.style, {
      visibility: 'visible',
      opacity: '1',
      transform: 'none',
      fontSize: '16px',
      color: 'rgb(0, 0, 0)',
      overflow: 'visible',
    });
    node.getBoundingClientRect = () => ({ x: 10, y: 10, left: 10, top: 10, right: 90, bottom: 54, width: 80, height: 44 }) as DOMRect;
  });
  const root = document.querySelector<HTMLElement>('#root')!;
  return {
    root,
    source: root.querySelector<HTMLElement>('[data-native-ui]')!,
    sourceType: 'html',
    options: {
      source: 'html',
      root,
      rail: { host: document.querySelector<HTMLElement>('#rail')!, edge: 'right' },
    } as NativeUIShellRuntimeOptions,
  };
};
afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.destroy()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

test('HTML adapters produce standard native kinds without Ionic mode or theme variables', () => {
  const { source, options } = mount();
  const candidate = readHTMLControl(source, () => 'action', options)!;
  expect(candidate.control.kind).toBe('button');
  expect(candidate.control.items[0].accessibilityLabel).toBe('Add');
  source.setAttribute('data-native-ui', 'back-button');
  expect(readHTMLControl(source, () => 'back', options)?.control.kind).toBe('back-button');
  expect(readHTMLControl(document.body.lastElementChild as HTMLElement, () => 'outside', options)).toBeUndefined();
  source.hidden = true;
  expect(readHTMLControl(source, () => 'action', options)).toBeUndefined();
});

test('accessible names and inherited disabled state follow standard HTML semantics', () => {
  const { source, options } = mount(
    '<span id="name">Save changes</span><fieldset disabled><button data-native-ui="button" aria-labelledby="name">Save</button></fieldset>',
  );
  const item = readHTMLControl(source, () => 'save', options)!.control.items[0];
  expect(item.accessibilityLabel).toBe('Save changes');
  expect(item.disabled).toBe(true);
});

test('Web rail forwards source form behavior, updates state, rejects stale clicks, and restores sources', async () => {
  const { source, options, root } = mount(
    '<form><button type="submit" data-native-ui="button" data-native-ui-placement="rail">Save</button></form>',
  );
  const submit = vi.fn((event: Event) => event.preventDefault());
  root.querySelector('form')!.addEventListener('submit', submit);
  const handle = createHTMLWebProjection(document, options);
  handles.push(handle);
  const clone = options.rail!.host.querySelector<HTMLButtonElement>('button')!;
  expect(clone.textContent).toBe('Save');
  clone.click();
  expect(submit).toHaveBeenCalledTimes(1);
  source.setAttribute('disabled', '');
  // Revalidation prevents clicks even before the mutation observer refreshes the clone.
  clone.click();
  expect(submit).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(clone.disabled).toBe(true));
  source.removeAttribute('disabled');
  source.textContent = 'Updated';
  await vi.waitFor(() => expect(clone.textContent).toBe('Updated'));
  source.remove();
  clone.click();
  expect(submit).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(options.rail!.host.children.length).toBe(0));
  root.append(source);
  await vi.waitFor(() => expect(options.rail!.host.children.length).toBe(1));
  await handle.destroy();
  expect(source.hasAttribute('data-native-ui-web-source')).toBe(false);
  expect(source.hasAttribute('aria-hidden')).toBe(false);
  expect(options.rail!.host.children.length).toBe(0);
});

test('routerless back delegates to the source and suspension returns ownership to the Web', async () => {
  const { source, options } = mount('<button type="button" data-native-ui="back-button" data-native-ui-placement="rail">Back</button>');
  const back = vi.fn();
  const history = vi.spyOn(window.history, 'back');
  source.addEventListener('click', back);
  const handle = createHTMLWebProjection(document, options);
  handles.push(handle);
  options.rail!.host.querySelector<HTMLButtonElement>('button')!.click();
  expect(back).toHaveBeenCalledTimes(1);
  expect(history).not.toHaveBeenCalled();
  const lease = await handle.suspend();
  expect(options.rail!.host.children.length).toBe(0);
  expect(source.hasAttribute('data-native-ui-web-source')).toBe(false);
  await lease.resume();
  await vi.waitFor(() => expect(options.rail!.host.children.length).toBe(1));
});

test('native bridge uses the same standard model, revalidates actions, and retires removed HTML controls', async () => {
  const { source, options } = mount();
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
  const listeners = new Map<string, (event: any) => void>();
  const snapshots: ShellSnapshot[] = [];
  const plugin = {
    addListener: async (name: string, callback: (event: any) => void) => {
      listeners.set(name, callback);
      return {
        remove: async () => {
          listeners.delete(name);
        },
      };
    },
    update: async (snapshot: ShellSnapshot) => {
      snapshots.push(snapshot);
      return { revision: snapshot.revision };
    },
    clear: async () => {},
  } as unknown as NativeUIShellPlugin;
  const click = vi.fn();
  source.addEventListener('click', click);
  const handle = await createRuntime(document, plugin, options);
  handles.push(handle);
  await vi.waitFor(() => expect(handle.getStatus().projected).toBe(1));
  const snapshot = snapshots.at(-1)!;
  expect(snapshot.controls.map((control) => control.kind)).toEqual(['button']);
  const id = snapshot.controls[0].items[0].id;
  listeners.get('activate')!({ id, revision: snapshot.revision, sequence: 1 });
  expect(click).toHaveBeenCalledTimes(1);
  source.setAttribute('disabled', '');
  listeners.get('activate')!({ id, revision: snapshot.revision, sequence: 2 });
  expect(click).toHaveBeenCalledTimes(1);
  source.remove();
  await vi.waitFor(() => expect(handle.getStatus().projected).toBe(0));
  expect(source.hasAttribute('data-native-ui-shell')).toBe(false);
});

test('public shell changes Vertical Bars without restarting and restores source behavior', async () => {
  const { enableNativeUIShell } = await import('../../packages/capacitor-native-ui/src/core');
  const { source, options } = mount('<button data-native-ui="button" data-native-ui-placement="rail">Add</button>');
  const host = options.rail!.host;
  const clicks = vi.fn();
  source.addEventListener('click', clicks);
  const shell = await enableNativeUIShell({
    root: options.root,
    controls: { tabs: false },
    verticalBars: { only: true, placement: { edge: 'trailing', webHost: host } },
  });
  handles.push(shell);
  await vi.waitFor(() => expect(host.querySelector('button')).not.toBeNull());
  host.querySelector('button')!.click();
  expect(clicks).toHaveBeenCalledTimes(1);
  await shell.disableVerticalControlArea();
  expect(host.childElementCount).toBe(0);
  expect(source.hasAttribute('data-native-ui-web-source')).toBe(false);
  source.click();
  expect(clicks).toHaveBeenCalledTimes(2);
  await shell.enableVerticalControlArea();
  await vi.waitFor(() => expect(host.childElementCount).toBe(1));
  await Promise.all([shell.disableVerticalControlArea(), shell.enableVerticalControlArea(), shell.disableVerticalControlArea()]);
  expect(host.childElementCount).toBe(0);
  await shell.destroy();
  await expect(shell.enableVerticalControlArea()).rejects.toThrow('destroyed');
});

test('disabled startup and buttons opt-out keep HTML sources on the Web', async () => {
  const { enableNativeUIShell } = await import('../../packages/capacitor-native-ui/src/core');
  const { source, options } = mount('<button data-native-ui="button" data-native-ui-placement="rail">Add</button>');
  const host = options.rail!.host;
  const shell = await enableNativeUIShell({
    root: options.root,
    verticalBars: { enabled: false, only: true, placement: { edge: 'trailing', webHost: host } },
  });
  handles.push(shell);
  expect(host.childElementCount).toBe(0);
  expect(source.hasAttribute('data-native-ui-web-source')).toBe(false);
  await shell.enableVerticalControlArea();
  await vi.waitFor(() => expect(host.childElementCount).toBe(1));
  await shell.destroy();
  const disabled = await enableNativeUIShell({
    root: options.root,
    controls: { buttons: false },
    verticalBars: { placement: { edge: 'trailing', webHost: host } },
  });
  handles.push(disabled);
  expect(host.childElementCount).toBe(0);
});
