import { afterEach, expect, test, vi } from 'vitest';
import { createRuntime } from '../../packages/capacitor-native-ui/src/native/runtime';
import { suspendNativeUI } from '../../packages/capacitor-native-ui/src/native-integration';
import type { NativeUIPlugin, NativeUISnapshot, NativeUIRuntimeHandle } from '../../packages/capacitor-native-ui/src/native/definitions';

let handle: NativeUIRuntimeHandle | undefined;
afterEach(async () => {
  await handle?.destroy();
  handle = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
const fixture = async (from = 'Edit', to = 'Done', nativeProgress = false) => {
  document.body.innerHTML = `<ion-app><main class="ion-page" id="from"><ion-header><ion-toolbar>
    ${from ? `<button slot="${from === 'Menu' || from === 'Back' ? 'start' : 'end'}" data-native-ui="${from === 'Back' ? 'back-button' : 'button'}">${from}</button>` : ''}
    </ion-toolbar></ion-header></main><main class="ion-page ion-page-hidden" id="to"><ion-header><ion-toolbar>
    ${to ? `<button slot="${to === 'Back' ? 'start' : 'end'}" data-native-ui="${to === 'Back' ? 'back-button' : 'button'}">${to}</button>` : ''}
    </ion-toolbar></ion-header></main></ion-app>`;
  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    Object.assign(element.style, { visibility: 'visible', opacity: '1', transform: 'none', fontSize: '16px', color: 'rgb(0,0,0)' });
    element.getBoundingClientRect = () => ({ x: 10, y: 10, left: 10, top: 10, right: 90, bottom: 54, width: 80, height: 44 }) as DOMRect;
  });
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
  const listeners = new Map<string, (event: any) => void>();
  let acknowledge: ((snapshot: NativeUISnapshot) => Promise<{ revision: number }>) | undefined;
  const progress = vi.fn(async (_: { id: number; progress: number }) => {});
  const plugin = {
    setToolbarTransitionProgress: progress,
    addListener: async (name: string, listener: (event: any) => void) => {
      listeners.set(name, listener);
      return { remove: async () => {} };
    },
    update: async (snapshot: NativeUISnapshot) => {
      snapshots.push(snapshot);
      return acknowledge
        ? acknowledge(snapshot)
        : { revision: snapshot.revision, toolbarTransition: nativeProgress ? snapshot.toolbarTransition?.id : undefined };
    },
    clear: async () => {},
  } as unknown as NativeUIPlugin;
  handle = await createRuntime(document, plugin, { source: 'html' });
  await vi.waitFor(() => expect(snapshots.length).toBeGreaterThan(0));
  const leaving = document.querySelector<HTMLElement>('#from')!;
  const entering = document.querySelector<HTMLElement>('#to')!;
  const emit = (page: HTMLElement, type: string) => page.dispatchEvent(new CustomEvent(type, { bubbles: true }));
  return {
    snapshots,
    progress,
    leaving,
    entering,
    listeners,
    setAck: (next: typeof acknowledge) => {
      acknowledge = next;
    },
    async start() {
      entering.classList.replace('ion-page-hidden', 'ion-page-invisible');
      emit(entering, 'ionViewWillEnter');
      emit(leaving, 'ionViewWillLeave');
      const release = await suspendNativeUI([entering, leaving], { navigation: true });
      entering.classList.remove('ion-page-invisible');
      return Object.assign(
        (canceled = false) => {
          (canceled ? entering : leaving).classList.add('ion-page-hidden');
          release(canceled);
          if (!canceled) {
            emit(leaving, 'ionViewDidLeave');
            emit(entering, 'ionViewDidEnter');
          }
        },
        { progress: release.progress },
      );
    },
  };
};

