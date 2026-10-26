import { expect, test } from '@playwright/test';
import { bindProjectionEvents } from '../src/projection-events.js';

test('shared notification subscribes once and delivers destination with update atomically', async () => {
  const callbacks = new Map<string, (event: unknown) => void>();
  const deliveries: unknown[] = [];
  let removals = 0;
  const binding = await bindProjectionEvents(
    {
      addListener: async (name, callback) => {
        expect(callbacks.has(name)).toBe(false);
        callbacks.set(name, callback);
        return {
          remove: () => {
            removals++;
          },
        };
      },
      update: ['shown', 'shown'],
      projection: { native: ['shown', 'shown'] },
    },
    (destination, updated) => deliveries.push([destination, updated]),
  );
  callbacks.get('shown')!({});
  expect(deliveries).toEqual([['native', true]]);
  await binding.remove();
  await binding.remove();
  callbacks.get('shown')!({});
  expect(deliveries).toHaveLength(1);
  expect(removals).toBe(1);
});

test('conflicting destination declarations fail before registering listeners', async () => {
  let registrations = 0;
  await expect(
    bindProjectionEvents(
      {
        addListener: async () => {
          registrations++;
          return { remove() {} };
        },
        projection: { web: ['transition'], native: ['transition'] },
      },
      () => {},
    ),
  ).rejects.toThrow('conflicting destinations');
  expect(registrations).toBe(0);
});

test('registration failure disposes existing and late subscriptions and disables callbacks', async () => {
  let resolveLate!: (handle: { remove(): void }) => void;
  const late = new Promise<{ remove(): void }>((resolve) => {
    resolveLate = resolve;
  });
  const callbacks: ((event: unknown) => void)[] = [];
  const removed: string[] = [];
  let deliveries = 0;
  await expect(
    bindProjectionEvents(
      {
        update: ['ready', 'failed', 'late'],
        addListener: async (name, callback) => {
          callbacks.push(callback);
          if (name === 'failed') throw new Error('registration failed');
          if (name === 'late') return late;
          return {
            remove: () => {
              removed.push(name);
            },
          };
        },
      },
      () => {
        deliveries++;
      },
    ),
  ).rejects.toThrow('registration failed');
  resolveLate({
    remove: () => {
      removed.push('late');
    },
  });
  await expect.poll(() => removed.sort()).toEqual(['late', 'ready']);
  callbacks.forEach((callback) => callback({}));
  expect(deliveries).toBe(0);
});
