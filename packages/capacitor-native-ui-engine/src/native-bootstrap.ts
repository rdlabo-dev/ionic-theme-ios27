import { startNativeSession, type NativeSessionConfiguration } from './native-session.js';
import type { ListenerHandle } from './types.js';

const sessions = new Map<string, { destroy(): Promise<void> }>();
const pending = new Map<string, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
const interactions = new Map<string, (event: { active: boolean }) => void>();
const documentID = Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16)).join('-');
let sequence = 0;
const send = (id: string, request: unknown): Promise<any> =>
  new Promise((resolve, reject) => {
    const key = `${id}:${documentID}:${++sequence}`;
    const timer = setTimeout(() => {
      pending.delete(key);
      reject(new Error('Native UI session timed out'));
    }, 5000);
    pending.set(key, { resolve, reject, timer });
    const message = JSON.stringify({ key, request });
    const host = globalThis as any;
    const channel = host.webkit?.messageHandlers?.[id] ?? host[id];
    if (!channel) {
      clearTimeout(timer);
      pending.delete(key);
      reject(new Error('Native UI session unavailable'));
      return;
    }
    try {
      channel.postMessage(message);
    } catch (error) {
      clearTimeout(timer);
      pending.delete(key);
      reject(error);
    }
  });
export const receive = (id: string, key: string | null, value: any, error?: string) => {
  if (key === null) {
    interactions.get(id)?.(value);
    return;
  }
  const item = pending.get(key);
  if (!item || !key.startsWith(`${id}:`)) return;
  pending.delete(key);
  clearTimeout(item.timer);
  if (error) item.reject(new Error(error));
  else item.resolve(value);
};
export const stop = async (id: string) => {
  const session = sessions.get(id);
  sessions.delete(id);
  for (const [key, item] of pending) {
    if (!key.startsWith(`${id}:`)) continue;
    pending.delete(key);
    clearTimeout(item.timer);
    item.reject(new Error('Native UI session closed'));
  }
  await session?.destroy();
  interactions.delete(id);
};
export const start = async (config: NativeSessionConfiguration) => {
  if (sessions.has(config.id)) return;
  // Reserve before asynchronous initialization, including duplicate Native init callbacks.
  let actual: Awaited<ReturnType<typeof startNativeSession>> | undefined;
  let cancelled = false;
  const reservation = {
    destroy: async () => {
      cancelled = true;
      await actual?.destroy();
    },
  };
  sessions.set(config.id, reservation);
  try {
    if (document.readyState === 'loading')
      await new Promise<void>((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
    if (cancelled) return;
    actual = await startNativeSession(config, {
      send: (request) => send(config.id, request),
      listen: async (listener): Promise<ListenerHandle> => {
        interactions.set(config.id, listener);
        return {
          remove: () => {
            interactions.delete(config.id);
          },
        };
      },
    });
    if (cancelled) await actual.destroy();
  } catch (error) {
    if (sessions.get(config.id) === reservation) sessions.delete(config.id);
    throw error;
  }
};
