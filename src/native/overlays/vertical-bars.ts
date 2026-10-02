import type { NativeUIShellOptions, NativeUIShellPlugin } from '../definitions';
import { prehideVerticalBarsToolbarSources } from '../prehide';
import { createRuntime } from '../runtime';

/** Reuse toolbar eligibility and activation against the relayed document. */
export const relayVerticalBars = async (doc: Document, plugin: NativeUIShellPlugin, options: NativeUIShellOptions, overlayId: string) => {
  const toolbar = options.controls === undefined || options.controls.toolbar === true;
  const prehide = toolbar ? prehideVerticalBarsToolbarSources(doc) : undefined;
  const runtime = await createRuntime(doc, plugin, { ...options, controls: { toolbar } }, () => true, true, overlayId);
  return async () => {
    await runtime.destroy();
    prehide?.stop();
  };
};
