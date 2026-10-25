import {
  snapshotOwns,
  snapshotTargets,
  preparedOwners,
  snapshotMutation,
} from '../../packages/capacitor-native-ui/src/native/shared/covered-source';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createCoveredSnapshots } from '../../packages/capacitor-native-ui/src/native/shared/covered-snapshot';
import type { NativeUIPlugin } from '../../packages/capacitor-native-ui/src/native/definitions';
import { createCandidate } from '../../packages/capacitor-native-ui/src/native/shared/candidate';
let managers: Awaited<ReturnType<typeof createCoveredSnapshots>>[];
beforeEach(() => {
  managers = [];
  vi.useFakeTimers();
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
});
afterEach(async () => {
  for (const manager of managers) await manager.destroy();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});
const drain = () => vi.advanceTimersByTimeAsync(100);
const fixture = async (modal?: HTMLIonModalElement) => {
  const button = document.createElement('ion-button');
  (modal ?? document.body).append(button);
  const candidate = createCandidate(button, 'button', () => 'button');
  if (modal) {
    candidate.control.placement = 'vertical-bars';
    const clone = document.createElement('ion-button');
    modal.append(clone);
    snapshotTargets.set(button, clone);
  }
  let interaction: (event: { active: boolean }) => void = () => {};
  let serial = 0;
  const capture = () => ({
    token: `image-${++serial}`,
    parts: [{ ids: ['button'], url: 'file:///snapshot.png', x: 1, y: 2, width: 50, height: 40 }],
  });
  const bridge = vi.fn(async (args: { action: string }) => (args.action === 'prepare' ? capture() : { shown: true }));
  const listen = vi.fn(async (_event, callback) => {
    interaction = callback;
    return { remove: vi.fn().mockResolvedValue(undefined) };
  });
  const callbacks = {
    flush: vi.fn().mockResolvedValue(undefined),
    wake: vi.fn(),
    blocked: () => false,
    ...(modal ? { modal: () => modal } : {}),
  };
  const manager = await createCoveredSnapshots(
    document,
    { coveredSnapshot: bridge } as unknown as NativeUIPlugin,
    listen as NativeUIPlugin['addListener'],
    callbacks,
  );
  managers.push(manager);
  return { manager, button, candidate, bridge, capture, callbacks, touch: (active: boolean) => interaction({ active }) };
};
test('missing image keeps Web projection without waiting or capturing', async () => {
  const f = await fixture();
  expect(f.manager.begin()).toBeUndefined();
  expect(f.bridge).not.toHaveBeenCalled();
});
test('pins the pre-touch image across disabled updates and restores ownership on dismissal', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.touch(true);
  f.button.setAttribute('disabled', '');
  f.manager.consider(2, [f.candidate]);
  await drain();
  f.touch(false);
  const started = f.manager.begin();
  await drain();
  await started;
  expect(f.bridge.mock.calls.filter(([args]) => args.action === 'prepare')).toHaveLength(1);
  expect(f.manager.token).toBe('image-1');
  expect(snapshotOwns(f.button)).toBe(true);
  expect(document.querySelectorAll('style[data-native-ui-snapshot]')).toHaveLength(1);
  expect(document.querySelectorAll('img')).toHaveLength(0);
  expect(f.manager.begin()).toBeUndefined();
  f.manager.end();
  await vi.advanceTimersByTimeAsync(40);
  f.manager.updated(undefined, ['button'], 3);
  await drain();
  expect(snapshotOwns(f.button)).toBe(false);
  expect(document.querySelectorAll('img')).toHaveLength(0);
  expect(f.bridge).toHaveBeenCalledWith({ action: 'restored', token: 'image-1' });
});
test('keeps the Native return copy through the Web image removal paint', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.manager.begin();
  await drain();
  f.manager.end();
  f.manager.updated(undefined, ['button'], 2);
  expect(f.button.hasAttribute('data-native-ui-snapshot-visible')).toBe(false);
  expect(f.bridge).not.toHaveBeenCalledWith({ action: 'restored', token: 'image-1' });
  await vi.advanceTimersToNextFrame();
  expect(f.bridge).not.toHaveBeenCalledWith({ action: 'restored', token: 'image-1' });
  await vi.advanceTimersToNextFrame();
  expect(f.bridge).toHaveBeenCalledWith({ action: 'restored', token: 'image-1' });
});
test('a queued return acknowledgement cannot retire a reopened cover', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.manager.begin();
  await drain();
  f.manager.end();
  f.manager.updated(undefined, ['button'], 2);
  f.manager.begin();
  const actions = f.bridge.mock.calls.map(([args]) => args.action);
  expect(actions.lastIndexOf('restored')).toBeLessThan(actions.lastIndexOf('cover'));
  await drain();
  expect(f.bridge.mock.calls.filter(([args]) => args.action === 'restored')).toHaveLength(1);
});
test('late capture cannot replace the missing pre-touch image', async () => {
  const f = await fixture();
  let finish!: (value: ReturnType<typeof f.capture>) => void;
  f.bridge.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.touch(true);
  f.touch(false);
  finish(f.capture());
  await vi.advanceTimersByTimeAsync(0);
  expect(f.manager.begin()).toBeUndefined();
  expect(f.bridge).toHaveBeenCalledWith({ action: 'release', token: 'image-1' });
});
test('geometry invalidation releases files and prevents stale image reuse', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.manager.invalidate();
  expect(f.manager.begin()).toBeUndefined();
  expect(f.bridge).toHaveBeenCalledWith({ action: 'release', token: 'image-1' });
});
test('entry adopts the decoded image without waiting for the native cover notification', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.bridge.mockClear();
  f.bridge.mockImplementation(() => new Promise(() => {}));
  expect(f.manager.begin()).toBeUndefined();
  expect(snapshotOwns(f.button)).toBe(true);
  expect(f.bridge).toHaveBeenCalledWith({ action: 'cover', token: 'image-1' });
  // Cleanup is not the subject of the stalled-bridge test.
  f.bridge.mockResolvedValue({ shown: true });
});
test('newer revision during capture is prepared after the old capture settles', async () => {
  const f = await fixture();
  let finish!: (value: ReturnType<typeof f.capture>) => void;
  f.bridge.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.manager.consider(2, [f.candidate]);
  await drain();
  finish(f.capture());
  await drain();
  expect(f.bridge.mock.calls.filter(([args]) => args.action === 'prepare')).toHaveLength(2);
  const begun = f.manager.begin();
  await drain();
  await begun;
  expect(f.manager.token).toBe('image-2');
});

