import { createSnapshotScope } from '@rdlabo/capacitor-native-ui-kit';
export const snapshotScope = createSnapshotScope('native-ui');
export const { coveredSourcesChanged, imageMarker, snapshotTargetsChanged } = snapshotScope;
export const snapshotMutation = (record: MutationRecord) => {
  if (snapshotScope.snapshotMutation(record)) return true;
  // Ionic clones/proxies copy presentation state without changing the source.
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  return !!target?.closest(`:is(.ion-cloned-element, [data-native-ui-proxy])[${imageMarker}]`);
};
