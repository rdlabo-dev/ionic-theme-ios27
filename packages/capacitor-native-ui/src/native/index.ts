// Compatibility Ionic entrypoint. Standard HTML consumers can import /core without Ionic.
import { startNativeUI as activate } from './startup';
import type { NativeUIOptions, VerticalControlAreaOptions, VerticalControlAreaHandle } from './definitions';
import { setVerticalControlAreaPlacement } from './legacy-layout';
export { setVerticalControlAreaPlacement } from './legacy-layout';
export { configureNativeTransition, NativeUI } from './activation';
export { defineNativeUI } from './extensions';
export type { NativeUIExtension, NativeUIValue, NativeUIReadContext, NativeUIImageReference } from './extensions';
export type {
  NativeUIVerticalBarsOptions,
  NativeUIComponent,
  NativeUIControls,
  AutoIonicControls,
  IonicProjectionOptions,
  NativeUIHandle,
  NativeUIOptions,
  NativeUIStatus,
  NativeUISuspension,
  VerticalBarEdge,
  VerticalBarPlacement,
  VerticalControlAreaHandle,
  ToolbarProjectionOptions,
  VerticalControlAreaOptions,
  WebViewMetrics,
} from './definitions';

export const enableNativeUI = (options: NativeUIOptions = {}) =>
  activate(options, async (...args) => (await import('./overlays/controller')).createOverlayController(...args));

export const enableVerticalControlArea = async (options: VerticalControlAreaOptions = {}): Promise<VerticalControlAreaHandle> => {
  const handle = await enableNativeUI({
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
