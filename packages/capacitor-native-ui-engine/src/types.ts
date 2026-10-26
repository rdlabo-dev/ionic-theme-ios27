import type { WebProjectionScope } from './web-projection-scope.js';

/** All wire coordinates are CSS pixels, relative to the Web viewport. */
export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ScrollPlacement {
  id: string;
  reuse?: boolean;
  offsetX: number;
  offsetY: number;
  viewport: Frame;
  clip: Frame;
  contentWidth: number;
  contentHeight: number;
  frame: Frame;
}
/** A source and its native rendering. Kind/placement are opaque layout identity keys. */
export interface WebProjectionSource {
  element: HTMLElement;
  sources?: HTMLElement[];
  scrollElement?: HTMLElement;
  control: Frame & { id: string; kind?: string; placement?: string; dark?: boolean; rtl?: boolean; scroll?: ScrollPlacement };
}
/** Multiple fixed fallback elements sharing one Native capture/cover/restore transaction. */
export interface ScopedWebProjectionSource extends WebProjectionSource {
  scope: WebProjectionScope;
}
export interface PreparedWebProjection {
  token: string;
  parts: (Frame & { ids: string[]; url: string })[];
}
/** Each action carries only the fields required by that phase of handoff. */
export type WebProjectionRequest =
  | { action: 'prepare'; revision: number; viewportWidth: number; ids: string[] }
  | { action: 'cover'; token: string; transient?: boolean }
  | { action: 'restore'; token: string; viewportWidth: number; parts: (Frame & { ids: string[] })[] }
  | { action: 'prepared' | 'painted' | 'restored' | 'release'; token: string }
  | { action: 'reset' };
/** Empty prepare results mean capture is unavailable; a partial capture is never valid. */
export type WebProjectionResult<Request extends WebProjectionRequest> = Request extends { action: 'prepare' }
  ? PreparedWebProjection | { token?: never; parts?: never }
  : Request extends { action: 'cover' | 'restore' }
    ? { shown: boolean }
    : void;
export interface ListenerHandle {
  remove(): Promise<void> | void;
}
/** Implement with the owning plugin's existing ordered transport. No engine plugin registration. */
export interface WebProjectionTransport {
  send<Request extends WebProjectionRequest>(request: Request): Promise<WebProjectionResult<Request>>;
  listen(listener: (event: { active: boolean }) => void): Promise<ListenerHandle>;
}
