import type { ListenerHandle as PluginListenerHandle } from './types.js';

// A failed bridge must not leave the source inaccessible indefinitely.
export const bounded = <T>(promise: Promise<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Native UI bridge timed out')), 5000);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });

/** A timed-out registration still owns a native resource if it eventually succeeds. */
export const boundedListener = async (registration: Promise<PluginListenerHandle>): Promise<PluginListenerHandle> => {
  try {
    return await bounded(registration);
  } catch (error) {
    void registration.then((listener) => listener.remove()).catch(() => {});
    throw error;
  }
};
