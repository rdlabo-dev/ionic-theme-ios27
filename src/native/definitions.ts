import type { PluginListenerHandle } from '@capacitor/core';

import type { NativeUIShellComponent } from './components';
export type { NativeUIShellComponent } from './components';

export interface NativeUIShellStatus {
  state: 'web' | 'native' | 'stopped';
  projected: number;
  updates: number;
  reason?: string;
}

export interface NativeUIShellHandle {
  getStatus(): NativeUIShellStatus;
  destroy(): Promise<void>;
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

export interface NativeUIShellPlugin {
  /** Reads geometry derived from the current native WebView. Unsupported iOS versions return a zero radius. */
  getWebViewMetrics(): Promise<WebViewMetrics>;
  /** Listens for metrics refreshed after orientation changes or when the app becomes active. */
  addListener(name: 'webViewMetricsChange', listener: (event: WebViewMetrics) => void): Promise<PluginListenerHandle>;
}

/** Internal bridge contract used to synchronize projected Ionic controls. */
export interface NativeUIShellBridgePlugin extends NativeUIShellPlugin {
  configure(): Promise<{ supported: boolean }>;
  /** Applies a complete, revisioned snapshot of supported Ionic controls. */
  update(snapshot: ShellSnapshot): Promise<{ revision: number; rejectedSearches?: string[]; rejectedControls?: string[] }>;
  /** Removes projected native controls through the supplied revision. */
  clear(options: { revision: number }): Promise<void>;
  /** Listens for activation of a projected native control. */
  addListener(name: 'activate', listener: (event: ShellActivation) => void): Promise<PluginListenerHandle>;
  /** Listens for edits and lifecycle changes from a projected native search field. */
  addListener(name: 'search', listener: (event: ShellSearchEvent) => void): Promise<PluginListenerHandle>;
  addListener(name: 'webViewMetricsChange', listener: (event: WebViewMetrics) => void): Promise<PluginListenerHandle>;
}
