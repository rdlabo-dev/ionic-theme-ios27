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

export interface ShellItem extends Frame {
  id: string;
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  selected: boolean;
  fontSize: number;
  fontWeight: number;
  color: string;
  badge?: string;
  icon?: string;
  iconWidth?: number;
  iconHeight?: number;
  iconPosition?: 'leading' | 'trailing' | 'top';
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
  viewportWidth: number;
  controls: ShellControl[];
}

export interface ShellActivation {
  revision: number;
  id: string;
  sequence: number;
}

export interface NativeUIShellPlugin {
  configure(): Promise<{ supported: boolean }>;
  update(snapshot: ShellSnapshot): Promise<{ revision: number; rejectedSearches?: string[]; rejectedControls?: string[] }>;
  clear(options: { revision: number }): Promise<void>;
  addListener(name: 'activate', listener: (event: ShellActivation) => void): Promise<PluginListenerHandle>;
  addListener(name: 'search', listener: (event: ShellSearchEvent) => void): Promise<PluginListenerHandle>;
}
