export interface FoldState {
  state: 'flat' | 'half-opened' | 'closed';
  hingeBounds?: { x: number; y: number; width: number; height: number };
}