test('destroy during capture releases a late file without adopting it', async () => {
  const f = await fixture();
  let finish!: (value: ReturnType<typeof f.capture>) => void;
  f.bridge.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  f.manager.consider(1, [f.candidate]);
  await drain();
  await f.manager.destroy();
  finish(f.capture());
  await drain();
  expect(f.manager.begin()).toBeUndefined();
  expect(f.bridge).toHaveBeenCalledWith({ action: 'release', token: 'image-1' });
});

test('incomplete image coverage keeps Web projection and releases the capture', async () => {
  const f = await fixture();
  const second = document.createElement('ion-button');
  document.body.append(second);
  f.manager.consider(1, [f.candidate, createCandidate(second, 'button', () => 'second')]);
  await drain();
  expect(f.manager.begin()).toBeUndefined();
  expect(f.bridge).toHaveBeenCalledWith({ action: 'release', token: 'image-1' });
});

test('horizontal and vertical tabs share the prepared image path', async () => {
  const f = await fixture();
  f.candidate.control.kind = 'tab-bar';
  f.manager.consider(1, [f.candidate]);
  await drain();
  expect(f.bridge).toHaveBeenCalledWith(expect.objectContaining({ action: 'prepare', ids: ['button'] }));
  f.candidate.control.placement = 'vertical-bars';
  f.manager.consider(2, [f.candidate]);
  await drain();
  expect(f.bridge).toHaveBeenCalledWith(expect.objectContaining({ action: 'prepare', ids: ['button'] }));
});

test('layout or appearance changes invalidate the old image before a new one is ready', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.candidate.control.dark = !f.candidate.control.dark;
  f.manager.consider(2, [f.candidate]);
  expect(f.manager.begin()).toBeUndefined();
  expect(f.bridge).toHaveBeenCalledWith({ action: 'release', token: 'image-1' });
});

test('a cancelled touch cannot override a newer completed image', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.touch(true);
  f.touch(false);
  f.manager.consider(2, [f.candidate]);
  await drain();
  f.manager.begin();
  expect(f.manager.token).toBe('image-2');
});

test('background changes refresh the image without requiring a native control revision', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.manager.changed();
  await drain();
  f.manager.begin();
  expect(f.manager.token).toBe('image-2');
});

