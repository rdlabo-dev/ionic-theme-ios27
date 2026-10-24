import { afterEach, expect, onTestFinished, test, vi } from 'vitest';
import { observeVerticalBarsModals } from '../../packages/capacitor-native-ui/src/native/shared/modal';
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
    async start(interactive = false) {
      entering.classList.replace('ion-page-hidden', 'ion-page-invisible');
      emit(entering, 'ionViewWillEnter');
      emit(leaving, 'ionViewWillLeave');
      const release = await suspendNativeUI([entering, leaving], { navigation: true, ...(interactive ? { interactive: true } : {}) });
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
        { progress: release.progress, finishGesture: release.finishGesture },
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
])('older native binaries retain existing projection until commit: %s → %s', async (from, to) => {
  const f = await fixture(from, to);
  const release = await f.start();
  expect(release.progress).toBeUndefined();
  expect(f.snapshots.at(-1)?.controls.map((control) => control.items[0].label)).toEqual(from ? [from] : []);
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

test.each(['', 'Back'])('an unmatched outgoing action stays native through playback to %s and cancellation', async (target) => {
  const f = await fixture('Edit', target, true);
  const source = f.leaving.querySelector('button')!;
  const release = await f.start();
  expect(source.hasAttribute('data-native-ui-projected')).toBe(true);
  expect(f.snapshots.at(-1)!.controls[0].items[0].label).toBe('Edit');
  expect(f.snapshots.at(-1)!.toolbarTransition?.sourceIds).toEqual([f.snapshots.at(-1)!.controls[0].id]);
  expect(f.snapshots.at(-1)!.toolbarTransition?.destination).toHaveLength(target ? 1 : 0);
  expect(release.progress).toBeTypeOf('function');
  release.progress!(0.5);
  await vi.waitFor(() => expect(f.progress).toHaveBeenLastCalledWith({ id: f.snapshots.at(-1)!.toolbarTransition!.id, progress: 0.5 }));
  release(true);
  await vi.waitFor(() => expect(f.snapshots.at(-1)!.toolbarTransition).toBeUndefined());
  expect(source.hasAttribute('data-native-ui-projected')).toBe(true);
  expect(f.snapshots.at(-1)!.controls[0].items[0].label).toBe('Edit');
});

test('different explicit action IDs retain the outgoing native surface until commit', async () => {
  const f = await fixture('Edit', 'Delete', true);
  const source = f.leaving.querySelector('button')!;
  const target = f.entering.querySelector('button')!;
  source.setAttribute('data-transition-id', 'edit');
  target.setAttribute('data-transition-id', 'delete');
  await vi.waitFor(() => expect(f.snapshots.at(-1)!.controls[0].items[0].transitionId).toContain('edit'));
  const release = await f.start();
  expect(source.hasAttribute('data-native-ui-projected')).toBe(true);
  expect(target.hasAttribute('data-native-ui-navigation-source')).toBe(true);
  expect(f.snapshots.at(-1)!.toolbarTransition?.sourceIds).toEqual([f.snapshots.at(-1)!.controls[0].id]);
  expect(f.snapshots.at(-1)!.toolbarTransition?.destination[0].items[0].label).toBe('Delete');
  release.progress!(1);
  release();
  await vi.waitFor(() => expect(target.hasAttribute('data-native-ui-projected')).toBe(true));
  expect(source.hasAttribute('data-native-ui-projected')).toBe(false);
  expect(f.snapshots.at(-1)!.controls[0].items[0].label).toBe('Delete');
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

test('a presented vertical modal keeps its own push path and restores it on cancellation', async () => {
  const f = await fixture('Menu', 'Back');
  const app = document.querySelector('ion-app')!;
  app.classList.add('ios-theme-vertical-bars');
  const modal = document.createElement('ion-modal');
  Object.assign(modal.style, { visibility: 'visible', opacity: '1', transform: 'none' });
  const content = document.createElement('div');
  content.setAttribute('part', 'content');
  Object.defineProperties(content, {
    offsetWidth: { value: window.innerWidth },
    offsetLeft: { value: 0 },
  });
  content.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight,
    }) as DOMRect;
  content.getAnimations = () => [];
  modal.attachShadow({ mode: 'open' }).append(content);
  app.append(modal);
  modal.append(f.leaving, f.entering);
  for (const button of modal.querySelectorAll('button')) button.setAttribute('data-native-ui-placement', 'rail');
  const stopModals = observeVerticalBarsModals(document);
  onTestFinished(stopModals);
  modal.dispatchEvent(new CustomEvent('ionModalDidPresent', { bubbles: true }));
  await vi.waitFor(() => {
    expect(modal.classList.contains('ios-theme-vertical-bars-modal')).toBe(true);
    expect(f.snapshots.at(-1)?.verticalBarNavigation).toHaveLength(1);
  });
  const root = f.snapshots.at(-1)!.verticalBarNavigation![0];
  const cancelPush = await f.start();
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.verticalBarNavigation).toHaveLength(2));
  expect(f.snapshots.at(-1)!.verticalBarNavigation![0]).toBe(root);
  cancelPush(true);
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.verticalBarNavigation).toEqual([root]));
  const push = await f.start();
  push();
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.verticalBarNavigation).toHaveLength(2));
  const path = f.snapshots.at(-1)!.verticalBarNavigation!;
  f.leaving.classList.remove('ion-page-hidden');
  f.leaving.dispatchEvent(new CustomEvent('ionViewWillEnter', { bubbles: true }));
  f.entering.dispatchEvent(new CustomEvent('ionViewWillLeave', { bubbles: true }));
  const pop = await suspendNativeUI([f.leaving, f.entering], { navigation: true, direction: 'back' });
  f.entering.classList.add('ion-page-hidden');
  window.dispatchEvent(new Event('nativeUIRefresh'));
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.verticalBarNavigation).toEqual([root]));
  f.entering.classList.remove('ion-page-hidden');
  f.leaving.classList.add('ion-page-hidden');
  pop(true);
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.verticalBarNavigation).toEqual(path));
});

