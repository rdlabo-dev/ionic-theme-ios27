import { mockSnapshotOwnership } from './snapshot-scope-fixture';
import { beforeEach } from 'vitest';
import { getProjectionState } from '../../packages/capacitor-native-ui/src/native/shared/covered-source';
const projectionState = getProjectionState(document);
const { sourcesChangedEvent } = projectionState;
import { afterEach, expect, test, vi, onTestFinished } from 'vitest';
import { createHTMLWebProjection, readHTMLControl } from '../../packages/capacitor-native-ui/src/native/html';
import { createRuntime } from '../../packages/capacitor-native-ui/src/native/runtime';
import type {
  NativeUIRuntimeHandle,
  NativeUIRuntimeOptions,
  NativeUIPlugin,
  NativeUISnapshot,
} from '../../packages/capacitor-native-ui/src/native/definitions';

let owners: Set<HTMLElement>, visibleOwners: Set<HTMLElement>, preparedOwners: Set<HTMLElement>;
beforeEach(() => {
  ({ owners, visibleOwners, preparedOwners } = mockSnapshotOwnership(projectionState));
});

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

test('Web rail follows source order without replacing proxies or application-owned host content', async () => {
  const { root, options } = mount(
    '<button data-native-ui="button" data-native-ui-placement="rail">A</button>' +
      '<button data-native-ui="button" data-native-ui-placement="rail">B</button>',
  );
  const host = options.rail!.host;
  const heading = document.createElement('h2');
  heading.textContent = 'Actions';
  host.append(heading);
  const handle = createHTMLWebProjection(document, options);
  handles.push(handle);
  const proxies = () => Array.from(host.querySelectorAll<HTMLButtonElement>('button'));
  const [a, b] = proxies();
  const sourceB = root.lastElementChild as HTMLButtonElement;
  const click = vi.fn();
  sourceB.addEventListener('click', click);
  b.focus();
  root.prepend(sourceB);
  await vi.waitFor(() => expect(proxies()).toEqual([b, a]));
  expect(document.activeElement).toBe(b);
  b.click();
  expect(click).toHaveBeenCalledTimes(1);

  const sourceC = sourceB.cloneNode(true) as HTMLButtonElement;
  sourceC.removeAttribute('data-native-ui-web-source');
  sourceC.textContent = 'C';
  sourceC.getBoundingClientRect = sourceB.getBoundingClientRect;
  root.prepend(sourceC);
  await vi.waitFor(() => expect(proxies().map((proxy) => proxy.textContent)).toEqual(['C', 'B', 'A']));
  expect(proxies().slice(1)).toEqual([b, a]);
  expect(host.firstElementChild).toBe(heading);
  expect(document.activeElement).toBe(b);
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
    verticalBars: { placement: { edge: 'trailing', webHost: host } },
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

test('rail availability gates explicit HTML, but selection defaults do not', async () => {
  const { enableNativeUI } = await import('../../packages/capacitor-native-ui/src/core');
  const { source, options } = mount('<button data-native-ui="button" data-native-ui-placement="rail">Add</button>');
  const host = options.rail!.host;
  const shell = await enableNativeUI({
    root: options.root,
    verticalBars: { enabled: false, placement: { edge: 'trailing', webHost: host } },
  });
  handles.push(shell);
  expect(host.childElementCount).toBe(0);
  expect(source.hasAttribute('data-native-ui-web-source')).toBe(false);
  await shell.enableVerticalControlArea();
  await vi.waitFor(() => expect(host.childElementCount).toBe(1));
  await shell.destroy();
  const disabled = await enableNativeUI({
    root: options.root,
    controls: false,
    verticalBars: { placement: { edge: 'trailing', webHost: host } },
  });
  handles.push(disabled);
  await vi.waitFor(() => expect(host.childElementCount).toBe(1));
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
    controls: false,
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
  { ionic: { auto: false }, controls: false },
  { controls: 'horizontalOnly' as const },
  { controls: { button: false, buttonGroup: true } },
])('explicit projection survives selection defaults and automatic discovery settings: %j', async (settings) => {
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

test('toolbar correspondence crosses source replacement while stale actions stay rejected', async () => {
  const { source, options } = mount('<div role="toolbar"><button data-native-ui="button">Edit</button></div>');
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
  const handle = await createRuntime(document, plugin, options);
  handles.push(handle);
  await vi.waitFor(() => expect(handle.getStatus().projected).toBe(1));
  const outgoing = snapshots.at(-1)!.controls[0].items[0];
  expect(outgoing.transitionId).toBeDefined();
  const next = source.cloneNode(true) as HTMLElement;
  next.removeAttribute('data-native-ui-projected');
  next.removeAttribute('aria-hidden');
  next.getBoundingClientRect = source.getBoundingClientRect;
  next.textContent = 'Done';
  const clicked = vi.fn();
  next.addEventListener('click', clicked);
  source.replaceWith(next);
  await vi.waitFor(() => expect(snapshots.at(-1)!.controls[0]?.items[0].label).toBe('Done'));
  const incoming = snapshots.at(-1)!.controls[0].items[0];
  expect(incoming.transitionId).toBe(outgoing.transitionId);
  expect(incoming.id).not.toBe(outgoing.id);
  listeners.get('activate')!({ id: outgoing.id, revision: snapshots.at(-1)!.revision, sequence: 1 });
  expect(clicked).not.toHaveBeenCalled();
  listeners.get('activate')!({ id: incoming.id, revision: snapshots.at(-1)!.revision, sequence: 2 });
  expect(clicked).toHaveBeenCalledTimes(1);
  next.setAttribute('data-transition-id', 'edit');
  await vi.waitFor(() => expect(snapshots.at(-1)!.controls[0].items[0].transitionId).not.toBe(incoming.transitionId));
  expect(snapshots.at(-1)!.controls[0].items[0].id).toBe(incoming.id);
});

test('a frozen native image suppresses HTML rail proxies and stale proxy clicks until release', async () => {
  const { source, options } = mount('<button data-native-ui="button" data-native-ui-placement="rail">Save</button>');
  const click = vi.fn();
  source.addEventListener('click', click);
  const handle = createHTMLWebProjection(document, options);
  handles.push(handle);
  const previous = options.rail!.host.querySelector<HTMLButtonElement>('button')!;
  try {
    owners.add(source);
    previous.click();
    expect(click).not.toHaveBeenCalled();
    window.dispatchEvent(new Event(sourcesChangedEvent));
    await vi.waitFor(() => expect(options.rail!.host.children.length).toBe(0));
    owners.delete(source);
    window.dispatchEvent(new Event(sourcesChangedEvent));
    await vi.waitFor(() => expect(options.rail!.host.querySelector('button')).not.toBeNull());
    options.rail!.host.querySelector<HTMLButtonElement>('button')!.click();
    expect(click).toHaveBeenCalledOnce();
  } finally {
    owners.delete(source);
  }
});

test('native popover retention skips image handoff; a Web fallback reuses it without replaying activation', async () => {
  // This integration uses the real image ownership, not the rail-only unit test fixture.
  vi.restoreAllMocks();
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
  vi.spyOn(HTMLImageElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 80, height: 44 }));
  const decode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  onTestFinished(() => {
    if (decode) Object.defineProperty(HTMLImageElement.prototype, 'decode', decode);
    else delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
  });
  let latest: NativeUISnapshot;
  const updates: NativeUISnapshot[] = [];
  const capture = vi.fn(async (args: { action: string; ids?: string[] }) =>
    args.action === 'prepare'
      ? {
          token: 'ready-image',
          parts: args.ids!.map((id) => ({ ids: [id], url: 'file:///snapshot.png', x: 0, y: 0, width: 80, height: 44 })),
        }
      : { shown: true },
  );
  const plugin = {
    addListener: async () => ({ remove: async () => {} }),
    update: async (snapshot: NativeUISnapshot) => {
      latest = snapshot;
      updates.push(snapshot);
      return { revision: snapshot.revision };
    },
    coveredSnapshot: capture,
    clear: async () => {},
  } as unknown as NativeUIPlugin;
  const runtime = await createRuntime(document, plugin, { ...options, source: 'auto', coveredSnapshots: true });
  handles.push(runtime);
  // Native-owned clones must hide the whole composited layer: a child may
  // explicitly remain visible even when its host has visibility:hidden.
  const clone = document.createElement('ion-button');
  clone.className = 'ion-cloned-element';
  clone.innerHTML = '<span style="visibility:visible">Save</span>';
  document.body.append(clone);
  for (const marker of [
    'data-native-ui-vertical-bars',
    'data-native-ui-vertical-bars-member',
    'data-native-ui-snapshot-source',
    'data-native-ui-proxy-prepared',
  ]) {
    clone.setAttribute(marker, '');
    expect(getComputedStyle(clone).opacity).toBe('0');
    expect(getComputedStyle(clone).contentVisibility).toBe('hidden');
    clone.setAttribute('data-native-ui-snapshot-visible', '');
    expect(getComputedStyle(clone).opacity).not.toBe('0');
    expect(getComputedStyle(clone).contentVisibility).not.toBe('hidden');
    clone.removeAttribute('data-native-ui-snapshot-visible');
    clone.removeAttribute(marker);
    expect(getComputedStyle(clone).opacity).not.toBe('0');
    expect(getComputedStyle(clone).contentVisibility).not.toBe('hidden');
  }
  clone.remove();
  await vi.waitFor(() => expect(source.hasAttribute('data-native-ui-snapshot')).toBe(true));
  const click = vi.fn();
  source.addEventListener('click', click);
  const popover = document.createElement('ion-popover');
  document.body.append(popover);
  const content = document.createElement('div');
  content.className = 'ion-page';
  popover.append(content);
  content.dispatchEvent(new CustomEvent('ionViewWillEnter', { bubbles: true }));
  expect(source.hasAttribute('data-native-ui-snapshot')).toBe(true);
  Object.assign(popover, { presented: true });
  runtime.markForCheck();
  await new Promise((resolve) => setTimeout(resolve, 40));
  expect(runtime.getStatus().projected).toBe(1);
  popover.dispatchEvent(new CustomEvent('ionPopoverWillPresent', { bubbles: true }));
  const release = runtime.retain();
  await new Promise((resolve) => setTimeout(resolve, 60));
  expect(capture.mock.calls.some(([args]) => args.action === 'cover')).toBe(false);
  release();
  await vi.waitFor(() => expect(capture.mock.calls.some(([args]) => args.action === 'cover')).toBe(true));
  expect(source.hasAttribute('data-native-ui-snapshot-visible')).toBe(true);
  const beforeReturn = updates.length;
  popover.dispatchEvent(new CustomEvent('ionPopoverDidDismiss', { bubbles: true }));
  popover.remove();
  await vi.waitFor(() => {
    expect(updates.length).toBeGreaterThan(beforeReturn);
    expect(source.hasAttribute('data-native-ui-snapshot-visible')).toBe(false);
  });
  expect(updates[beforeReturn].controls).toHaveLength(1);
  expect(updates[beforeReturn].transitionDuration).toBe(0);
  expect(source.hasAttribute('data-native-ui-projected')).toBe(true);
  expect(source.hasAttribute('data-native-ui-fading')).toBe(false);
  expect(latest!.controls).toHaveLength(1);
  expect(click).not.toHaveBeenCalled();

  // Framework teardown may remove an overlay without emitting DidDismiss.
  // The shared monitor must release this consumer's image as well as native-init sessions.
  await vi.waitFor(() => expect(capture.mock.calls.filter(([args]) => args.action === 'prepare').length).toBeGreaterThan(1));
  const alert = document.createElement('ion-alert');
  document.body.append(alert);
  alert.dispatchEvent(new CustomEvent('ionAlertWillPresent', { bubbles: true }));
  await vi.waitFor(() => expect(source.hasAttribute('data-native-ui-snapshot-visible')).toBe(true));
  alert.remove();
  await vi.waitFor(() => expect(source.hasAttribute('data-native-ui-snapshot-visible')).toBe(false));
  expect(source.hasAttribute('data-native-ui-projected')).toBe(true);
});

test('older Native binaries keep modal rail projection and geometry updates during dragging', async () => {
  const { observeVerticalBarsModals, movingModal } = await import('../../packages/capacitor-native-ui/src/native/shared/modal');
  const { source, options } = mount(
    '<ion-app class="ios-theme-vertical-bars"><ion-modal><button data-native-ui="button" data-native-ui-placement="rail">Save</button></ion-modal></ion-app>',
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
  const modal = source.closest('ion-modal')!;
  const wrapper = document.createElement('div');
  wrapper.setAttribute('part', 'content');
  modal.attachShadow({ mode: 'open' }).append(wrapper);
  let y = 100;
  wrapper.getBoundingClientRect = () => DOMRect.fromRect({ y, width: innerWidth, height: innerHeight - y });
  wrapper.getAnimations = () => [];
  modal.getAnimations = () => [];
  Object.defineProperty(wrapper, 'offsetWidth', { value: innerWidth });
  Object.defineProperty(wrapper, 'offsetLeft', { value: 0 });
  const stopModals = observeVerticalBarsModals(document);
  const snapshots: NativeUISnapshot[] = [];
  const plugin = {
    addListener: async () => ({ remove: async () => {} }),
    update: async (snapshot: NativeUISnapshot) => {
      snapshots.push(snapshot);
      return { revision: snapshot.revision };
    },
    clear: async () => {},
  } as unknown as NativeUIPlugin;
  const runtime = await createRuntime(document, plugin, { ...options, source: 'auto' });
  handles.push(runtime);
  try {
    modal.dispatchEvent(new Event('ionModalDidPresent', { bubbles: true }));
    await vi.waitFor(() => expect(snapshots.at(-1)?.controls).toHaveLength(1));
    const controlID = snapshots.at(-1)!.controls[0].id;
    const firstFrame = snapshots.at(-1)!.verticalBarFrame;
    expect(firstFrame).toBeDefined();
    modal.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    y = 200;
    await vi.waitFor(() => expect(movingModal(document)).toBe(modal));
    await vi.waitFor(() => {
      const current = snapshots.at(-1)!;
      expect(current.controls.map((control) => control.id)).toContain(controlID);
      expect(current.verticalBarFrame).toBeDefined();
      expect(current.verticalBarFrame).not.toEqual(firstFrame);
    });
    expect(source.hasAttribute('data-native-ui-projected')).toBe(true);
  } finally {
    stopModals();
  }
});

test('Native rail acquisition publishes owner and member attributes before notifying Web', async () => {
  const { source, options } = mount('<button data-native-ui="button" data-native-ui-placement="rail">Save</button>');
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
  const observed: boolean[][] = [];
  const acquired = () =>
    observed.push([source.hasAttribute('data-native-ui-vertical-bars'), source.hasAttribute('data-native-ui-vertical-bars-member')]);
  window.addEventListener('nativeUIVerticalBarsAcquire', acquired);
  onTestFinished(() => window.removeEventListener('nativeUIVerticalBarsAcquire', acquired));
  const plugin = {
    addListener: async () => ({ remove: async () => {} }),
    update: async (snapshot: NativeUISnapshot) => ({ revision: snapshot.revision }),
    clear: async () => {},
  } as unknown as NativeUIPlugin;
  const runtime = await createRuntime(document, plugin, options);
  handles.push(runtime);
  await vi.waitFor(() => expect(runtime.getStatus().projected).toBe(1));
  expect(observed.length).toBeGreaterThan(0);
  expect(observed.every(([owner, member]) => owner && member)).toBe(true);
});

test.each([0.00001525878906, 1])('modal entry accepts round-off but resynchronizes a real size change (%s px)', async (delta) => {
  const { observeVerticalBarsModals, modalPresentation } = await import('../../packages/capacitor-native-ui/src/native/shared/modal');
  const { source, options } = mount(
    '<ion-app class="ios-theme-vertical-bars"><ion-modal><button data-native-ui="button" data-native-ui-placement="rail">Save</button></ion-modal></ion-app>',
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      a = 1;
      d = 1;
      b = 0;
      c = 0;
      m41 = 0;
      m42 = 100;
      isIdentity = true;
    },
  );
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MediaQueryList);
  const modal = source.closest('ion-modal')!;
  const wrapper = document.createElement('div');
  wrapper.setAttribute('part', 'content');
  modal.attachShadow({ mode: 'open' }).append(wrapper);
  wrapper.getBoundingClientRect = () => DOMRect.fromRect({ y: 139.99999993, width: innerWidth, height: innerHeight - 40.00000006 });
  Object.defineProperty(wrapper, 'offsetWidth', { value: innerWidth });
  Object.defineProperty(wrapper, 'offsetLeft', { value: 0 });
  wrapper.getAnimations = () =>
    [
      {
        playState: 'running',
        playbackRate: 1,
        currentTime: 100,
        effect: {
          getTiming: () => ({ duration: 500, iterations: 1, direction: 'normal', delay: 0, easing: 'linear' }),
          getKeyframes: () => [
            { transform: 'translateY(600px)', easing: 'linear' },
            { transform: 'translateY(0px)', easing: 'linear' },
          ],
        },
      },
    ] as unknown as Animation[];
  modal.getAnimations = () => [];
  let height = 44;
  source.getBoundingClientRect = () => DOMRect.fromRect({ x: 10, y: 10, width: 80, height });
  const stopModals = observeVerticalBarsModals(document, () => true);
  modal.dispatchEvent(new Event('ionModalWillPresent', { bubbles: true }));
  expect(modalPresentation(modal)?.frame).toEqual({ x: 0, y: 40, width: innerWidth, height: innerHeight - 40 });
  const snapshots: NativeUISnapshot[] = [];
  const capture = vi.fn(async (_args: { action: string }) => ({}));
  const plugin = {
    addListener: async () => ({ remove: async () => {} }),
    update: async (snapshot: NativeUISnapshot) => {
      snapshots.push(snapshot);
      if (snapshots.length === 1) {
        height += delta;
        source.style.height = `${height}px`;
        await Promise.resolve();
      }
      return { revision: snapshot.revision };
    },
    coveredSnapshot: capture,
    clear: async () => {},
  } as unknown as NativeUIPlugin;
  try {
    const runtime = await createRuntime(document, plugin, { ...options, source: 'auto', coveredSnapshots: true });
    handles.push(runtime);
    await vi.waitFor(() => expect(source.hasAttribute('data-native-ui-projected')).toBe(true));
    expect(snapshots).toHaveLength(delta < 0.001 ? 1 : 2);
    expect(snapshots.at(-1)?.controls[0].height).toBe(delta < 0.001 ? 44 : 45);
    // Native may already be visible, but its screen pixels are still moving.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(capture.mock.calls.some(([args]) => args.action === 'prepare')).toBe(false);
    wrapper.getAnimations = () => [];
    wrapper.getBoundingClientRect = () => DOMRect.fromRect({ y: 40, width: innerWidth, height: innerHeight - 40 });
    modal.dispatchEvent(new Event('ionModalDidPresent', { bubbles: true }));
    await vi.waitFor(() => expect(capture.mock.calls.some(([args]) => args.action === 'prepare')).toBe(true));
  } finally {
    stopModals();
  }
});

test.each([0, 0.25, 0.5])('sheet breakpoint %s keeps dismissal on the acknowledged Native restoration path', async (breakpoint) => {
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
  vi.spyOn(HTMLImageElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 80, height: 44 }));
  const decode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  onTestFinished(() => {
    if (decode) Object.defineProperty(HTMLImageElement.prototype, 'decode', decode);
    else delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
  });
  let latest: NativeUISnapshot;
  const updates: NativeUISnapshot[] = [];
  const capture = vi.fn(async (args: { action: string; ids?: string[] }) =>
    args.action === 'prepare'
      ? {
          token: 'ready-image',
          parts: args.ids!.map((id) => ({ ids: [id], url: 'file:///snapshot.png', x: 0, y: 0, width: 80, height: 44 })),
        }
      : { shown: true },
  );
  const plugin = {
    addListener: async () => ({ remove: async () => {} }),
    update: async (snapshot: NativeUISnapshot) => {
      latest = snapshot;
      updates.push(snapshot);
      return { revision: snapshot.revision };
    },
    coveredSnapshot: capture,
    clear: async () => {},
  } as unknown as NativeUIPlugin;
  const runtime = await createRuntime(document, plugin, { ...options, source: 'auto', coveredSnapshots: true });
  handles.push(runtime);

  await vi.waitFor(() => expect(source.hasAttribute('data-native-ui-snapshot')).toBe(true));
  const modal = document.createElement('ion-modal');
  Object.assign(modal, { initialBreakpoint: 0.5, backdropBreakpoint: 0.25, presented: true });
  document.body.append(modal);
  modal.dispatchEvent(new CustomEvent('ionModalWillPresent', { bubbles: true }));
  await vi.waitFor(() => expect(source.hasAttribute('data-native-ui-snapshot-visible')).toBe(true));
  await vi.waitFor(() => expect(updates.some((snapshot) => snapshot.coveredSnapshotToken === 'ready-image')).toBe(true));
  capture.mockClear();
  modal.dispatchEvent(new CustomEvent('ionBreakpointDidChange', { bubbles: true, detail: { breakpoint } }));
  if (breakpoint === 0.25) {
    // A still-open, interactive sheet must release its frozen background.
    expect(source.hasAttribute('data-native-ui-snapshot-visible')).toBe(false);
    expect(capture.mock.calls.some(([args]) => args.action === 'release')).toBe(true);
  } else {
    expect(source.hasAttribute('data-native-ui-snapshot-visible')).toBe(true);
    expect(capture.mock.calls.some(([args]) => args.action === 'release')).toBe(false);
    Object.assign(modal, { presented: false });
    modal.dispatchEvent(new CustomEvent('ionModalDidDismiss', { bubbles: true, detail: { role: 'gesture' } }));
    // Native has not acknowledged the restoration yet.
    expect(source.hasAttribute('data-native-ui-snapshot-visible')).toBe(true);
    modal.remove();
    await vi.waitFor(() => expect(capture.mock.calls.some(([args]) => args.action === 'restored')).toBe(true));
    expect(source.hasAttribute('data-native-ui-snapshot-visible')).toBe(false);
    expect(source.hasAttribute('data-native-ui-projected')).toBe(true);
    expect(latest!.controls).toHaveLength(1);
  }
});

