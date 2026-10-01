import type { PluginListenerHandle } from '@capacitor/core';

import type { NativeUIShellComponent } from './components';
export type { NativeUIShellComponent } from './components';

export interface NativeUIShellStatus {
  state: 'web' | 'native' | 'stopped';
  projected: number;
  updates: number;
  reason?: string;
}

export interface VerticalControlAreaOptions {
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
  /** Enables Native UI Shell globally. Defaults to `true`. */
  enabled?: boolean;
  /** Controls eligible for native projection. Omit to enable every control; when present, only `true` controls are enabled. */
  controls?: NativeUIShellControls;
  /** Internal: limit native projection to the Vertical Control Area. */
  verticalBarsOnly?: boolean;
}

export interface NativeUIShellControls {
  /** Projects tab bars and their native search presentation. */
  tabs?: boolean;
  /** Projects toolbar buttons, including back and menu buttons. */
  toolbar?: boolean;
  /** Projects segments. */
  segment?: boolean;
  /** Projects floating action buttons. */
  fab?: boolean;
}

export interface NativeUIShellHandle {
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
  /** Native logical edge reported by the application's device plugin. Null or an unregistered edge uses a Web rail in verticalBarsOnly mode, or the ordinary Native UI Shell layout otherwise. Omission keeps the last supplied value. */
  nativeEdge?: VerticalBarEdge;
}

export interface VerticalControlAreaHandle extends NativeUIShellHandle {
  /** Applies the application's chosen placement to both Web and native controls. */
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

export interface ShellControl extends Frame {
  id: string;
  kind: NativeUIShellComponent;
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
  /** Final projected control bounds in Web viewport CSS pixels, when available. */
  projectionFrame?: Frame;
  /** Native action bounds retained by the Web rail while an overlay is open. */
  projectionFrames?: Record<string, Frame>;
}

export interface WebViewMetrics {
  /** The WebView's effective top-left corner radius in points, or `0` when unavailable. */
  radius: number;
}

export interface NativeUIShellPlugin {
  configure(options?: { verticalBarsOnly?: boolean }): Promise<{ supported: boolean }>;
  getWebViewMetrics(): Promise<WebViewMetrics>;
  update(snapshot: ShellSnapshot): Promise<{ revision: number; rejectedSearches?: string[]; rejectedControls?: string[] }>;
  clear(options: { revision: number }): Promise<void>;
  addListener(name: 'activate', listener: (event: ShellActivation) => void): Promise<PluginListenerHandle>;
  addListener(name: 'search', listener: (event: ShellSearchEvent) => void): Promise<PluginListenerHandle>;
  addListener(name: 'webViewMetricsChange', listener: (event: WebViewMetrics) => void): Promise<PluginListenerHandle>;
}
