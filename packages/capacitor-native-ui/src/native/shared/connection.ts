import type { PluginListenerHandle } from '@capacitor/core';
import type { NativeUIConnectionState, NativeUIPlugin } from '../definitions';
import { bounded, boundedListener } from './bridge';

type Check = (state: NativeUIConnectionState, restored: boolean, requestedAt: number) => void | Promise<void>;
type Failure = (error: unknown) => void | Promise<void>;
const failureLimit = 3;

type Registration = { name: string; callback: (event: never) => void; handle?: PluginListenerHandle };

/** One connection check for the shell, independent of projection retention. */
export const createNativeConnection = (doc: Document, plugin: NativeUIPlugin) => {
  const registrations = new Set<Registration>();
  const checks = new Set<Check>();
  const failures = new Map<Check, Failure>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let session: string | undefined;
  let failed = false;
  let consecutiveFailures = 0;
  const install = async (registration: Registration) => {
    const add = plugin.addListener as (name: string, callback: (event: never) => void) => Promise<PluginListenerHandle>;
    const handle = await boundedListener(add.call(plugin, registration.name, registration.callback));
    if (stopped || !registrations.has(registration)) await bounded(handle.remove());
    else registration.handle = handle;
  };
  const listen = (async (name: string, callback: (event: never) => void) => {
    const registration: Registration = { name, callback };
    registrations.add(registration);
    try {
      await install(registration);
    } catch (error) {
      registrations.delete(registration);
      throw error;
    }
    return {
      async remove() {
        registrations.delete(registration);
        await registration.handle?.remove();
      },
    };
  }) as NativeUIPlugin['addListener'];
  const check = async () => {
    if (stopped) return;
    if (!doc.hidden) {
      const requestedAt = doc.defaultView!.performance.now();
      const registered = Array.from(registrations);
      const observed = Array.from(checks);
      try {
        const state = await bounded(plugin.getConnectionState());
        if (stopped) return;
        let restored = failed || (session !== undefined && session !== state.session);
        session = state.session;
        for (const registration of registered) {
          if (state.listeners.includes(registration.name) || !registrations.has(registration)) continue;
          // Remove our previous callback before installing another; never replay events.
          await bounded(Promise.resolve(registration.handle?.remove()));
          if (stopped || !registrations.has(registration)) continue;
          await install(registration);
          restored = true;
        }
        if (stopped) return;
        for (const callback of observed) {
          if (checks.has(callback)) await callback(state, restored, requestedAt);
          if (stopped) return;
        }
        failed = false;
        consecutiveFailures = 0;
      } catch (error) {
        if (stopped) return;
        // A later successful handshake repairs subscriptions and resynchronizes
        // current state. A timeout ends this logical check, not the underlying request.
        failed = true;
        if (++consecutiveFailures >= failureLimit) {
          for (const callback of observed) {
            if (checks.has(callback)) await failures.get(callback)?.(error);
            if (stopped) return;
          }
        }
      }
    }
    if (!stopped) timer = setTimeout(() => void check(), 1000);
  };
  return {
    listen,
    observe(callback: Check, failure?: Failure) {
      checks.add(callback);
      if (failure) failures.set(callback, failure);
      return () => {
        checks.delete(callback);
        failures.delete(callback);
      };
    },
    start() {
      timer = setTimeout(() => void check(), 1000);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      checks.clear();
      failures.clear();
    },
  };
};
export type NativeUIConnection = ReturnType<typeof createNativeConnection>;