test.each([true, false])('vertical swipe keeps both Web sources hidden until it settles (cancel=%s)', async (canceled) => {
  const f = await fixture('Back', 'Menu');
  document.querySelector('ion-app')!.classList.add('ios-theme-vertical-bars');
  for (const source of document.querySelectorAll('button')) source.setAttribute('data-native-ui-placement', 'rail');
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls[0]?.placement).toBe('vertical-bars'));
  const old = f.leaving.querySelector('button')!,
    next = f.entering.querySelector('button')!;
  const click = vi.fn();
  old.addEventListener('click', click);
  next.addEventListener('click', click);
  const release = await f.start(true);
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.verticalBarNavigationPhase).toBe('tracking'));
  expect(old.hasAttribute('data-native-ui-projected')).toBe(true);
  expect(next.hasAttribute('data-native-ui-projected')).toBe(true);
  const during = f.snapshots.at(-1)!;
  f.listeners.get('activate')!({ id: during.controls[0].items[0].id, revision: during.revision, sequence: 1 });
  expect(click).not.toHaveBeenCalled();
  release.finishGesture?.(!canceled);
  if (!canceled) {
    await vi.waitFor(() => expect(f.snapshots.at(-1)?.verticalBarNavigationPhase).toBe('settling'));
    expect(old.hasAttribute('data-native-ui-projected')).toBe(true);
    expect(next.hasAttribute('data-native-ui-projected')).toBe(true);
  } else expect(f.snapshots.at(-1)?.verticalBarNavigationPhase).toBe('tracking');
  release(canceled);
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.verticalBarNavigationPhase).toBeUndefined());
  expect(f.snapshots.at(-1)?.controls[0]?.items[0]?.label).toBe(canceled ? 'Back' : 'Menu');
  expect((canceled ? old : next).hasAttribute('data-native-ui-projected')).toBe(true);
});

