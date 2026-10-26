import { createSnapshotScope } from '@rdlabo/capacitor-native-ui-kit';
export const snapshotScope = createSnapshotScope('native-ui');
export const { coveredSourcesChanged, imageMarker, owners, visibleOwners, preparedOwners, snapshotTargets, snapshotTargetsChanged } =
  snapshotScope;
// Keep the rendered image steady while Native is being recreated underneath it.
export const snapshotVisible = (element: HTMLElement) =>
  Array.from(visibleOwners).some((owner) => owner === element || owner.contains(element));
export const snapshotOwns = (element: HTMLElement) => Array.from(owners).some((owner) => owner === element || owner.contains(element));
export const snapshotMutation = (record: MutationRecord) => {
  // Rendering a prepared clone does not change the source's Native appearance.
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  if (target?.closest(`:is(.ion-cloned-element, [data-native-ui-proxy])[${imageMarker}], [data-native-ui-snapshot-layer]`)) return true;
  if (
    record.type === 'attributes' &&
    [imageMarker, 'data-native-ui-snapshot-prepared', 'data-native-ui-snapshot-source', 'data-native-ui-snapshot-visible'].includes(
      record.attributeName ?? '',
    )
  )
    return true;
  const image = (node: Node) =>
    node instanceof Element &&
    node.matches(`style[${imageMarker}], [data-native-ui-snapshot-layer], [data-native-ui-proxy][data-native-ui-snapshot-prepared]`);
  const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
  return image(record.target) || (record.type === 'childList' && nodes.length > 0 && nodes.every(image));
};