test('navigation retains the acknowledged native toolbar without exposing either Web source, then commits atomically', async () => {
  const f = await fixture();
  const old = f.leaving.querySelector('button')!;
  const next = f.entering.querySelector('button')!;
  const oldClick = vi.fn();
  const nextClick = vi.fn();
  old.addEventListener('click', oldClick);
  next.addEventListener('click', nextClick);
  const release = await f.start();
  expect(release.progress).toBeUndefined(); // Older native acknowledgements do not expose the new bridge method.
  expect(old.hasAttribute('data-native-ui-projected')).toBe(true);
  expect(next.hasAttribute('data-native-ui-navigation-source')).toBe(true);
  expect(f.snapshots.every((snapshot) => snapshot.controls.some((control) => control.items[0]?.label === 'Edit'))).toBe(true);
  const before = f.snapshots.at(-1)!;
  f.listeners.get('activate')!({ id: before.controls[0].items[0].id, revision: before.revision, sequence: 1 });
  expect(oldClick).not.toHaveBeenCalled();
  let ack!: () => void;
  f.setAck(
    (snapshot) =>
      new Promise((resolve) => {
        ack = () => resolve({ revision: snapshot.revision });
      }),
  );
  release();
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls[0]?.items[0]?.label).toBe('Done'));
  expect(old.hasAttribute('data-native-ui-projected')).toBe(true);
  expect(next.hasAttribute('data-native-ui-navigation-source')).toBe(true);
  f.setAck(undefined);
  ack();
  await vi.waitFor(() => expect(next.hasAttribute('data-native-ui-projected')).toBe(true));
  expect(next.hasAttribute('data-native-ui-navigation-source')).toBe(false);
  expect(f.snapshots.at(-1)?.transitionDuration).toBe(0);
  const after = f.snapshots.at(-1)!;
  f.listeners.get('activate')!({ id: after.controls[0].items[0].id, revision: after.revision, sequence: 2 });
  expect(nextClick).toHaveBeenCalledOnce();
  expect(oldClick).not.toHaveBeenCalled();
});

test('interactive cancellation restores the old action and never projects the abandoned destination', async () => {
  const f = await fixture();
  const click = vi.fn();
  f.leaving.querySelector('button')!.addEventListener('click', click);
  const release = await f.start();
  release(true);
  await vi.waitFor(() => expect(f.entering.querySelector('[data-native-ui-navigation-source]')).toBeNull());
  expect(f.snapshots.every((snapshot) => snapshot.controls[0]?.items[0]?.label === 'Edit')).toBe(true);
  const final = f.snapshots.at(-1)!;
  f.listeners.get('activate')!({ id: final.controls[0].items[0].id, revision: final.revision, sequence: 1 });
  expect(click).toHaveBeenCalledOnce();
});

test.each(['Back', 'Save'])('Vertical Bars %s remains actionable while horizontal navigation is suspended', async (label) => {
  const f = await fixture('Edit', label);
  const source = f.entering.querySelector('button')!;
  source.setAttribute('data-native-ui-placement', 'rail');
  const click = vi.fn();
  source.addEventListener('click', click);
  const release = await f.start();
  await vi.waitFor(() => expect(source.hasAttribute('data-native-ui-projected')).toBe(true));
  const snapshot = f.snapshots.at(-1)!;
  const item = snapshot.controls.find((control) => control.placement === 'vertical-bars')!.items[0];
  f.listeners.get('activate')!({ id: item.id, revision: snapshot.revision, sequence: 1 });
  expect(click).toHaveBeenCalledOnce();
  release();
});

test.each([
  ['', 'Back'],
  ['Back', ''],
])('unpaired controls stay Web until commit: %s → %s', async (from, to) => {
  const f = await fixture(from, to);
  const release = await f.start();
  expect(f.snapshots.at(-1)?.controls).toEqual([]);
  release();
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls[0]?.items[0]?.label ?? '').toBe(to));
  await vi.waitFor(() => expect(document.querySelector('[data-native-ui-navigation-source]')).toBeNull());
});

