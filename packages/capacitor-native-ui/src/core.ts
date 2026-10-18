/** Standard native UI and app-local SwiftUI extensions. No Ionic runtime import. */
export { enableNativeUIShell } from './native/startup';
export { defineNativeUI } from './native/extensions';
export type { NativeUIExtension, NativeUIValue } from './native/extensions';
export type {
  NativeUIShellOptions,
  NativeUIVerticalBarsOptions,
  NativeUIShellControls,
  NativeUIShellHandle,
  NativeUIShellStatus,
  NativeUIShellSuspension,
} from './native/definitions';
