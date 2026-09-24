import type { PluginListenerHandle } from '@capacitor/core';
import type { NativeUIShellHandle } from './definitions.js';

export const bindMetricsLifecycle = async (
  runtime: NativeUIShellHandle,
  listen: () => Promise<PluginListenerHandle>,
  deactivate: () => void,
): Promise<NativeUIShellHandle> => {
  let listener: PluginListenerHandle;
  try {
    listener = await listen();
  } catch (error) {
    await runtime.destroy();
    throw error;
  }

  let destroying: Promise<void> | undefined;
  return {
    getStatus: runtime.getStatus,
    suspend: runtime.suspend,
    destroy() {
      return (destroying ??= (async () => {
        let removalError: unknown;
        try {
          await listener.remove();
        } catch (error) {
          removalError = error;
        }
        try {
          await runtime.destroy();
        } finally {
          deactivate();
        }
        if (removalError) throw removalError;
      })());
    },
  };
};