test('explicit suspension still hands control back to Web during a navigation', async () => {
  const f = await fixture();
  const release = await f.start();
  const suspension = await handle!.suspend();
  expect(document.querySelector('[data-native-ui-navigation-source]')).toBeNull();
  expect(document.querySelector('[data-native-ui-projected]')).toBeNull();
  expect(f.snapshots.at(-1)?.controls).toEqual([]);
  release(true);
  await suspension.resume();
});

test('moving content controls still return to Web while the fixed toolbar stays native', async () => {
  const f = await fixture();
  const body = f.leaving.querySelector('button')!.cloneNode(true) as HTMLElement;
  body.removeAttribute('data-native-ui-projected');
  body.removeAttribute('aria-hidden');
  body.textContent = 'Body action';
  body.getBoundingClientRect = f.leaving.getBoundingClientRect;
  f.leaving.append(body);
  await vi.waitFor(() => expect(body.hasAttribute('data-native-ui-projected')).toBe(true));
  const release = await f.start();
  expect(body.hasAttribute('data-native-ui-projected')).toBe(false);
  expect(f.snapshots.at(-1)?.controls.flatMap((control) => control.items.map((item) => item.label))).toEqual(['Edit']);
  release(true);
});

test('native rejection releases the frozen toolbar instead of retrying it forever', async () => {
  const f = await fixture();
  // A state change forces an update while the acknowledged toolbar is retained.
  const body = f.leaving.querySelector('button')!.cloneNode(true) as HTMLElement;
  body.removeAttribute('data-native-ui-projected');
  body.removeAttribute('aria-hidden');
  body.textContent = 'Body action';
  body.getBoundingClientRect = f.leaving.getBoundingClientRect;
  f.leaving.append(body);
  await vi.waitFor(() => expect(body.hasAttribute('data-native-ui-projected')).toBe(true));
  f.setAck(async (snapshot) => ({ revision: snapshot.revision, rejectedControls: snapshot.controls.map((control) => control.id) }));
  const release = await f.start();
  // First native rejection may arrive before preparation; both paths must restore Web ownership.
  await vi.waitFor(() => expect(document.querySelector('[data-native-ui-projected]')).toBeNull());
  expect(document.querySelector('[data-native-ui-navigation-source]')).toBeNull();
  release(true);
});

test('legacy scoped suspension still restores Web controls without a navigation opt-in', async () => {
  const f = await fixture();
  const release = await suspendNativeUI([f.entering, f.leaving]);
  expect(document.querySelector('[data-native-ui-projected]')).toBeNull();
  expect(f.snapshots.at(-1)?.controls).toEqual([]);
  release(true);
});

test('a cached page unhidden before WillEnter is not projected over the active toolbar', async () => {
  const f = await fixture();
  const release = await f.start();
  release();
  await vi.waitFor(() => expect(f.entering.querySelector('button')!.hasAttribute('data-native-ui-projected')).toBe(true));
  const before = f.snapshots.length;
  f.leaving.classList.remove('ion-page-hidden');
  handle!.markForCheck();
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(f.leaving.querySelector('button')!.hasAttribute('data-native-ui-projected')).toBe(false);
  expect(f.snapshots.slice(before).every((snapshot) => snapshot.controls.every((control) => control.items[0]?.label === 'Done'))).toBe(
    true,
  );
});

test('a DOM mutation during acknowledgement does not discard the still-visible toolbar before navigation', async () => {
  const f = await fixture();
  const source = f.leaving.querySelector('button')!;
  let ack!: () => void;
  f.setAck(
    (snapshot) =>
      new Promise((resolve) => {
        ack = () => resolve({ revision: snapshot.revision });
      }),
  );
  source.textContent = 'Editing';
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls[0]?.items[0]?.label).toBe('Editing'));
  source.textContent = 'Edited';
  f.setAck(undefined);
  ack();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const release = await f.start();
  expect(source.hasAttribute('data-native-ui-projected')).toBe(true);
  expect(f.snapshots.at(-1)?.controls.length).toBe(1);
  expect(['Editing', 'Edited']).toContain(f.snapshots.at(-1)?.controls[0]?.items[0]?.label);
  release(true);
});