test.each(['replacement', 'hidden', 'viewport'] as const)('vertical swipe releases pending ownership on %s', async (boundary) => {
  const f = await fixture('Back', 'Menu');
  document.querySelector('ion-app')!.classList.add('ios-theme-vertical-bars');
  for (const source of document.querySelectorAll('button')) source.setAttribute('data-native-ui-placement', 'rail');
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls[0]?.placement).toBe('vertical-bars'));
  const oldRelease = await f.start(true);
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.verticalBarNavigationPhase).toBe('tracking'));
  if (boundary === 'replacement') {
    const release = await suspendNativeUI([f.entering, f.leaving], { navigation: true });
    await vi.waitFor(() => expect(f.snapshots.at(-1)?.verticalBarNavigationPhase).toBeUndefined());
    oldRelease(true);
    release();
    await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls[0]?.items[0]?.label).toBe('Menu'));
  } else {
    if (boundary === 'hidden') vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    else vi.stubGlobal('visualViewport', { scale: 2, offsetTop: 0 });
    window.dispatchEvent(new Event('nativeUIRefresh'));
    await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls).toEqual([]));
    expect(f.snapshots.at(-1)?.verticalBarNavigationPhase).toBeUndefined();
    oldRelease(true);
  }
});

test('navigation waits for all destination icons and their own native acknowledgement before playback', async () => {
  const f = await fixture('Edit', 'Done', true);
  const target = f.entering.querySelector('button')!;
  const pending: (() => void)[] = [];
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      decode() {
        return new Promise<void>((resolve) => pending.push(resolve));
      }
    },
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:icon');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {} } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,rendered');
  for (let index = 0; index < 3; index++) {
    const button = index ? (target.cloneNode(true) as HTMLElement) : target;
    button.textContent = `Action ${index}`;
    button.getBoundingClientRect = target.getBoundingClientRect;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.innerHTML = `<path d="M${index} 0h24v24H0z" />`;
    svg.getBoundingClientRect = () => ({ x: 10, y: 10, left: 10, top: 10, right: 34, bottom: 34, width: 24, height: 24 }) as DOMRect;
    button.prepend(svg);
    if (index) target.parentElement!.append(button);
  }
  let acknowledgeIntermediate: (() => void) | undefined;
  let acknowledgePrepared: (() => void) | undefined;
  f.setAck(async (snapshot) => {
    await new Promise<void>((resolve) => {
      if (snapshot.toolbarTransition) acknowledgePrepared = resolve;
      else acknowledgeIntermediate = resolve;
    });
    return { revision: snapshot.revision, toolbarTransition: snapshot.toolbarTransition?.id };
  });
  let ready = false;
  const preparation = f.start().then((release) => {
    ready = true;
    return release;
  });
  await vi.waitFor(() => expect(pending).toHaveLength(3));
  expect(ready).toBe(false);
  pending[0]();
  pending[1]();
  await Promise.resolve();
  expect(ready).toBe(false);
  window.dispatchEvent(new Event('nativeUIRefresh'));
  await vi.waitFor(() => expect(acknowledgeIntermediate).toBeTypeOf('function'));
  pending[2]();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  acknowledgeIntermediate!();
  await vi.waitFor(() => expect(acknowledgePrepared).toBeTypeOf('function'));
  const startedBeforeAcknowledgement = ready;
  f.setAck(undefined);
  acknowledgePrepared!();
  const release = await preparation;
  expect(startedBeforeAcknowledgement).toBe(false);
  expect(f.snapshots.at(-1)?.toolbarTransition?.destination).toHaveLength(3);
  release();
});

test('an acknowledged navigation handoff does not wait for unrelated refreshes to become idle', async () => {
  const f = await fixture('Edit', 'Done', true);
  let refresh = true;
  f.setAck(async (snapshot) => {
    if (refresh) window.dispatchEvent(new Event('nativeUIRefresh'));
    return { revision: snapshot.revision, toolbarTransition: snapshot.toolbarTransition?.id };
  });
  try {
    const release = await f.start();
    expect(f.snapshots.at(-1)?.toolbarTransition?.destination[0].items[0].label).toBe('Done');
    expect(f.entering.querySelector('button')!.hasAttribute('data-native-ui-navigation-source')).toBe(true);
    refresh = false;
    release(true);
    await vi.waitFor(() => expect(f.leaving.querySelector('button')!.hasAttribute('data-native-ui-projected')).toBe(true));
  } finally {
    refresh = false;
  }
});

