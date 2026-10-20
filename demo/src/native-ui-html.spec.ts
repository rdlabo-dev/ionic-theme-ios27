import { afterEach, expect, test, vi } from 'vitest';
import { createHTMLWebProjection, readHTMLControl } from '../../packages/capacitor-native-ui/src/native/html';
import { createRuntime } from '../../packages/capacitor-native-ui/src/native/runtime';
import type {
  NativeUIRuntimeHandle,
  NativeUIRuntimeOptions,
  NativeUIPlugin,
  NativeUISnapshot,
} from '../../packages/capacitor-native-ui/src/native/definitions';

const handles: NativeUIRuntimeHandle[] = [];
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
    } as NativeUIRuntimeOptions,
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
  const snapshots: NativeUISnapshot[] = [];
  const plugin = {
    addListener: async (name: string, callback: (event: any) => void) => {
      listeners.set(name, callback);
      return {
        remove: async () => {
          listeners.delete(name);
        },
      };
    },
    update: async (snapshot: NativeUISnapshot) => {
      snapshots.push(snapshot);
      return { revision: snapshot.revision };
    },
    clear: async () => {},
  } as unknown as NativeUIPlugin;
  const click = vi.fn();
  source.addEventListener('click', click);
  const handle = await createRuntime(document, plugin, options);
  handles.push(handle);
  await vi.waitFor(() => expect(handle.getStatus().projected).toBe(1));
  expect(source.getAttribute('data-native-ui')).toBe('button');
  expect(source.hasAttribute('data-native-ui-projected')).toBe(true);
  source.setAttribute('data-native-ui', 'disabled');
  await vi.waitFor(() => expect(handle.getStatus().projected).toBe(0));
  expect(source.hasAttribute('data-native-ui-projected')).toBe(false);
  source.setAttribute('data-native-ui', 'button');
  await vi.waitFor(() => expect(handle.getStatus().projected).toBe(1));
  options.root!.setAttribute('data-native-ui', 'disabled');
  await vi.waitFor(() => expect(handle.getStatus().projected).toBe(0));
  expect(source.getAttribute('data-native-ui')).toBe('button');
  options.root!.removeAttribute('data-native-ui');
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
  expect(source.hasAttribute('data-native-ui-projected')).toBe(false);
  expect(source.getAttribute('data-native-ui')).toBe('button');
});

