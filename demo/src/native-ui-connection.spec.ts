import { afterEach, expect, test, vi } from 'vitest';
import { createNativeConnection } from '../../packages/capacitor-native-ui/src/native/shared/connection';
import type { NativeUIConnectionState, NativeUIPlugin } from '../../packages/capacitor-native-ui/src/native/definitions';

let connection: ReturnType<typeof createNativeConnection>;
afterEach(() => {
  connection?.stop();
  vi.useRealTimers();
});
const fixture = () => {
  vi.useFakeTimers();
  const listeners = new Map<string, Set<(event: never) => void>>();
  const state: NativeUIConnectionState = {
    session: 'original',
    surfaces: { horizontal: true, vertical: true },
    revision: 4,
    sequence: 8,
    listeners: [],
  };
  const read = vi.fn(async () => ({ ...state, listeners: [...listeners].filter(([, values]) => values.size).map(([name]) => name) }));
  const plugin = {
    getConnectionState: read,
    addListener: vi.fn(async (name: string, callback: (event: never) => void) => {
      const values = listeners.get(name) ?? new Set();
      listeners.set(name, values);
      values.add(callback);
      return {
        remove: async () => {
          values.delete(callback);
        },
      };
    }),
  };
  connection = createNativeConnection(document, plugin as unknown as NativeUIPlugin);
  return { listeners, read, plugin, state };
};

test('one shared handshake restores lost subscriptions without replaying actions or duplicating callbacks', async () => {
  const f = fixture();
  const action = vi.fn();
  await connection.listen('activate', action);
  await connection.listen('search', vi.fn());
  const reconcile = vi.fn();
  connection.observe(reconcile);
  connection.start();
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.read).toHaveBeenCalledTimes(1);
  expect(f.plugin.addListener).toHaveBeenCalledTimes(2);
  f.listeners.clear();
  await vi.advanceTimersByTimeAsync(1000);
  expect(reconcile.mock.calls.at(-1)?.[1]).toBe(true);
  expect(f.plugin.addListener).toHaveBeenCalledTimes(4);
  expect(action).not.toHaveBeenCalled();
  f.listeners.get('activate')!.forEach((callback) => callback({} as never));
  expect(action).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.plugin.addListener).toHaveBeenCalledTimes(4);
});

test('a timed-out connection check retries without accepting the stale response', async () => {
  const f = fixture();
  f.read.mockImplementationOnce(() => new Promise(() => {}));
  const reconcile = vi.fn();
  connection.observe(reconcile);
  connection.start();
  await vi.advanceTimersByTimeAsync(5000);
  expect(f.read).toHaveBeenCalledTimes(1);
  expect(reconcile).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000);
  expect(f.read).toHaveBeenCalledTimes(2);
  expect(reconcile.mock.calls.at(-1)?.[1]).toBe(true);
});

test('a late response after stop cannot resubscribe or synchronize', async () => {
  const f = fixture();
  let reply!: (state: NativeUIConnectionState) => void;
  f.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        reply = resolve;
      }),
  );
  await connection.listen('activate', vi.fn());
  const reconcile = vi.fn();
  connection.observe(reconcile);
  connection.start();
  await vi.advanceTimersByTimeAsync(1000);
  connection.stop();
  reply(f.state);
  await vi.advanceTimersByTimeAsync(5000);
  expect(reconcile).not.toHaveBeenCalled();
  expect(f.plugin.addListener).toHaveBeenCalledOnce();
});

test('three failed handshakes notify fallback once and stop checking after teardown', async () => {
  const f = fixture();
  f.read.mockRejectedValue(new Error('Disconnected'));
  const fallback = vi.fn(() => connection.stop());
  connection.observe(vi.fn(), fallback);
  connection.start();
  await vi.advanceTimersByTimeAsync(2000);
  expect(fallback).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(fallback).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10000);
  expect(f.read).toHaveBeenCalledTimes(3);
});

test('a successful handshake resets the consecutive failure budget', async () => {
  const f = fixture();
  const fallback = vi.fn();
  connection.observe(vi.fn(), fallback);
  connection.start();
  f.read.mockRejectedValueOnce(new Error('Disconnected')).mockRejectedValueOnce(new Error('Disconnected'));
  await vi.advanceTimersByTimeAsync(3000);
  f.read.mockRejectedValueOnce(new Error('Disconnected')).mockRejectedValueOnce(new Error('Disconnected'));
  await vi.advanceTimersByTimeAsync(2000);
  expect(fallback).not.toHaveBeenCalled();
});

test('three timed-out handshakes exhaust recovery and late replies cannot resume it', async () => {
  const f = fixture();
  const replies: ((state: NativeUIConnectionState) => void)[] = [];
  f.read.mockImplementation(() => new Promise((resolve) => replies.push(resolve)));
  const reconcile = vi.fn();
  const fallback = vi.fn(() => connection.stop());
  connection.observe(reconcile, fallback);
  connection.start();
  await vi.advanceTimersByTimeAsync(17999);
  expect(fallback).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(fallback).toHaveBeenCalledOnce();
  replies.forEach((reply) => reply(f.state));
  await vi.advanceTimersByTimeAsync(10000);
  expect(f.read).toHaveBeenCalledTimes(3);
  expect(reconcile).not.toHaveBeenCalled();
});
