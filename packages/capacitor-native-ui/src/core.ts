/** Standard native UI and app-local SwiftUI and Compose extensions. No Ionic runtime import. */
export { enableNativeUI } from './native/startup';
export { defineNativeUI } from './native/extensions';
export type { NativeUIExtension, NativeUIValue, NativeUIReadContext, NativeUIImageReference } from './native/extensions';
export type {
  NativeUIOptions,
  NativeUIVerticalBarsOptions,
  NativeUIControls,
  AutoIonicControls,
  IonicProjectionOptions,
  ToolbarProjectionOptions,
  NativeUIHandle,
  NativeUIStatus,
  NativeUISuspension,
} from './native/definitions';
