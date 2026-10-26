import { createWebProjectionScope } from '@rdlabo/capacitor-native-ui-kit';
export const projectionScope = createWebProjectionScope('native-ui');
export const { sourcesChangedEvent, imageMarker, targetsChangedEvent } = projectionScope;
export const isProjectionMutation = (record: MutationRecord) => {
  if (projectionScope.isProjectionMutation(record)) return true;
  // Ionic clones/proxies copy presentation state without changing the source.
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  return !!target?.closest(`:is(.ion-cloned-element, [data-native-ui-proxy])[${imageMarker}]`);
};
