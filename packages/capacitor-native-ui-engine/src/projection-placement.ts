/** Placement supplied synchronously before a native view returns from a Web image. */
export interface ProjectionPlacementBinding {
  readonly projected: boolean;
  dispose(): void;
}
interface PlacementState {
  projected: boolean;
  owner?: object;
  invalidate(): void;
  measure(): Record<string, unknown>;
}
// The injected runtime and a plugin's bundled helper share the binding.
const placementKey = Symbol.for('capacitor-native-ui-engine.projection-placement');
type PlacementElement = HTMLElement & { [placementKey]?: PlacementState };
export const bindProjectionPlacement = (
  element: HTMLElement,
  measure: () => Record<string, unknown>,
  invalidate: () => void = () => {},
): ProjectionPlacementBinding => {
  const host = element as PlacementElement;
  const state: PlacementState = { projected: false, measure, invalidate };
  host[placementKey] = state;
  return {
    get projected() {
      return host[placementKey] === state && state.projected;
    },
    dispose() {
      if (host[placementKey] === state) delete host[placementKey];
      state.projected = false;
    },
  };
};
export const projectionPlacement = (element: HTMLElement | undefined): PlacementState | undefined =>
  (element as PlacementElement | undefined)?.[placementKey];