test('an unfinished replacement never holds up presentation of the last completed image', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  let finish!: (result: ReturnType<typeof f.capture>) => void;
  f.bridge.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  f.manager.consider(2, [f.candidate]);
  await drain();
  f.manager.begin();
  expect(f.manager.token).toBe('image-1');
  finish(f.capture());
  await drain();
  expect(f.manager.token).toBe('image-1');
  expect(f.bridge).toHaveBeenCalledWith({ action: 'release', token: 'image-2' });
});

test('invalidation during restoration does not strand the next prepared image', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.manager.begin();
  f.manager.end();
  f.manager.invalidate();
  f.manager.updated(undefined, ['button'], 3);
  f.manager.consider(2, [f.candidate]);
  await drain();
  f.manager.begin();
  expect(f.manager.token).toBe('image-2');
});
test.each([false, true])('another overlay retires only the return copy (acknowledged: %s)', async (acknowledged) => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.manager.begin();
  f.manager.end();
  if (acknowledged) {
    await vi.advanceTimersByTimeAsync(40);
    f.manager.updated(undefined, ['button'], 3);
  }
  f.manager.begin();
  expect(f.manager.token).toBe('image-1');
  expect(f.bridge).toHaveBeenCalledWith({ action: 'restored', token: 'image-1' });
  expect(document.querySelectorAll('img')).toHaveLength(0);
});

test('a stalled native restoration releases the image and Web ownership promptly', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.manager.begin();
  f.manager.end();
  await vi.advanceTimersByTimeAsync(251);
  expect(f.manager.token).toBeUndefined();
  expect(snapshotOwns(f.button)).toBe(false);
  expect(document.querySelectorAll('img')).toHaveLength(0);
  f.manager.consider(2, [f.candidate]);
  await drain();
  f.manager.begin();
  expect(f.manager.token).toBe('image-2');
});

test('a failed native cover notification releases ownership to ordinary Web projection', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.bridge.mockRejectedValueOnce(new Error('bridge unavailable'));
  f.manager.begin();
  await vi.advanceTimersByTimeAsync(0);
  expect(f.manager.token).toBeUndefined();
  expect(snapshotOwns(f.button)).toBe(false);
  expect(document.querySelectorAll('img')).toHaveLength(0);
});

test('covered visual belongs to its source surface and does not append a foreground image', async () => {
  const f = await fixture();
  const page = document.createElement('section');
  page.className = 'ion-page';
  document.body.append(page);
  page.append(f.button);
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.manager.begin();
  expect(f.button.hasAttribute('data-native-ui-snapshot')).toBe(true);
  expect(page.hasAttribute('data-native-ui-snapshot')).toBe(false);
  expect(document.querySelectorAll('img')).toHaveLength(0);
  expect(document.querySelector('style[data-native-ui-snapshot]')?.textContent).toContain('::before');
  f.manager.invalidate();
  expect(page.hasAttribute('data-native-ui-snapshot')).toBe(false);
  expect(f.button.hasAttribute('data-native-ui-snapshot-source')).toBe(false);
  expect(document.querySelector('style[data-native-ui-snapshot]')).toBeNull();
});

test('handoff reuses prepared DOM without layout reads or waiting for the native reply', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  const bounds = vi.spyOn(f.button, 'getBoundingClientRect');
  const styles = vi.spyOn(window, 'getComputedStyle');
  f.bridge.mockImplementation(async (args) => (args.action === 'cover' ? new Promise(() => {}) : { shown: true }));
  const sheet = document.querySelector('style[data-native-ui-snapshot]');
  expect(f.manager.begin()).toBeUndefined();
  expect(f.manager.handoffPending).toBe(true);
  expect(bounds).not.toHaveBeenCalled();
  expect(styles).not.toHaveBeenCalled();
  expect(document.querySelector('style[data-native-ui-snapshot]')).toBe(sheet);
  expect(f.button.hasAttribute('data-native-ui-snapshot-visible')).toBe(true);
  await vi.advanceTimersByTimeAsync(20);
  expect(f.bridge).toHaveBeenCalledWith({ action: 'painted', token: 'image-1' });
  expect(f.manager.handoffPending).toBe(false);
});

test('invalidating a prepared or active image removes its DOM and cancels the pending handoff', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  expect(document.querySelector('style[data-native-ui-snapshot]')).not.toBeNull();
  f.manager.invalidate();
  expect(document.querySelector('style[data-native-ui-snapshot]')).toBeNull();
  f.manager.consider(2, [f.candidate]);
  await drain();
  f.manager.begin();
  f.manager.invalidate();
  await drain();
  expect(f.manager.handoffPending).toBe(false);
  expect(f.bridge.mock.calls.filter(([args]) => args.action === 'painted')).toHaveLength(0);
});

