import type { NativeUIExtension } from './extensions';
import type { PluginListenerHandle } from '@capacitor/core';

export type NativeUIShellComponent =
  | 'ion-button'
  | 'ion-buttons'
  | 'ion-back-button'
  | 'ion-menu-button'
  | 'ion-tab-bar'
  | 'ion-segment'
  | 'ion-fab';

export interface NativeUIShellStatus {
  state: 'web' | 'native' | 'stopped';
  projected: number;
  updates: number;
  reason?: string;
}

export interface VerticalControlAreaOptions {
  /** App-local DOM readers with matching SwiftUI or Compose registrations. */
  extensions?: readonly NativeUIExtension[];
  /** Opt-in popovers anchored to native Vertical Bars buttons. */
  controls?: Pick<NativeUIShellControls, 'popover'>;
  /** Appearance of native vertical ion-button and ion-menu-button actions.
   * `system` (default) uses SwiftUI styling and template icons; `source` projects supported Ionic fill and colors.
   * Local data-projection="source|system" or ios-theme-projection-source / ios-theme-projection-system take precedence:
   * the button itself, then its nearest ion-buttons, then this option. On the same element, a valid attribute wins;
   * otherwise system wins if both classes are present. Invalid attribute values are ignored.
   * Local settings update live; removing them restores inheritance. Actions, disabled state and grouping are preserved.
   * Does not affect back buttons, tabs, FABs, horizontal controls, source elements or Web clones.
   */
  buttonProjection?: 'source' | 'system';
  /** Default fill for native vertical ion-button actions resolved to `source`, including local overrides.
   * Use `solid` for Ionic's default design, or `null` (also the omitted default) for the iOS theme's glass design.
   * Applies when fill is omitted or `default`, outside ion-buttons. Inside ion-buttons the default is clear.
   * Explicit clear, solid and outline take precedence; clear and outline cannot be configured as defaults.
   * Source elements and Web clones are unchanged.
   */
  buttonDefaultFill?: 'solid' | null;
}

export interface NativeUIShellOptions extends VerticalControlAreaOptions {
  /** Log Web fallback reasons and their source elements once per reason during this activation. Defaults to false. */
  debug?: boolean;
  verticalBars?: NativeUIVerticalBarsOptions;
  /** Ionic adapter settings. Explicit data-native-ui sources and extensions remain independent. */
  ionic?: IonicProjectionOptions;
  /** Source subtree. Defaults to document.body. */
  root?: HTMLElement;
  /** @deprecated Call destroy() on the running handle to stop the shell. */
  enabled?: boolean;
  /** @deprecated Use ionic.auto for automatic Ionic projection and verticalBars.popover for popovers. */
  controls?: NativeUIShellControls;
  /** @deprecated Use verticalBars.only. */
  verticalBarsOnly?: boolean;
}

/** @internal Resolved adapter state; not an application configuration API. */
export interface NativeUIShellRuntimeOptions extends NativeUIShellOptions {
  source?: 'ionic' | 'html' | 'auto' | 'extensions';
  /** @internal Preserves legacy controls.buttons behavior for explicit sources. */
  explicitControls?: boolean;
  nativeState?: { edge?: 'left' | 'right' };
  /** @internal Keep unavailable definitions discoverable for diagnostics without calling their readers. */
  unavailableExtensions?: ReadonlyMap<string, string>;
  rail?: { host: HTMLElement; edge: 'left' | 'right' };
}

export interface IonicProjectionOptions {
  /** Automatic Ionic projection. Defaults to true; partial objects keep omitted kinds enabled. */
  auto?: boolean | AutoIonicControls;
}

export interface AutoIonicControls {
  buttons?: boolean;
  tabs?: boolean;
  segment?: boolean;
  fab?: boolean;
}

