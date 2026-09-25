import type { PluginListenerHandle } from '@capacitor/core';

import type { NativeUIShellComponent } from './components';
export type { NativeUIShellComponent } from './components';

export interface NativeUIShellStatus {
  state: 'web' | 'native' | 'stopped';
  projected: number;
  updates: number;
  reason?: string;
}

export interface NativeUIShellOptions {
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

export type VerticalBarEdge = 'left' | 'right' | null;

export interface VerticalBarPlacement {
  edge: VerticalBarEdge;
  /** UIKit safe-area inset on the physical vertical-bar edge, in points. */
  inset: number;
}

export enum HingeStatus {
  Unavailable = 'unavailable',
  Closed = 'closed',
  PartiallyOpen = 'partially-open',
  FullyOpen = 'fully-open',
}

export interface VerticalControlAreaHandle extends NativeUIShellHandle {
  /** Applies the application's chosen placement to both Web and native controls. */
  setPlacement(placement: VerticalBarEdge | VerticalBarPlacement): void;
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
  verticalBarEdge?: Exclude<VerticalBarEdge, null>;
  controls: ShellControl[];
}

export interface ShellActivation {
  revision: number;
  id: string;
  sequence: number;
}

export interface WebViewMetrics {
  /** The WebView's effective top-left corner radius in points, or `0` when unavailable. */
  radius: number;
}

export interface DeviceLayout {
  placement: VerticalBarPlacement;
  hingeStatus: HingeStatus;
  webViewMetrics: WebViewMetrics;
}

export interface NativeUIShellPlugin {
  configure(options?: { verticalBarsOnly?: boolean }): Promise<{ supported: boolean }>;
  getDeviceLayout(): Promise<DeviceLayout>;
  startDeviceLayoutMonitoring(): Promise<void>;
  stopDeviceLayoutMonitoring(): Promise<void>;
  update(snapshot: ShellSnapshot): Promise<{ revision: number; rejectedSearches?: string[]; rejectedControls?: string[] }>;
  clear(options: { revision: number }): Promise<void>;
  addListener(name: 'activate', listener: (event: ShellActivation) => void): Promise<PluginListenerHandle>;
  addListener(name: 'search', listener: (event: ShellSearchEvent) => void): Promise<PluginListenerHandle>;
  addListener(name: 'deviceLayoutChange', listener: (event: DeviceLayout) => void): Promise<PluginListenerHandle>;
}