test.each(['Modal', 'Popover', 'Alert', 'ActionSheet'])(
  '%s interrupts a retained toolbar and restores the destination after dismissal',
  async (name) => {
    const f = await fixture();
    const release = await f.start();
    const overlay = document.createElement(`ion-${name.toLowerCase()}`);
    document.body.append(overlay);
    overlay.dispatchEvent(new CustomEvent(`ion${name}WillPresent`, { bubbles: true }));
    await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls).toEqual([]));
    expect(document.querySelector('[data-native-ui-navigation-source]')).toBeNull();
    expect(document.querySelector('[data-native-ui-projected]')).toBeNull();
    release();
    overlay.dispatchEvent(new CustomEvent(`ion${name}DidDismiss`, { bubbles: true }));
    overlay.remove();
    await vi.waitFor(() => expect(f.entering.querySelector('button')!.hasAttribute('data-native-ui-projected')).toBe(true));
    const click = vi.fn();
    f.entering.querySelector('button')!.addEventListener('click', click);
    const snapshot = f.snapshots.at(-1)!;
    f.listeners.get('activate')!({ id: snapshot.controls[0].items[0].id, revision: snapshot.revision, sequence: 1 });
    expect(click).toHaveBeenCalledOnce();
  },
);

test.each([
  ['Back', false],
  ['Save', false],
  ['Back', true],
  ['Save', true],
] as const)(
  'a new %s stays native through commit when supported, otherwise stays Web (native progress: %s)',
  async (label, nativeProgress) => {
    const f = await fixture('', label, nativeProgress);
    const source = f.entering.querySelector('button')!;
    const release = await f.start();
    expect(source.hasAttribute('data-native-ui-navigation-source')).toBe(nativeProgress);
    expect(source.hasAttribute('data-native-ui-projected')).toBe(false);
    let ack!: () => void;
    f.setAck(
      (snapshot) =>
        new Promise((resolve) => {
          ack = () => resolve({ revision: snapshot.revision });
        }),
    );
    release();
    await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls[0]?.items[0]?.label).toBe(label));
    expect(source.hasAttribute('data-native-ui-navigation-source')).toBe(nativeProgress);
    expect(source.hasAttribute('data-native-ui-projected')).toBe(false);
    f.setAck(undefined);
    ack();
    await vi.waitFor(() => expect(source.hasAttribute('data-native-ui-projected')).toBe(true));
  },
);

test('A leading action retains its native slot through a push to Back and only the destination action activates after commit', async () => {
  const f = await fixture('Menu', 'Back');
  const menu = f.leaving.querySelector('button')!;
  const back = f.entering.querySelector('button')!;
  const menuClick = vi.fn();
  const backClick = vi.fn();
  menu.addEventListener('click', menuClick);
  back.addEventListener('click', backClick);
  const before = f.snapshots.at(-1)!;
  const release = await f.start();
  expect(menu.hasAttribute('data-native-ui-projected')).toBe(true);
  expect(back.hasAttribute('data-native-ui-navigation-source')).toBe(true);
  expect(f.snapshots.at(-1)?.controls[0].items[0].label).toBe('Menu');
  release();
  await vi.waitFor(() => expect(back.hasAttribute('data-native-ui-projected')).toBe(true));
  const after = f.snapshots.at(-1)!;
  expect(after.controls[0].transitionId).toBe(before.controls[0].transitionId);
  f.listeners.get('activate')!({ id: before.controls[0].items[0].id, revision: after.revision, sequence: 1 });
  f.listeners.get('activate')!({ id: after.controls[0].items[0].id, revision: after.revision, sequence: 2 });
  expect(menuClick).not.toHaveBeenCalled();
  expect(backClick).toHaveBeenCalledOnce();
});