test.each([2, 3])('%s modal surfaces keep independent images through nesting, dragging and dismissal', async (depth) => {
  const { observeVerticalBarsModals, movingModal } = await import('../../packages/capacitor-native-ui/src/native/shared/modal');
  const { source, options } = mount(
    '<ion-app class="ios-theme-vertical-bars"><ion-modal><button data-native-ui="button" data-native-ui-placement="rail">Save</button></ion-modal></ion-app>',
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
  vi.spyOn(HTMLImageElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ x: 10, y: 10, width: 80, height: 44 }));
  const decode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  onTestFinished(() => {
    if (decode) Object.defineProperty(HTMLImageElement.prototype, 'decode', decode);
    else delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
  });
  const configure = (modal: HTMLIonModalElement, index: number) => {
    Object.assign(modal, { overlayIndex: index, presented: true, breakpoints: [0, 0.5, 0.8] });
    Object.assign(modal.style, { visibility: 'visible', opacity: '1', transform: 'none', overflow: 'visible' });
    modal.getBoundingClientRect = () => DOMRect.fromRect({ width: innerWidth, height: innerHeight });
    const wrapper = document.createElement('div');
    wrapper.setAttribute('part', 'content');
    modal.attachShadow({ mode: 'open' }).append(wrapper);
    let y = 100;
    wrapper.getBoundingClientRect = () => DOMRect.fromRect({ y, width: innerWidth, height: innerHeight - y });
    wrapper.getAnimations = () => [];
    modal.getAnimations = () => [];
    Object.defineProperty(wrapper, 'offsetWidth', { value: innerWidth });
    Object.defineProperty(wrapper, 'offsetLeft', { value: 0 });
    return {
      modal,
      move: () => {
        y += 60;
      },
    };
  };
  const first = configure(source.closest('ion-modal')!, 1);
  const surfaces = [{ ...first, source }];
  const stopModals = observeVerticalBarsModals(document);
  const listeners = new Set<symbol>();
  let captures = 0;
  const capture = vi.fn(async (args: { action: string; ids?: string[] }) =>
    args.action === 'prepare'
      ? {
          token: `surface-image-${++captures}`,
          parts: args.ids!.map((id) => ({ ids: [id], url: 'file:///image.png', x: 10, y: 10, width: 80, height: 44 })),
        }
      : { shown: true },
  );
  const plugin = {
    coveredSnapshot: capture,
    addListener: async (name: string) => {
      const id = Symbol();
      if (name === 'snapshotInteraction') listeners.add(id);
      return {
        remove: async () => {
          listeners.delete(id);
        },
      };
    },
    update: async (snapshot: NativeUISnapshot) => {
      return { revision: snapshot.revision };
    },
    clear: async () => {},
  } as unknown as NativeUIPlugin;
  const runtime = await createRuntime(document, plugin, { ...options, source: 'auto', coveredSnapshots: true });
  handles.push(runtime);
  try {
    first.modal.dispatchEvent(new Event('ionModalDidPresent', { bubbles: true }));
    await vi.waitFor(() => expect(source.hasAttribute('data-native-ui-snapshot')).toBe(true));
    for (let index = 2; index <= depth; index++) {
      const child = document.createElement('ion-modal');
      const button = document.createElement('button');
      button.setAttribute('data-native-ui', 'button');
      button.setAttribute('data-native-ui-placement', 'rail');
      button.textContent = `Save ${index}`;
      button.style.cssText = source.style.cssText;
      button.getBoundingClientRect = source.getBoundingClientRect;
      child.append(button);
      document.querySelector('ion-app')!.append(child);
      const next = { ...configure(child, index), source: button };
      child.dispatchEvent(new Event('ionModalWillPresent', { bubbles: true }));
      await vi.waitFor(() => {
        for (const previous of surfaces) expect(previous.source.hasAttribute('data-native-ui-snapshot-visible')).toBe(true);
      });
      child.dispatchEvent(new Event('ionModalDidPresent', { bubbles: true }));
      surfaces.push(next);
      await vi.waitFor(() => expect(button.hasAttribute('data-native-ui-snapshot')).toBe(true));
    }
    // Moving the top surface does not replace the covered surfaces' images.
    const top = surfaces[surfaces.length - 1];
    top.modal.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    top.move();
    await vi.waitFor(() => expect(movingModal(document)).toBe(top.modal));
    await vi.waitFor(() => expect(top.source.hasAttribute('data-native-ui-snapshot-visible')).toBe(true));
    for (const covered of surfaces.slice(0, -1)) expect(covered.source.hasAttribute('data-native-ui-snapshot-visible')).toBe(true);
    top.modal.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await vi.waitFor(() => expect(top.source.hasAttribute('data-native-ui-snapshot-visible')).toBe(false));
    while (surfaces.length > 1) {
      const departing = surfaces.pop()!;
      departing.modal.dispatchEvent(new Event('ionModalWillDismiss', { bubbles: true }));
      Object.assign(departing.modal, { presented: false });
      departing.modal.dispatchEvent(new Event('ionModalDidDismiss', { bubbles: true }));
      departing.modal.remove();
      const exposed = surfaces[surfaces.length - 1].source;
      await vi.waitFor(() => expect(exposed.hasAttribute('data-native-ui-snapshot-visible')).toBe(false));
      expect(exposed.hasAttribute('data-native-ui-projected')).toBe(true);
      for (const covered of surfaces.slice(0, -1)) expect(covered.source.hasAttribute('data-native-ui-snapshot-visible')).toBe(true);
      expect(listeners.size).toBe(surfaces.length + 1);
    }
    // Removal without a dismissal event must not leak a surface or listener.
    first.modal.remove();
    runtime.markForCheck();
    await vi.waitFor(() => expect(listeners.size).toBe(1));
    expect(source.hasAttribute('data-native-ui-snapshot-visible')).toBe(false);
    await runtime.destroy();
    expect(listeners.size).toBe(0);
  } finally {
    stopModals();
  }
});

test.each([false, true])('covered HTML suspension falls back without a prepared image (capability: %s)', async (capability) => {
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
  const capture = vi.fn(async () => ({}));
  const plugin = {
    addListener: async () => ({ remove: async () => {} }),
    update: async (snapshot: NativeUISnapshot) => ({ revision: snapshot.revision }),
    clear: async () => {},
    coveredSnapshot: capture,
  } as unknown as NativeUIPlugin;
  const runtime = await createRuntime(document, plugin, { ...options, coveredSnapshots: capability });
  handles.push(runtime);
  await vi.waitFor(() => expect(source.hasAttribute('data-native-ui-projected')).toBe(true));
  const first = await runtime.suspend({ covered: true });
  const second = await runtime.suspend({ covered: true });
  expect(source.hasAttribute('data-native-ui-projected')).toBe(false);
  expect(source.hasAttribute('data-native-ui-snapshot-visible')).toBe(false);
  await first.resume();
  await first.resume();
  expect(source.hasAttribute('data-native-ui-projected')).toBe(false);
  await second.resume();
  expect(source.hasAttribute('data-native-ui-projected')).toBe(true);
  if (!capability) expect(capture).not.toHaveBeenCalled();
});