export interface NativeUIShellControls {
  /** Toolbar actions and explicitly marked HTML buttons. Defaults to true. */
  buttons?: boolean;
  /** Projects tab bars and their native search presentation. */
  tabs?: boolean;
  /** @deprecated Use buttons. Projects toolbar buttons, including back and menu buttons. */
  toolbar?: boolean;
  /** Projects segments. */
  segment?: boolean;
  /** Projects floating action buttons. */
  fab?: boolean;
  /** Relays popovers anchored to native Vertical Bars buttons. Defaults to false. */
  popover?: boolean;
}

/** A running shell. Placement changes preserve all other startup settings. */
export interface NativeUIShellHandle extends NativeUIShellRuntimeHandle {
  /** Enable rail projection when available, preserving other settings. Rejects after destroy. */
  enableVerticalControlArea(): Promise<void>;
  /** Restore rail sources to the Web without stopping ordinary native controls. Rejects after destroy. */
  disableVerticalControlArea(): Promise<void>;
}

export interface NativeUIVerticalBarsOptions {
  /** Defaults to true. Availability is always determined separately. */
  enabled?: boolean;
  /** Project only rail controls; unavailable or disabled rails leave controls on the Web. */
  only?: boolean;
  buttonProjection?: 'system' | 'source';
  /** Source-style standalone buttons with no explicit fill. Defaults to glass. */
  buttonDefaultFill?: 'glass' | 'solid';
  /** Ionic popover relay. Defaults to false. */
  popover?: boolean;
  /** Placement preference, not a declaration of device capability. */
  placement?: { edge: Exclude<VerticalBarEdge, null>; webHost?: HTMLElement };
}

export interface NativeUIShellRuntimeHandle {
  /** Schedule a source recheck. Calls coalesce; unchanged snapshots are not sent. No-op after destroy or without a runtime. */
  markForCheck(): void;
  /** Returns the current Web/native projection state. */
  getStatus(): NativeUIShellStatus;
  /** Restores projected controls to the Web until the returned lease is resumed. */
  suspend(): Promise<NativeUIShellSuspension>;
  /** Stops synchronization, restores Web controls and releases native resources. */
  destroy(): Promise<void>;
}

/** Logical edge in the reading direction, matching UIVerticalBarEdge and capacitor-foldable. */
export type VerticalBarEdge = 'leading' | 'trailing' | null;

export interface VerticalBarPlacement {
  edge: VerticalBarEdge;
  /** Explicit rail width in CSS pixels; omitted to use the stylesheet's safe-area rules. */
  inset?: number;
  /** Ignored. Native availability is read from the plugin’s own device metrics.
   * @deprecated This input no longer reports native availability.
   */
  nativeEdge?: VerticalBarEdge;
}

export interface VerticalControlAreaHandle extends NativeUIShellHandle {
  /** Legacy Web CSS adapter. Use the theme setVerticalBarsLayout helper instead.
   * @deprecated Web layout belongs to the theme or application.
   */
  setPlacement(placement: VerticalBarEdge | VerticalBarPlacement, rtl?: boolean): void;
}

export interface NativeUIShellSuspension {
  /** Releases this suspension. Native projection resumes after all active suspensions are released. */
  resume(): Promise<void>;
}

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShellBadge {
  value: string;
  color: string;
  textColor: string;
}

export interface ShellItem extends Frame {
  id: string;
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  selected: boolean;
  fontSize: number;
  fontWeight: number;
  color: string;
  /** Resolved ion-button fill for vertical projection; clear omits the native glass background. */
  buttonFill?: 'clear' | 'solid' | 'outline';
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  badge?: ShellBadge;
  icon?: string;
  iconWidth?: number;
  iconHeight?: number;
  iconPosition?: 'leading' | 'trailing' | 'top';
  imagePadding?: number;
  contentInsetLeading?: number;
  contentInsetTrailing?: number;
  iconTemplate?: boolean;
  visible?: boolean;
  closeIcon?: string;
  closeIconWidth?: number;
  closeIconHeight?: number;
  iconTransition?: number;
}

