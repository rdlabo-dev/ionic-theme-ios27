import { expect, test, vi } from 'vitest';
import type { NativeUIShellHandle } from '../../src/native';
import { bindMetricsLifecycle } from '../../src/native/lifecycle';

const runtime = (destroy = vi.fn(async () => {})): NativeUIShellHandle => ({
  getStatus: () => ({ state: 'native', projected: 1, updates: 1 }),
  suspend: async () => ({ resume: async () => {} }),
  destroy,
});

test('listener registration failure destroys the initialized runtime', async () => {
  const destroy = vi.fn(async () => {});
  const failure = new Error('listener registration failed');

  await expect(bindMetricsLifecycle(runtime(destroy), async () => Promise.reject(failure), vi.fn())).rejects.toBe(failure);
  expect(destroy).toHaveBeenCalledOnce();
});

test('listener removal failure still destroys and deactivates once', async () => {
  const destroy = vi.fn(async () => {});
  const deactivate = vi.fn();
  const failure = new Error('listener removal failed');
  const handle = await bindMetricsLifecycle(runtime(destroy), async () => ({ remove: async () => Promise.reject(failure) }), deactivate);

  await expect(handle.destroy()).rejects.toBe(failure);
  await expect(handle.destroy()).rejects.toBe(failure);
  expect(destroy).toHaveBeenCalledOnce();
  expect(deactivate).toHaveBeenCalledOnce();
});
