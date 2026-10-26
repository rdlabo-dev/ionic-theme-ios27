export * from './types.js';
export * from './geometry.js';
export * from './scroll-placement.js';
export { createWebProjectionScope, type WebProjectionScope } from './web-projection-scope.js';
export * from './web-projection.js';
export * from './scroll-bindings.js';
export type { ProjectionEvents, ProjectionDestination } from './projection-events.js';
export { getOverlayCoordinator, usesOverlayBackdrop, type OverlayChange, type OverlayOptions } from './overlays.js';
export { getUnprojectedVisibility } from './visibility.js';

export { bindProjectionPlacement, type ProjectionPlacementBinding } from './projection-placement.js';
