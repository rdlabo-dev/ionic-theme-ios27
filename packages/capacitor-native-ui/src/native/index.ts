// Compatibility Ionic entrypoint. Standard HTML consumers can import /core without Ionic.
import { startNativeUIShell as activate } from './startup';
import type { NativeUIShellOptions, VerticalControlAreaOptions, VerticalControlAreaHandle } from './definitions';
import { setVerticalControlAreaPlacement } from './legacy-layout';
export { setVerticalControlAreaPlacement } from './legacy-layout';
export { configureNativeTransition, IonicNativeUIShell } from './activation';
export { defineNativeUI } from './extensions';
export type { NativeUIExtension, NativeUIValue, NativeUIReadContext, NativeUIImageReference } from './extensions';
export type {
  NativeUIVerticalBarsOptions,
  NativeUIShellComponent,
  NativeUIShellControls,
  AutoIonicControls,
  IonicProjectionOptions,
  NativeUIShellHandle,
  NativeUIShellOptions,
  NativeUIShellStatus,
  NativeUIShellSuspension,
  VerticalBarEdge,
  VerticalBarPlacement,
  VerticalControlAreaHandle,
  ToolbarProjectionOptions,
  VerticalControlAreaOptions,
  WebViewMetrics,
} from './definitions';

export const enableNativeUIShell = (options: NativeUIShellOptions = {}) =>
  activate(options, async (...args) => (await import('./overlays/controller')).createOverlayController(...args));

export const enableVerticalControlArea = async (options: VerticalControlAreaOptions = {}): Promise<VerticalControlAreaHandle> => {
  const handle = await enableNativeUIShell({
    extensions: options.extensions,
    horizontal: options.horizontal,
    vertical: options.vertical,
    buttonProjection: options.buttonProjection,
    buttonDefaultFill: options.buttonDefaultFill,
    controls: { tabs: true, toolbar: true, popover: options.controls?.popover === true },
    verticalBarsOnly: true,
  });
  return { ...handle, setPlacement: setVerticalControlAreaPlacement };
};
