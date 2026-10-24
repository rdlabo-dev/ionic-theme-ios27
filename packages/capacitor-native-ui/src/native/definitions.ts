import type { NativeUIExtension } from './extensions';
import type { PluginListenerHandle } from '@capacitor/core';

export type NativeUIComponent =
  | 'ion-button'
  | 'ion-buttons'
  | 'ion-back-button'
  | 'ion-menu-button'
  | 'ion-tab-bar'
  | 'ion-segment'
  | 'ion-fab';

export interface NativeUIStatus {
  state: 'web' | 'native' | 'stopped';
  projected: number;
  updates: number;
  reason?: string;
}

/** Default selection in ordinary (horizontal) or rail (vertical) placement.
 * Explicit source settings override these defaults. This does not choose placement.
 */
export type ControlProjection = boolean | 'horizontalOnly' | 'verticalOnly';

export interface NativeUIControls {
  /** Group selected ordinary buttons. Does not select children or include back buttons. */
  buttonGroup?: ControlProjection;
  /** Select ordinary actions, including menu buttons. */
  button?: ControlProjection;
  backButton?: ControlProjection;
  tabs?: ControlProjection;
  segment?: ControlProjection;
  fab?: ControlProjection;
}

export interface IonicProjectionOptions {
  /** Discover supported Ionic controls automatically. Explicit sources remain independent. Defaults to true. */
  auto?: boolean;
  verticalBars?: {
    /** Native appearance of vertical Ionic buttons. Local source settings take precedence. Defaults to system. */
    buttonProjection?: 'system' | 'source';
    /** Source-style standalone ion-button default; ion-buttons still defaults to clear. Defaults to glass. */
    buttonDefaultFill?: 'glass' | 'solid';
    /** Relay Ionic popovers anchored to native rail buttons. Defaults to false. */
    popover?: boolean;
  };
}

export interface NativeUIOptions {
  /** Connected source subtree. Defaults to document.body. */
  root?: HTMLElement;
  /** Default selection and grouping. Scalars apply to every kind; omitted fields default to true. */
  controls?: ControlProjection | NativeUIControls;
  verticalBars?: NativeUIVerticalBarsOptions;
  /** App-local projection definitions, independent of controls.
   * @experimental API and behavior may change.
   */
  extensions?: readonly NativeUIExtension[];
  ionic?: IonicProjectionOptions;
  /** Log Web fallback reasons. Defaults to false. */
  debug?: boolean;
}

/** Options for the standalone rail entry. */
export type VerticalControlAreaOptions = NativeUIOptions;

/** @internal Resolved adapter state; not an application configuration API. */
export interface NativeUIRuntimeOptions extends NativeUIOptions {
  source?: 'ionic' | 'html' | 'auto' | 'extensions';
  nativeState?: { edge?: 'left' | 'right' };
  unavailableExtensions?: ReadonlyMap<string, string>;
  rail?: { host: HTMLElement; edge: 'left' | 'right' };
}

/** A running shell. Placement changes preserve all other startup settings. */
export interface NativeUIHandle extends NativeUIRuntimeHandle {
  /** Enable rail projection when available, preserving other settings. Rejects after destroy. */
  enableVerticalControlArea(): Promise<void>;
  /** Restore rail sources to the Web without stopping ordinary native controls. Rejects after destroy. */
  disableVerticalControlArea(): Promise<void>;
}

export interface NativeUIVerticalBarsOptions {
  /** Defaults to true. Availability is always determined separately. */
  enabled?: boolean;
  /** Placement preference, not a declaration of device capability. */
  placement?: { edge: Exclude<VerticalBarEdge, null>; webHost?: HTMLElement };
}