test('a temporarily transparent main header still associates its Back before playback', async () => {
  const f = await fixture('Menu', 'Back');
  const header = f.entering.querySelector('ion-header')!;
  header.classList.add('header-transitioning');
  header.style.opacity = '0';
  const style = header.getAttribute('style');
  const release = await f.start();
  expect(f.entering.querySelector('button')!.hasAttribute('data-native-ui-navigation-source')).toBe(true);
  expect(header.getAttribute('style')).toBe(style);
  header.style.opacity = '1';
  release();
  await vi.waitFor(() => expect(f.entering.querySelector('button')!.hasAttribute('data-native-ui-projected')).toBe(true));
});

test('native toolbar receives prepared endpoints and reversible page progress before completion', async () => {
  const f = await fixture('Menu', 'Back', true);
  const release = await f.start();
  const prepared = f.snapshots.at(-1)!.toolbarTransition!;
  expect(prepared.destination[0].items[0].label).toBe('Back');
  expect(prepared.sourceIds).toEqual([f.snapshots.at(-1)!.controls[0].id]);
  expect(release.progress).toBeTypeOf('function');
  for (const progress of [0, 0.2, 0.4, 0.6, 0.8, 1, 0.4, 0]) {
    release.progress!(progress);
    await vi.waitFor(() => expect(f.progress).toHaveBeenLastCalledWith({ id: prepared.id, progress }));
  }
  release(true);
  await vi.waitFor(() => expect(f.snapshots.at(-1)!.toolbarTransition).toBeUndefined());
  expect(f.snapshots.at(-1)!.controls[0].items[0].label).toBe('Menu');
});

test.each(['', 'Back'])('an unmatched outgoing action returns to Web before playback to %s, including cancellation', async (target) => {
  const f = await fixture('Edit', target, true);
  (window.matchMedia('(prefers-reduced-motion: reduce)') as { matches: boolean }).matches = false;
  const source = f.leaving.querySelector('button')!;
  expect(source.hasAttribute('data-native-ui-projected')).toBe(true);
  const release = await f.start();
  expect(source.hasAttribute('data-native-ui-projected')).toBe(false);
  expect(source.hasAttribute('data-native-ui-navigation-source')).toBe(false);
  expect(source.hasAttribute('data-native-ui-fading')).toBe(false);
  expect(f.snapshots.at(-1)!.transitionDuration).toBe(0);
  expect(f.snapshots.at(-1)!.controls).toEqual([]);
  if (target) {
    expect(f.snapshots.at(-1)!.toolbarTransition?.sourceIds).toEqual([]);
    expect(f.snapshots.at(-1)!.toolbarTransition?.destination[0].items[0].label).toBe(target);
    expect(release.progress).toBeTypeOf('function');
    expect(f.entering.querySelector('button')!.hasAttribute('data-native-ui-navigation-source')).toBe(true);
  } else {
    expect(f.snapshots.at(-1)!.toolbarTransition).toBeUndefined();
    expect(release.progress).toBeUndefined();
  }
  release(true);
  await vi.waitFor(() => expect(source.hasAttribute('data-native-ui-projected')).toBe(true));
  expect(f.snapshots.at(-1)!.controls[0].items[0].label).toBe('Edit');
});

test('different explicit action IDs retire the source and introduce a new native destination', async () => {
  const f = await fixture('Edit', 'Delete', true);
  const source = f.leaving.querySelector('button')!;
  const target = f.entering.querySelector('button')!;
  source.setAttribute('data-transition-id', 'edit');
  target.setAttribute('data-transition-id', 'delete');
  await vi.waitFor(() => expect(f.snapshots.at(-1)!.controls[0].items[0].transitionId).toContain('edit'));
  const release = await f.start();
  expect(source.hasAttribute('data-native-ui-projected')).toBe(false);
  expect(target.hasAttribute('data-native-ui-navigation-source')).toBe(true);
  expect(f.snapshots.at(-1)!.toolbarTransition?.sourceIds).toEqual([]);
  expect(f.snapshots.at(-1)!.toolbarTransition?.destination[0].items[0].label).toBe('Delete');
  expect(f.snapshots.at(-1)!.controls).toEqual([]);
  release();
  await vi.waitFor(() => expect(target.hasAttribute('data-native-ui-projected')).toBe(true));
});