test('preparing an image leaves source styles intact until the handoff', async () => {
  const f = await fixture();
  f.button.style.filter = 'blur(1px)';
  f.button.style.transform = 'translateZ(0)';
  f.button.style.overflow = 'hidden';
  f.manager.consider(1, [f.candidate]);
  await drain();
  expect(getComputedStyle(f.button).filter).toBe('blur(1px)');
  expect(getComputedStyle(f.button).overflow).toBe('hidden');
  expect(f.button.hasAttribute('data-native-ui-snapshot-source')).toBe(false);
  f.manager.begin();
  expect(f.button.hasAttribute('data-native-ui-snapshot-visible')).toBe(true);
  expect(getComputedStyle(f.button).transform).toBe('translateZ(0)');
  f.manager.invalidate();
  expect(getComputedStyle(f.button).filter).toBe('blur(1px)');
  expect(getComputedStyle(f.button).overflow).toBe('hidden');
});

test('a declined native cover releases the prepared visual and resumes reconciliation', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.bridge.mockResolvedValueOnce({ shown: false });
  f.manager.begin();
  await drain();
  expect(f.manager.token).toBeUndefined();
  expect(f.manager.handoffPending).toBe(false);
  expect(f.button.hasAttribute('data-native-ui-snapshot')).toBe(false);
  expect(f.callbacks.wake).toHaveBeenCalled();
});

test('moving modal keeps the background cache and resumes only after its own controls return', async () => {
  const background = await fixture();
  background.manager.consider(1, [background.candidate]);
  await drain();
  background.manager.begin();
  await drain();
  const modal = document.createElement('ion-modal');
  document.body.append(modal);
  const foreground = await fixture(modal);
  foreground.manager.consider(2, [foreground.candidate]);
  await drain();
  expect(preparedOwners.has(background.button)).toBe(true);
  expect(preparedOwners.has(foreground.button)).toBe(true);
  foreground.manager.begin();
  await drain();
  expect(foreground.bridge).toHaveBeenCalledWith({ action: 'cover', token: 'image-1', transient: true });
  expect(snapshotOwns(background.button)).toBe(true);
  const clone = snapshotTargets.get(foreground.button)!;
  clone.getBoundingClientRect = () => DOMRect.fromRect({ x: 394, y: 339, width: 48, height: 48 });
  const nativeStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    if (element === clone && pseudo) return { left: '-12px', top: '-12px' } as CSSStyleDeclaration;
    return nativeStyle(element);
  });
  foreground.bridge.mockImplementation(async (args) => (args.action === 'restore' ? new Promise(() => {}) : { shown: true }));
  foreground.manager.end();
  expect(snapshotOwns(foreground.button)).toBe(false);
  expect(snapshotOwns(background.button)).toBe(true);
  expect(foreground.bridge).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'restore', parts: [expect.objectContaining({ x: 382, y: 327 })] }),
  );
  foreground.manager.updated(background.manager.token, [], 3);
  foreground.manager.updated(background.manager.token, ['button'], 2);
  expect(clone.hasAttribute('data-native-ui-snapshot-visible')).toBe(true);
  foreground.manager.updated(background.manager.token, ['button'], 3);
  expect(clone.hasAttribute('data-native-ui-snapshot-visible')).toBe(false);
  expect(preparedOwners.has(background.button)).toBe(true);
  expect(snapshotOwns(background.button)).toBe(true);
  await foreground.manager.destroy();
  expect(foreground.bridge.mock.calls.some(([args]) => args.action === 'reset')).toBe(false);
});

test('prewarmed clone styling does not recapture Native, while source changes still invalidate it', () => {
  const source = document.createElement('ion-button');
  source.setAttribute('data-native-ui-snapshot', 'source');
  const clone = document.createElement('ion-button');
  clone.className = 'ion-cloned-element';
  clone.setAttribute('data-native-ui-snapshot', 'clone');
  document.body.append(source, clone);
  const observer = new MutationObserver(() => {});
  observer.observe(document.body, { subtree: true, attributes: true, childList: true });
  clone.style.left = '394px';
  source.setAttribute('disabled', '');
  const layer = document.createElement('div');
  layer.setAttribute('data-native-ui-snapshot-layer', '');
  const image = document.createElement('img');
  layer.append(image);
  document.body.append(layer);
  image.style.left = '10px';
  layer.remove();
  const records = observer.takeRecords();
  observer.disconnect();
  expect(records.map(snapshotMutation)).toEqual([true, false, true, true, true]);
});

