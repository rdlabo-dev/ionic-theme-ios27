interface SnapshotState {
  owners: Set<HTMLElement>;
  visibleOwners: Set<HTMLElement>;
  preparedOwners: Set<HTMLElement>;
}
const states = new WeakMap<SnapshotScope, SnapshotState>();
/** Internal to the kit; deliberately not exported from its public entry point. */
export const snapshotState = (scope: SnapshotScope): SnapshotState => {
  const state = states.get(scope);
  if (!state) throw new Error('Use createSnapshotScope to create a snapshot scope');
  return state;
};

/** One scope per plugin instance; share it between that plugin's presentation surfaces. */
export const createSnapshotScope = (namespace: string) => {
  const coveredSourcesChanged = `${namespace}:sources-change`;
  const imageMarker = 'data-native-ui-snapshot';
  const owners = new Set<HTMLElement>();
  // Keep the rendered image steady while Native is being recreated underneath it.
  const visibleOwners = new Set<HTMLElement>();
  const snapshotVisible = (element: HTMLElement) => Array.from(visibleOwners).some((owner) => owner === element || owner.contains(element));
  const snapshotOwns = (element: HTMLElement) => Array.from(owners).some((owner) => owner === element || owner.contains(element));
  const snapshotMutation = (record: MutationRecord) => {
    // Rendering a prepared clone does not change the source's Native appearance.
    const target = record.target instanceof Element ? record.target : record.target.parentElement;
    if (target?.closest('[data-native-ui-snapshot-layer]')) return true;
    if (
      record.type === 'attributes' &&
      [imageMarker, 'data-native-ui-snapshot-prepared', 'data-native-ui-snapshot-source', 'data-native-ui-snapshot-visible'].includes(
        record.attributeName ?? '',
      )
    )
      return true;
    const image = (node: Node) =>
      node instanceof Element &&
      node.matches(
        `style[${imageMarker}], style[data-native-ui-snapshot-base], [data-native-ui-snapshot-layer], [data-native-ui-snapshot-prepared]`,
      );
    const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
    return image(record.target) || (record.type === 'childList' && nodes.length > 0 && nodes.every(image));
  };

  const snapshotTargets = new WeakMap<HTMLElement, HTMLElement>();
  const snapshotTargetsChanged = `${namespace}:targets-change`;

  const preparedOwners = new Set<HTMLElement>();
  const scope = {
    coveredSourcesChanged,
    imageMarker,
    get owners(): readonly HTMLElement[] {
      return [...owners];
    },
    get visibleOwners(): readonly HTMLElement[] {
      return [...visibleOwners];
    },
    snapshotVisible,
    snapshotOwns,
    snapshotMutation,
    getTarget: (source: HTMLElement) => snapshotTargets.get(source),
    setTarget: (source: HTMLElement, target: HTMLElement) => {
      snapshotTargets.set(source, target);
    },
    deleteTarget: (source: HTMLElement) => snapshotTargets.delete(source),
    snapshotTargetsChanged,
    get preparedOwners(): readonly HTMLElement[] {
      return [...preparedOwners];
    },
  };
  states.set(scope, { owners, visibleOwners, preparedOwners });
  return scope;
};
export type SnapshotScope = ReturnType<typeof createSnapshotScope>;