export interface NativeUIRuntimeHandle {
  /** Schedule a source recheck. Calls coalesce; unchanged snapshots are not sent. No-op after destroy or without a runtime. */
  markForCheck(): void;
  /** Returns the current Web/native projection state. */
  getStatus(): NativeUIStatus;
  /** Restores projected controls to the Web until the returned lease is resumed. */
  suspend(): Promise<NativeUISuspension>;
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

export interface VerticalControlAreaHandle extends NativeUIHandle {
  /** Legacy Web CSS adapter. Use the theme setVerticalBarsLayout helper instead.
   * @deprecated Web layout belongs to the theme or application.
   */
  setPlacement(placement: VerticalBarEdge | VerticalBarPlacement, rtl?: boolean): void;
}

export interface NativeUISuspension {
  /** Releases this suspension. Native projection resumes after all active suspensions are released. */
  resume(): Promise<void>;
}

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Measured native rail surface, in Web viewport pixels. */
export interface NativeUIVerticalBarFrame extends Frame {
  /** Optional for compatibility with older native binaries. */
  cornerRadius?: number;
}

export interface NativeUIBadge {
  value: string;
  color: string;
  textColor: string;
}

export interface NativeUIItem extends Frame {
  id: string;
  /** Toolbar presentation identity; never used to dispatch an action. */
  transitionId?: string;
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
  badge?: NativeUIBadge;
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

export interface NativeUIControl extends Frame {
  id: string;
  /** Stable toolbar group identity, independent of the source control ID. */
  transitionId?: string;
  kind: NativeUIControlKind | 'extension';
  extension?: { name: string; props: string; actions: Record<string, string>; tabBarId?: string };
  /** Lets the native host own adaptive placement instead of mirroring the DOM frame. */
  placement?: 'vertical-bars';
  /** Logical Ionic toolbar slot, preserved when projecting to the vertical rail. */
  toolbarSlot?: 'start' | 'end';
  items: NativeUIItem[];
  dark: boolean;
  rtl: boolean;
  /** Applied selection tint for native tabs; other tab appearance remains system-owned. */
  tabTint?: string;
  tabBarAnchor?: { x: 0 | 0.5 | 1; y: 0 | 1 };
  search?: NativeUISearch;
}

export interface NativeUISearch {
  id: string;
  field: NativeUIItem;
  trigger: NativeUIItem;
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

export interface NativeUISearchEvent extends NativeUIActivation {
  valueVersion: number;
  phase: 'input' | 'focus' | 'blur' | 'clear' | 'commit';
  value: string;
  composing: boolean;
}

export interface NativeUISnapshot {
  revision: number;
  transitionDuration?: number;
  /** Prepared native toolbar endpoints, controlled by the page animation clock. */
  toolbarTransition?: { id: number; sourceIds: string[]; destination: NativeUIControl[] };
  viewportWidth: number;
  /** Physical side the native rail is drawn on; the runtime resolves the logical edge through the document direction. */
  verticalBarEdge?: 'left' | 'right';
  /** Visible foreground modal bounds; omitted for the full page. */
  verticalBarFrame?: Frame;
  modalAnimation?: import('./shared/modal-animation').ModalAnimation;
  /** Web-owned page identities, from root through the active rail destination. */
  verticalBarNavigation?: string[];
  /** Keep the current native rail until an interactive navigation settles. */
  verticalBarNavigationPhase?: 'tracking' | 'settling';
  controls: NativeUIControl[];
}

export interface NativeUIActivation {
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

/** @internal Native ownership snapshot; reading it never performs layout. */
export interface NativeUIConnectionState {
  session: string;
  revision: number;
  sequence: number;
  listeners: string[];
  surfaces: { horizontal: boolean; vertical: boolean };
  overlay?: { id: string; state: 'presented' | 'dismissed' | 'missing' };
}

export interface NativeUIPlugin {
  configure(options?: {
    suppressScrollEdgeEffect?: boolean;
  }): Promise<{ supported: boolean; extensions?: string[]; modalAnimation?: boolean; connectionState?: boolean }>;
  completeExtensionAction(options: { requestId: string; accepted: boolean }): Promise<void>;
  getWebViewMetrics(): Promise<WebViewMetrics>;
  getVerticalBarsGeometry(options: {
    viewportWidth: number;
    ids: string[];
  }): Promise<{ revision?: number; items: Record<string, NativeUIVerticalBarFrame> }>;
  prepareOverlay(options: { id: string }): Promise<void>;
  presentOverlay(options: { id: string; presentation?: NativeUIPopoverPresentation }): Promise<void>;
  getConnectionState(): Promise<NativeUIConnectionState>;
  dismissOverlay(options: { id: string; animated: boolean }): Promise<void>;
  closeOverlay(options: { id: string }): Promise<void>;
  stopOverlays(): Promise<void>;
  update(snapshot: NativeUISnapshot): Promise<{
    revision: number;
    rejectedSearches?: string[];
    rejectedControls?: string[];
    tabBarWidths?: Record<string, number>;
    toolbarTransition?: number;
  }>;
  setToolbarTransitionProgress(options: { id: number; progress: number }): Promise<void>;
  clear(options: { revision: number }): Promise<void>;
  addListener(name: 'activate', listener: (event: NativeUIActivation) => void): Promise<PluginListenerHandle>;
  addListener(name: 'search', listener: (event: NativeUISearchEvent) => void): Promise<PluginListenerHandle>;
  addListener(name: 'webViewMetricsChange', listener: (event: WebViewMetrics) => void): Promise<PluginListenerHandle>;
  addListener(name: 'overlay', listener: (event: NativeUIOverlayEvent) => void): Promise<PluginListenerHandle>;
}

export interface NativeUIPopoverPresentation {
  kind: 'popover';
  animated: boolean;
  dark: boolean;
  anchorId: string;
  width: number;
  height: number;
  backgroundColor: string;
  backdropDismiss: boolean;
}

export interface NativeUIOverlayEvent {
  id: string;
  action: 'dismiss';
}