test.each([false, true])(
  'one failed native update resynchronizes current DOM without restarting or replaying input (vertical=%s)',
  async (vertical) => {
    const f = await fixture();
    const source = f.leaving.querySelector('button')!;
    if (vertical) {
      document.querySelector('ion-app')!.classList.add('ios-theme-vertical-bars');
      source.setAttribute('data-native-ui-placement', 'rail');
      await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls[0]?.placement).toBe('vertical-bars'));
    }
    const clicked = vi.fn();
    source.addEventListener('click', clicked);
    const listener = f.listeners.get('activate');
    let failedRevision = 0;
    let retryFrame: FrameRequestCallback | undefined;
    let frameSpy: ReturnType<typeof vi.spyOn> | undefined;
    f.setAck(async (snapshot) => {
      if (!failedRevision) {
        failedRevision = snapshot.revision;
        source.textContent = 'Latest';
        frameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
          retryFrame = callback;
          return 1;
        });
        throw new Error('Temporary connection failure');
      }
      return { revision: snapshot.revision };
    });
    source.textContent = 'Changed';
    try {
      await vi.waitFor(() => expect(retryFrame).toBeDefined());
      listener!({ id: f.snapshots.at(-1)!.controls[0].items[0].id, revision: failedRevision, sequence: 1 });
      expect(clicked).not.toHaveBeenCalled();
    } finally {
      frameSpy?.mockRestore();
      retryFrame?.(performance.now());
    }
    await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls[0]?.items[0]?.label).toBe('Latest'));
    await vi.waitFor(() => expect(source.hasAttribute('data-native-ui-projected')).toBe(true));
    expect(handle!.getStatus().state).toBe('native');
    expect(handle!.getStatus().reason).toBeUndefined();
    expect(f.listeners.get('activate')).toBe(listener);
    expect(clicked).not.toHaveBeenCalled();
    const current = f.snapshots.at(-1)!;
    expect(current.revision).toBeGreaterThan(failedRevision);
    const updates = f.snapshots.length;
    handle!.markForCheck();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    expect(f.snapshots).toHaveLength(updates);
    listener!({ id: current.controls[0].items[0].id, revision: failedRevision, sequence: 1 });
    expect(clicked).not.toHaveBeenCalled();
    listener!({ id: current.controls[0].items[0].id, revision: current.revision, sequence: 2 });
    listener!({ id: current.controls[0].items[0].id, revision: current.revision, sequence: 2 });
    expect(clicked).toHaveBeenCalledOnce();
  },
);

test.each(['rejection', 'revision mismatch'])('native update %s respects the retry boundary', async (failure) => {
  const f = await fixture();
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  let attempts = 0;
  f.setAck(async (snapshot) => {
    attempts++;
    if (failure === 'revision mismatch') return { revision: snapshot.revision + 1 };
    throw new Error('Persistent connection failure');
  });
  f.leaving.querySelector('button')!.textContent = 'Changed';
  await vi.waitFor(() => expect(handle!.getStatus().state).toBe('stopped'));
  expect(attempts).toBe(failure === 'revision mismatch' ? 1 : 2);
  expect(handle!.getStatus().reason).toBe(
    failure === 'revision mismatch' ? 'Native UI revision mismatch' : 'Persistent connection failure',
  );
  expect(f.leaving.querySelector('[data-native-ui-projected]')).toBeNull();
  expect(warning).toHaveBeenCalledOnce();
});