/** Standard native renderers, independent of the source Web framework. */
export type NativeUIControlKind =
  | 'button'
  | 'button-group'
  | 'back-button'
  | 'menu-button'
  | 'tab-bar'
  | 'segment'
  | 'floating-action-button';

export interface ShellControl extends Frame {
  id: string;
  kind: NativeUIControlKind | 'extension';
  extension?: { name: string; props: string; actions: Record<string, string>; tabBarId?: string };
  /** Lets the native host own adaptive placement instead of mirroring the DOM frame. */
  placement?: 'vertical-bars';
  /** Logical Ionic toolbar slot, preserved when projecting to the vertical rail. */
  toolbarSlot?: 'start' | 'end';
  items: ShellItem[];
  dark: boolean;
  rtl: boolean;
  tabBarAnchor?: { x: 0 | 0.5 | 1; y: 0 | 1 };
  search?: ShellSearch;
}

export interface ShellSearch {
  id: string;
  field: ShellItem;
  trigger: ShellItem;
  closeId: string;
  active: boolean;
  available: boolean;
  focused: boolean;
  value: string;
  placeholder: string;
  disabled: boolean;
  editSequence: number;
  valueVersion: number;
}

export interface ShellSearchEvent extends ShellActivation {
  valueVersion: number;
  phase: 'input' | 'focus' | 'blur' | 'clear' | 'commit';
  value: string;
  composing: boolean;
}

export interface ShellSnapshot {
  revision: number;
  transitionDuration?: number;
  viewportWidth: number;
  /** Physical side the native rail is drawn on; the runtime resolves the logical edge through the document direction. */
  verticalBarEdge?: 'left' | 'right';
  /** Visible foreground modal bounds; omitted for the full page. */
  verticalBarFrame?: Frame;
  controls: ShellControl[];
}

export interface ShellActivation {
  revision: number;
  id: string;
  sequence: number;
  /** Native extension action awaiting a Web dispatch acknowledgement. */
  requestId?: string;
}

export interface WebViewMetrics {
  /** The WebView's effective top-left corner radius in points, or `0` when unavailable. */
  radius: number;
  /** Device-reported logical rail edge; null when unavailable. */
  verticalBarEdge?: VerticalBarEdge;
}

export interface NativeUIShellPlugin {
  configure(options?: { verticalBarsOnly?: boolean }): Promise<{ supported: boolean; extensions?: string[] }>;
  completeExtensionAction(options: { requestId: string; accepted: boolean }): Promise<void>;
  getWebViewMetrics(): Promise<WebViewMetrics>;
  getVerticalBarsGeometry(options: { viewportWidth: number; ids: string[] }): Promise<{ revision?: number; items: Record<string, Frame> }>;
  prepareOverlay(options: { id: string }): Promise<void>;
  presentOverlay(options: { id: string; presentation?: ShellPopoverPresentation }): Promise<void>;
  dismissOverlay(options: { id: string; animated: boolean }): Promise<void>;
  closeOverlay(options: { id: string }): Promise<void>;
  stopOverlays(): Promise<void>;
  update(snapshot: ShellSnapshot): Promise<{ revision: number; rejectedSearches?: string[]; rejectedControls?: string[] }>;
  clear(options: { revision: number }): Promise<void>;
  addListener(name: 'activate', listener: (event: ShellActivation) => void): Promise<PluginListenerHandle>;
  addListener(name: 'search', listener: (event: ShellSearchEvent) => void): Promise<PluginListenerHandle>;
  addListener(name: 'webViewMetricsChange', listener: (event: WebViewMetrics) => void): Promise<PluginListenerHandle>;
  addListener(name: 'overlay', listener: (event: ShellOverlayEvent) => void): Promise<PluginListenerHandle>;
}

export interface ShellPopoverPresentation {
  kind: 'popover';
  animated: boolean;
  dark: boolean;
  anchorId: string;
  width: number;
  height: number;
  backgroundColor: string;
  backdropDismiss: boolean;
}

export interface ShellOverlayEvent {
  id: string;
  action: 'dismiss';
}
