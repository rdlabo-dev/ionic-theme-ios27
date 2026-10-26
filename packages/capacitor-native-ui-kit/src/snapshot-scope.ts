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
  return {
    coveredSourcesChanged,
    imageMarker,
    owners,
    visibleOwners,
    snapshotVisible,
    snapshotOwns,
    snapshotMutation,
    snapshotTargets,
    snapshotTargetsChanged,
    preparedOwners,
  };
};
export type SnapshotScope = ReturnType<typeof createSnapshotScope>;
