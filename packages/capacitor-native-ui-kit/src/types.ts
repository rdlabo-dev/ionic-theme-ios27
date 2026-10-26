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
export interface SnapshotSource {
  element: HTMLElement;
  sources?: HTMLElement[];
  scrollElement?: HTMLElement;
  control: Frame & { id: string; kind?: string; placement?: string; dark?: boolean; rtl?: boolean; scroll?: ScrollPlacement };
}
export interface PreparedSnapshot {
  token: string;
  parts: (Frame & { ids: string[]; url: string })[];
}
export interface SnapshotRequest {
  action: 'prepare' | 'cover' | 'painted' | 'restore' | 'restored' | 'release' | 'reset';
  transient?: boolean;
  parts?: (Frame & { ids: string[] })[];
  revision?: number;
  viewportWidth?: number;
  ids?: string[];
  token?: string;
}
export interface ListenerHandle {
  remove(): Promise<void> | void;
}
/** Implement with the owning plugin's existing ordered transport. No kit plugin registration. */
export interface SnapshotTransport {
  send(request: SnapshotRequest): Promise<Partial<PreparedSnapshot> & { shown?: boolean }>;
  listen(listener: (event: { active: boolean }) => void): Promise<ListenerHandle>;
  resolveURL(fileURL: string): string;
}