test.each([false, true])('an update acknowledged during retention reconnects unchanged DOM (vertical=%s)', async (vertical) => {
  const f = await fixture();
  const source = f.leaving.querySelector('button')!;
  if (vertical) {
    document.querySelector('ion-app')!.classList.add('ios-theme-vertical-bars');
    source.setAttribute('data-native-ui-placement', 'rail');
    await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls[0]?.placement).toBe('vertical-bars'));
  }
  const initial = f.snapshots.at(-1)!;
  let acknowledge: (() => void) | undefined;
  f.setAck(
    (snapshot) =>
      new Promise((resolve) => {
        acknowledge = () => resolve({ revision: snapshot.revision });
      }),
  );
  source.textContent = 'Changed';
  await vi.waitFor(() => expect(acknowledge).toBeDefined());
  const release = (handle as NativeUIRuntimeHandle & { retain(): () => void }).retain();
  source.textContent = 'Edit';
  f.setAck(undefined);
  acknowledge!();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  release();
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls[0]?.items[0]?.label).toBe('Edit'));
  expect(f.snapshots.at(-1)!.revision).toBeGreaterThan(initial.revision);
  const clicked = vi.fn();
  source.addEventListener('click', clicked);
  const current = f.snapshots.at(-1)!;
  f.listeners.get('activate')!({ id: current.controls[0].items[0].id, revision: current.revision, sequence: 1 });
  expect(clicked).toHaveBeenCalledOnce();
});

test('a successful synchronization restores the single retry allowance', async () => {
  const f = await fixture();
  for (const label of ['First', 'Second']) {
    let attempts = 0;
    f.setAck(async (snapshot) => {
      if (++attempts === 1) throw new Error('Temporary failure');
      return { revision: snapshot.revision };
    });
    f.leaving.querySelector('button')!.textContent = label;
    await vi.waitFor(() => expect(attempts).toBe(2));
    expect(handle!.getStatus().state).toBe('native');
    expect(f.snapshots.at(-1)?.controls[0]?.items[0]?.label).toBe(label);
  }
});

test('a dismissing modal retires once and never reacquires while its frame moves', async () => {
  const f = await fixture('Menu', 'Back');
  const app = document.querySelector('ion-app')!;
  app.classList.add('ios-theme-vertical-bars');
  const modal = document.createElement('ion-modal');
  Object.assign(modal.style, { visibility: 'visible', opacity: '1', transform: 'none' });
  const content = document.createElement('div');
  content.setAttribute('part', 'content');
  Object.defineProperties(content, {
    offsetWidth: { value: window.innerWidth },
    offsetLeft: { value: 0 },
  });
  content.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight,
    }) as DOMRect;
  content.getAnimations = () => [];
  modal.attachShadow({ mode: 'open' }).append(content);
  app.append(modal);
  modal.append(f.leaving, f.entering);
  for (const button of modal.querySelectorAll('button')) button.setAttribute('data-native-ui-placement', 'rail');
  const stopModals = observeVerticalBarsModals(document);
  onTestFinished(stopModals);
  modal.dispatchEvent(new CustomEvent('ionModalDidPresent', { bubbles: true }));
  await vi.waitFor(() => {
    expect(modal.classList.contains('ios-theme-vertical-bars-modal')).toBe(true);
    expect(f.snapshots.at(-1)?.verticalBarNavigation).toHaveLength(1);
  });
  modal.dispatchEvent(new CustomEvent('ionModalWillDismiss', { bubbles: true }));
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls).toHaveLength(0));
  expect(f.snapshots.at(-1)?.transitionDuration).toBe(0);
  const retired = f.snapshots.length;
  for (let i = 0; i < 5; i++) {
    content.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 100 + i * 50,
        top: 100 + i * 50,
        left: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
        width: window.innerWidth,
        height: 300,
      }) as DOMRect;
    window.dispatchEvent(new Event('nativeUIRefresh'));
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  expect(f.snapshots).toHaveLength(retired);
  expect(f.leaving.querySelector('button')!.hasAttribute('data-native-ui-projected')).toBe(false);
  modal.dispatchEvent(new CustomEvent('ionModalDidDismiss', { bubbles: true }));
  app.append(f.leaving, f.entering);
  modal.remove();
  await vi.waitFor(() => expect(f.snapshots.at(-1)?.controls.length).toBeGreaterThan(0));
  expect(f.snapshots.at(-1)?.transitionDuration).toBe(0);
});