test.each(['segment', 'floating-action-button'] as const)('%s reuses the prepared component image', async (kind) => {
  const f = await fixture();
  f.candidate.control.kind = kind;
  f.manager.consider(1, [f.candidate]);
  await drain();
  expect(f.bridge).toHaveBeenCalledWith(expect.objectContaining({ action: 'prepare', ids: ['button'] }));
  f.manager.begin();
  expect(snapshotOwns(f.button)).toBe(true);
  expect(f.button.hasAttribute('data-native-ui-snapshot-visible')).toBe(true);
});

test('an overlay retirement cannot invalidate the prepared pre-overlay layout', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.callbacks.blocked = () => true;
  f.manager.consider(2, []);
  f.manager.begin();
  expect(f.bridge).toHaveBeenCalledWith({ action: 'cover', token: 'image-1' });
  expect(snapshotOwns(f.button)).toBe(true);
});

test.each(['button', 'button-group', 'back-button', 'menu-button', 'tab-bar', 'segment', 'floating-action-button', 'extension'] as const)(
  '%s restoration keeps its image until a complete post-resume Native acknowledgement',
  async (kind) => {
    const f = await fixture();
    f.candidate.control.kind = kind;
    f.manager.consider(2, [f.candidate]);
    await drain();
    f.manager.begin();
    f.manager.end();
    f.manager.updated(undefined, ['button'], 2);
    expect(f.button.hasAttribute('data-native-ui-snapshot-visible')).toBe(true);
    f.manager.updated(undefined, [], 3);
    expect(f.button.hasAttribute('data-native-ui-snapshot-visible')).toBe(true);
    f.manager.updated(undefined, ['button'], 4);
    expect(f.button.hasAttribute('data-native-ui-snapshot-visible')).toBe(false);
  },
);

test('an unrelated surface layout does not discard the last prepared image', async () => {
  const f = await fixture();
  const modal = document.createElement('ion-modal');
  document.body.append(modal);
  const control = document.createElement('ion-button');
  modal.append(control);
  const unrelated = createCandidate(control, 'button', () => 'other');
  f.manager.consider(1, [f.candidate, unrelated]);
  await drain();
  unrelated.control.x += 20;
  f.manager.consider(2, [f.candidate, unrelated]);
  f.manager.begin();
  expect(f.manager.token).toBe('image-1');
});

test('refreshing a prepared image updates its stylesheet in place', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  const style = document.querySelector('style[data-native-ui-snapshot]')!;
  const removed: Node[] = [];
  const observer = new MutationObserver((records) => records.forEach((record) => removed.push(...record.removedNodes)));
  observer.observe(document.head, { childList: true });
  try {
    f.manager.changed();
    await drain();
    expect(document.querySelector('style[data-native-ui-snapshot]')).toBe(style);
    expect(removed).not.toContain(style);
  } finally {
    observer.disconnect();
  }
});

test('cache retirement cannot expose a prepared clone before projection ownership is reconciled', async () => {
  const modal = document.createElement('ion-modal');
  document.body.append(modal);
  const f = await fixture(modal);
  const clone = snapshotTargets.get(f.button)!;
  f.manager.consider(1, [f.candidate]);
  await drain();
  expect(clone.hasAttribute('data-native-ui-snapshot-prepared')).toBe(true);
  f.manager.invalidate();
  expect(clone.hasAttribute('data-native-ui-snapshot')).toBe(false);
  expect(clone.hasAttribute('data-native-ui-snapshot-visible')).toBe(false);
  expect(clone.hasAttribute('data-native-ui-snapshot-prepared')).toBe(true);
  expect(preparedOwners.has(f.button)).toBe(false);
});

test('a departing modal image cannot restore onto the newly exposed modal', async () => {
  const modal = document.createElement('ion-modal');
  const parent = document.createElement('ion-modal');
  document.body.append(parent, modal);
  const f = await fixture(modal);
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.manager.begin();
  await drain();
  f.callbacks.modal = () => parent;
  f.manager.end();
  expect(f.bridge.mock.calls.some(([args]) => args.action === 'restore')).toBe(false);
  expect(snapshotOwns(f.button)).toBe(false);
  expect(f.manager.token).toBeUndefined();
});

