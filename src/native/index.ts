import { Capacitor, registerPlugin } from '@capacitor/core';
import type { NativeUIShellHandle, NativeUIShellPlugin } from './definitions';
import { createRuntime } from './runtime';
export type { NativeUIShellComponent, NativeUIShellHandle, NativeUIShellStatus } from './definitions';

const plugin = registerPlugin<NativeUIShellPlugin>('IonicNativeUIShell');
let active: Promise<NativeUIShellHandle> | undefined;
const web = (reason: string): NativeUIShellHandle => ({
  getStatus: () => ({ state: 'web', projected: 0, updates: 0, reason }),
  destroy: async () => {},
});

/** Call once at application startup. Ionic markup remains the source of truth. */
export const enableNativeUIShell = (): Promise<NativeUIShellHandle> => {
  if (typeof document === 'undefined' || Capacitor.getPlatform() !== 'ios') return Promise.resolve(web('Requires Capacitor iOS'));
  return (active ??= (async () => {
    try {
      if (!(await plugin.configure()).supported) {
        active = undefined;
        return web('Requires iOS 26 or later');
      }
      const runtime = await createRuntime(document, plugin);
      return {
        getStatus: runtime.getStatus,
        async destroy() {
          await runtime.destroy();
          active = undefined;
        },
      };
    } catch (error) {
      active = undefined;
      return web(error instanceof Error ? error.message : String(error));
    }
  })());
};
