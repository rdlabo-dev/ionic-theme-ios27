import type { NativeUIShellHandle, NativeUIShellSuspension, ShellControl, ShellSnapshot } from '../../src/native/definitions';

/**
 * State carried by the fake native plugin that `mockNative` installs.
 *
 * The init script intercepts the `window.Capacitor` assignment during
 * `@capacitor/core` initialisation and patches `registerPlugin`, so the app's
 * `registerPlugin<NativeUIShellPlugin>('IonicNativeUIShell')` receives the mock
 * object itself. Specs reach it the same way the application does:
 *
 *   Capacitor.registerPlugin<ShellMock>('IonicNativeUIShell')
 */
export interface ShellMockCore {
  /** update()/clear() snapshots received by the plugin. */
  updates: ShellSnapshot[];
  /** Monotonic sequence counter for emitted events. */
  sequence: number;
  /** Listener registry mirroring Capacitor's WebPlugin semantics. */
  listeners: Record<string, ((event: never) => void)[]>;
  /** Emits a native event to every registered listener. */
  notifyListeners(eventName: string, data: unknown): void;
}

export interface AnimationCall {
  animation: Animation;
  duration: number;
  properties: string[];
  targetClass: string;
  targetTag: string;
}

/** Test probes attached to the demo's <ion-app> element instead of `window`. */
export interface TestAppElement extends HTMLElement {
  nativeUIShell?: NativeUIShellHandle;
  verticalBarsLease?: NativeUIShellSuspension;
  verticalBarsBackButtonReads?: number;
  verticalBarsBackCloneMoved?: boolean;
  fabClicks?: number;
  fabRetired?: boolean;
  menuExtra?: boolean;
  retiredSearchbar?: HTMLIonSearchbarElement;
  searchEvents?: [string, unknown][];
  placement?: {
    element: Element;
    parent: HTMLElement | null;
    next: ChildNode | null;
    slot: string;
    zone: Element;
  };
  searchPlacement?: {
    page: HTMLElement;
    footer: Element;
    fab: Element;
    buttons: Element;
    toolbar: Element;
  };
}

declare global {
  const Capacitor: {
    getPlatform(): string;
    registerPlugin<T>(name: string, implementations?: Record<string, unknown>): T;
    Plugins: Record<string, unknown>;
    [key: string]: unknown;
  };

  interface Window {
    Capacitor?: typeof Capacitor;
    CapacitorCustomPlatform?: { name: string };
  }

  interface Document {
    /** Set by e2e init scripts to force the app into its animation-free mode. */
    IONIC_E2E_TESTING?: boolean;
    __IONIC_ANIMATION_CALLS__?: AnimationCall[];
  }
}