test('destination icon decode failure restores Web and lets navigation finish', async () => {
  const f = await fixture('Edit', 'Done', true);
  const target = f.entering.querySelector('button')!;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.innerHTML = '<path d="M0 0h24v24H0z" />';
  svg.getBoundingClientRect = () => ({ x: 10, y: 10, left: 10, top: 10, right: 34, bottom: 34, width: 24, height: 24 }) as DOMRect;
  target.prepend(svg);
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      decode = vi.fn().mockRejectedValue(new Error('decode failed'));
    },
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const release = await f.start();
  expect(handle!.getStatus().state).toBe('stopped');
  expect(handle!.getStatus().reason).toBe('decode failed');
  expect(document.querySelector('[data-native-ui-navigation-source], [data-native-ui-projected]')).toBeNull();
  expect(release.progress).toBeUndefined();
  release();
  expect(f.leaving.classList.contains('ion-page-hidden')).toBe(true);
  expect(f.entering.classList.contains('ion-page-hidden')).toBe(false);
});

test('a rejected new destination stays visible in Web during native progress', async () => {
  const f = await fixture('', 'Back', true);
  f.setAck(async (snapshot) => ({
    revision: snapshot.revision,
    toolbarTransition: snapshot.toolbarTransition?.id,
    rejectedControls: snapshot.toolbarTransition?.destination.map((control) => control.id),
  }));
  const release = await f.start();
  expect(f.snapshots.at(-1)?.toolbarTransition?.destination).toHaveLength(1);
  expect(f.entering.querySelector('button')!.hasAttribute('data-native-ui-projected')).toBe(false);
  expect(f.entering.querySelector('button')!.hasAttribute('data-native-ui-navigation-source')).toBe(false);
  release.progress?.(0.5);
  expect(f.entering.querySelector('button')!.hasAttribute('data-native-ui-navigation-source')).toBe(false);
  release(true);
});

test('later rejection of an already prepared incoming surface returns it to Web', async () => {
  const f = await fixture('', 'Back', true);
  const target = f.entering.querySelector('button')!;
  const release = await f.start();
  expect(target.hasAttribute('data-native-ui-navigation-source')).toBe(true);
  const prepared = f.snapshots.at(-1)!.toolbarTransition!;
  f.setAck(async (snapshot) => ({
    revision: snapshot.revision,
    toolbarTransition: snapshot.toolbarTransition?.id,
    rejectedControls: prepared.destination.map((c) => c.id),
  }));
  const other = target.cloneNode(true) as HTMLElement;
  other.textContent = 'Outside';
  other.removeAttribute('data-native-ui-navigation-source');
  other.removeAttribute('aria-hidden');
  other.getBoundingClientRect = target.getBoundingClientRect;
  document.querySelector('ion-app')!.append(other);
  await vi.waitFor(() => expect(f.snapshots.at(-1)!.controls.some((c) => c.items[0]?.label === 'Outside')).toBe(true));
  await vi.waitFor(() => expect(target.hasAttribute('data-native-ui-navigation-source')).toBe(false));
  release(true);
});

test('toolbar handoff does not measure incoming content controls', async () => {
  const f = await fixture('Edit', 'Save', true);
  const content = document.createElement('ion-content');
  const button = document.createElement('button');
  button.setAttribute('data-native-ui', 'button');
  button.textContent = 'Content action';
  const measure = vi.fn(() => ({ x: 10, y: 100, left: 10, top: 100, right: 90, bottom: 144, width: 80, height: 44 }) as DOMRect);
  button.getBoundingClientRect = measure;
  content.append(button);
  f.entering.append(content);
  const release = await f.start();
  expect(measure).not.toHaveBeenCalled();
  expect(f.snapshots.at(-1)?.toolbarTransition?.destination.some((control) => control.items.some((item) => item.label === 'Save'))).toBe(
    true,
  );
  release();
});