test('a cached modal image cannot be adopted by another modal', async () => {
  const modal = document.createElement('ion-modal');
  const next = document.createElement('ion-modal');
  document.body.append(modal, next);
  const f = await fixture(modal);
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.callbacks.modal = () => next;
  f.manager.begin();
  expect(f.manager.token).toBeUndefined();
  expect(f.bridge.mock.calls.some(([args]) => args.action === 'cover')).toBe(false);
});

test('rapid reopening reuses the completed image while its replacement is pending', async () => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.manager.begin();
  await drain();
  f.manager.end();
  f.manager.updated(undefined, ['button'], 2);
  f.manager.begin();
  expect(f.manager.token).toBe('image-1');
  expect(f.bridge).not.toHaveBeenCalledWith({ action: 'release', token: 'image-1' });
  expect(f.bridge.mock.calls.filter(([args]) => args.action === 'prepare')).toHaveLength(1);
});

test.each([0, 10])('modal image reuse follows returned coordinates (movement: %s)', async (movement) => {
  const modal = document.createElement('ion-modal');
  document.body.append(modal);
  const f = await fixture(modal);
  f.manager.consider(1, [f.candidate]);
  await drain();
  f.manager.begin();
  await drain();
  const clone = snapshotTargets.get(f.button)!;
  clone.getBoundingClientRect = () => DOMRect.fromRect({ y: movement, width: 48, height: 48 });
  const style = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) =>
    pseudo ? ({ left: '1px', top: '2px' } as CSSStyleDeclaration) : style(element),
  );
  f.manager.end();
  f.manager.updated(undefined, ['button'], 2);
  f.manager.begin();
  expect(f.manager.token).toBe(movement ? undefined : 'image-1');
});

test('card images share the presenting page composition without moving their source controls', async () => {
  const f = await fixture();
  const page = document.createElement('main');
  document.body.append(page);
  page.getBoundingClientRect = () => DOMRect.fromRect({ x: 8, y: 20, width: 300, height: 600 });
  f.manager.consider(1, [f.candidate]);
  await drain();
  const originalParent = f.button.parentElement;
  f.manager.begin(page);
  const layer = page.querySelector<HTMLElement>('[data-native-ui-snapshot-layer]')!;
  expect(layer).not.toBeNull();
  expect(layer.style.left).toBe('-8px');
  expect(layer.style.top).toBe('-20px');
  expect(layer.querySelector('img')?.style.left).toBe('1px');
  expect(f.button.parentElement).toBe(originalParent);
  expect(f.button.hasAttribute('data-native-ui-snapshot-visible')).toBe(false);
  expect(snapshotOwns(f.button)).toBe(true);
  expect(f.bridge.mock.calls.filter(([args]) => args.action === 'prepare')).toHaveLength(1);
  f.manager.end();
  f.manager.updated(undefined, ['button'], 2);
  expect(layer.isConnected).toBe(false);
  expect(snapshotOwns(f.button)).toBe(false);
  // A later presentation reuses the same decoded layer; no accumulation.
  f.manager.begin(page);
  expect(page.querySelector('[data-native-ui-snapshot-layer]')).toBe(layer);
  expect(page.querySelectorAll('[data-native-ui-snapshot-layer]')).toHaveLength(1);
  f.manager.invalidate();
  expect(layer.isConnected).toBe(false);
});

test.each(['cover-false', 'cover-error', 'painted-error'])('ignores a previous presentation reply after cache reuse: %s', async (reply) => {
  const f = await fixture();
  f.manager.consider(1, [f.candidate]);
  await drain();
  let finish!: (value: { shown: boolean }) => void;
  let fail!: (reason: Error) => void;
  const pending = new Promise<{ shown: boolean }>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  if (reply === 'painted-error') f.bridge.mockImplementationOnce(async () => ({ shown: true }));
  f.bridge.mockImplementationOnce(() => pending);
  f.manager.begin();
  await vi.advanceTimersByTimeAsync(20);
  f.manager.end();
  f.manager.updated(undefined, ['button'], 2);
  f.manager.begin();
  expect(f.manager.token).toBe('image-1');
  if (reply === 'cover-false') finish({ shown: false });
  else fail(new Error('Delayed previous presentation failure'));
  await vi.advanceTimersByTimeAsync(0);
  expect(f.manager.token).toBe('image-1');
  expect(snapshotOwns(f.button)).toBe(true);
  expect(f.button.hasAttribute('data-native-ui-snapshot-visible')).toBe(true);
});