test('public shell changes Vertical Bars without restarting and restores source behavior', async () => {
  const { enableNativeUI } = await import('../../packages/capacitor-native-ui/src/core');
  const { source, options } = mount('<button data-native-ui="button" data-native-ui-placement="rail">Add</button>');
  const host = options.rail!.host;
  const clicks = vi.fn();
  source.addEventListener('click', clicks);
  const shell = await enableNativeUI({
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
  const { enableNativeUI } = await import('../../packages/capacitor-native-ui/src/core');
  const { source, options } = mount('<button data-native-ui="button" data-native-ui-placement="rail">Add</button>');
  const host = options.rail!.host;
  const shell = await enableNativeUI({
    root: options.root,
    verticalBars: { enabled: false, only: true, placement: { edge: 'trailing', webHost: host } },
  });
  handles.push(shell);
  expect(host.childElementCount).toBe(0);
  expect(source.hasAttribute('data-native-ui-web-source')).toBe(false);
  await shell.enableVerticalControlArea();
  await vi.waitFor(() => expect(host.childElementCount).toBe(1));
  await shell.destroy();
  const disabled = await enableNativeUI({
    root: options.root,
    controls: { buttons: false },
    verticalBars: { placement: { edge: 'trailing', webHost: host } },
  });
  handles.push(disabled);
  expect(host.childElementCount).toBe(0);
});

test('markForCheck batches property-only changes, skips equal snapshots, and stops after teardown', async () => {
  const { root, options } = mount('<section data-counter>Counter</section>');
  const source = root.querySelector<HTMLElement>('[data-counter]')! as HTMLElement & { count: number };
  source.count = 0;
  const read = vi.fn(() => ({ props: { count: source.count } }));
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
  const snapshots: NativeUISnapshot[] = [];
  let release: (() => void) | undefined;
  let hold = false;
  const plugin = {
    addListener: async () => ({ remove: async () => {} }),
    update: async (snapshot: NativeUISnapshot) => {
      snapshots.push(snapshot);
      if (hold) {
        hold = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return { revision: snapshot.revision };
    },
    clear: async () => {},
  } as unknown as NativeUIPlugin;
  const handle = await createRuntime(document, plugin, {
    ...options,
    extensions: [{ name: 'counter', selector: '[data-counter]', read }],
  });
  handles.push(handle);
  const nextFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  const count = () => JSON.parse(snapshots.at(-1)!.controls[0].extension!.props).count;
  await vi.waitFor(() => expect(handle.getStatus().projected).toBe(1));
  await nextFrame();
  await nextFrame();
  const before = snapshots.length;
  const reads = read.mock.calls.length;
  source.count = 1; // Property assignment does not create a MutationObserver record.
  for (let i = 0; i < 20; i++) expect(handle.markForCheck()).toBeUndefined();
  await vi.waitFor(() => expect(count()).toBe(1));
  expect(snapshots.length).toBe(before + 1);
  expect(read.mock.calls.length).toBe(reads + 1);
  handle.markForCheck();
  await nextFrame();
  await nextFrame();
  expect(snapshots.length).toBe(before + 1);

  hold = true;
  source.count = 2;
  handle.markForCheck();
  await vi.waitFor(() => expect(release).toBeDefined());
  source.count = 3;
  handle.markForCheck(); // A request during bridge work must survive its acknowledgement.
  release!();
  await vi.waitFor(() => expect(count()).toBe(3));

  const lease = await handle.suspend();
  source.count = 4;
  handle.markForCheck();
  await nextFrame();
  await nextFrame();
  expect(snapshots.at(-1)!.controls).toHaveLength(0);
  await lease.resume();
  await vi.waitFor(() => expect(count()).toBe(4));
  await handle.destroy();
  const stopped = snapshots.length;
  handle.markForCheck();
  await nextFrame();
  expect(snapshots.length).toBe(stopped);
});

test('extension images share SVG validation and rasterization without asynchronous readers', async () => {
  const { readExtension } = await import('../../packages/capacitor-native-ui/src/native/extensions');
  const { root } = mount('<section data-counter><svg width="16" height="16"><path d="M0 0h16v16z" /></svg></section>');
  const source = root.querySelector<HTMLElement>('section')!;
  const svg = source.querySelector('svg')!;
  const definition = {
    name: 'artwork',
    selector: '[data-counter]',
    read: (element: HTMLElement, context: import('../../packages/capacitor-native-ui/src/core').NativeUIReadContext) => {
      const icon = context.image(element.querySelector('svg'), { template: true });
      return { props: { icon: icon ? { ...icon } : null } };
    },
  };
  const candidate = readExtension(source, [definition], () => 'artwork')!;
  const renderer = { render: vi.fn().mockResolvedValue('png-base64'), clear: vi.fn() };
  await candidate.assets!.render(renderer);
  expect(renderer.render).toHaveBeenCalledTimes(1);
  expect(JSON.parse(candidate.control.extension!.props).icon).toEqual({ data: 'png-base64', width: 80, height: 44, template: true });
  svg.innerHTML = '<image href="https://example.invalid/image.png" />';
  const unsupported = readExtension(source, [definition], () => 'artwork')!;
  expect(JSON.parse(unsupported.control.extension!.props).icon).toBeNull();
  expect(unsupported.assets).toBeUndefined();
  svg.innerHTML = '<path d="M0 0h16v16z" />';
  const failed = readExtension(source, [definition], () => 'artwork')!;
  await expect(failed.assets!.render({ ...renderer, render: vi.fn().mockRejectedValue(new Error('decode')) })).rejects.toThrow('decode');
});

test('ionic.auto false preserves explicit ion-button rails, live toggles, and source clicks', async () => {
  const { enableNativeUI } = await import('../../packages/capacitor-native-ui/src/core');
  const { root, options } = mount(
    '<ion-button data-native-ui="button" data-native-ui-placement="rail">Explicit</ion-button><ion-button>Automatic</ion-button>',
  );
  const button = root.querySelector('ion-button')!;
  const click = vi.fn();
  button.addEventListener('click', click);
  const shell = await enableNativeUI({
    root,
    ionic: { auto: false },
    verticalBars: { placement: { edge: 'trailing', webHost: options.rail!.host } },
  });
  handles.push(shell);
  const host = options.rail!.host;
  await vi.waitFor(() => expect(host.querySelectorAll('button')).toHaveLength(1));
  host.querySelector('button')!.click();
  expect(click).toHaveBeenCalledTimes(1);
  await expect(
    enableNativeUI({ root, ionic: { auto: true }, verticalBars: { placement: { edge: 'trailing', webHost: host } } }),
  ).rejects.toThrow('different controls');
  await shell.disableVerticalControlArea();
  expect(host.childElementCount).toBe(0);
  await shell.enableVerticalControlArea();
  await vi.waitFor(() => expect(host.querySelectorAll('button')).toHaveLength(1));
});

test.each(['auto', 'extensions'] as const)('projection mode %s keeps only its eligible controls', async (source) => {
  const { root, options } = mount(
    '<ion-header><ion-toolbar><ion-button class="ios" data-native-ui="button">Explicit</ion-button><ion-button class="ios">Automatic</ion-button></ion-toolbar></ion-header><section data-counter>Counter</section>',
  );
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
  const snapshots: NativeUISnapshot[] = [];
  const plugin = {
    addListener: async () => ({ remove: async () => {} }),
    update: async (snapshot: NativeUISnapshot) => {
      snapshots.push(snapshot);
      return { revision: snapshot.revision };
    },
    clear: async () => {},
  } as unknown as NativeUIPlugin;
  const runtime = await createRuntime(document, plugin, {
    ...options,
    source,
    explicitControls: true,
    controls: { toolbar: false, tabs: false, segment: false, fab: false },
    extensions: [{ name: 'counter', selector: '[data-counter]', read: () => ({ props: {} }) }],
  });
  handles.push(runtime);
  const expected = source === 'extensions' ? ['extension'] : ['button', 'extension'];
  await vi.waitFor(() => expect(runtime.getStatus().projected).toBe(expected.length));
  expect(snapshots.at(-1)!.controls.map((item) => item.kind)).toEqual(expected);
  expect(root.querySelectorAll('[data-native-ui-projected]')).toHaveLength(expected.length);
  if (source === 'extensions') expect(root.querySelector('ion-button')!.hasAttribute('data-native-ui-projected')).toBe(false);
});

test('explicit Ionic Web rails preserve shadow icons and observe artwork changes', async () => {
  const { root, options } = mount(
    '<ion-button data-native-ui="button" data-native-ui-placement="rail" aria-label="Add"><ion-icon></ion-icon></ion-button>',
  );
  const shadow = root.querySelector('ion-icon')!.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg>';
  const handle = createHTMLWebProjection(document, options);
  handles.push(handle);
  const clone = options.rail!.host.querySelector('button')!;
  expect(clone.getAttribute('aria-label')).toBe('Add');
  expect(clone.querySelector('path')?.getAttribute('d')).toBe('M0 0h24v24z');
  shadow.querySelector('path')!.setAttribute('d', 'M0 0h12v12z');
  await vi.waitFor(() => expect(clone.querySelector('path')?.getAttribute('d')).toBe('M0 0h12v12z'));
});

test.each([
  { ionic: {} },
  { ionic: { auto: false }, controls: { buttons: false } },
  { controls: { buttons: true, toolbar: false } },
  { ionic: { auto: true }, controls: { buttons: false } },
  { ionic: { auto: { buttons: false } } },
  { ionic: { auto: { tabs: false } } },
])('explicit projection survives new automatic settings and legacy alias precedence: %j', async (settings) => {
  const { enableNativeUI } = await import('../../packages/capacitor-native-ui/src/core');
  const { root, options } = mount('<button data-native-ui="button" data-native-ui-placement="rail">Explicit</button>');
  const shell = await enableNativeUI({
    ...settings,
    root,
    verticalBars: { placement: { edge: 'trailing', webHost: options.rail!.host } },
  });
  handles.push(shell);
  await vi.waitFor(() => expect(options.rail!.host.querySelectorAll('button')).toHaveLength(1));
});
