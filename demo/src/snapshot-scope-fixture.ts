import { vi } from 'vitest';
import type { NativeUIProjectionState } from '../../packages/capacitor-native-ui/src/native/shared/covered-source';

/** Projection tests supply the read-only state they consume, not the engine's internals. */
export const mockSnapshotOwnership = (scope: NativeUIProjectionState) => {
  const owners = new Set<HTMLElement>();
  const visibleOwners = new Set<HTMLElement>();
  const preparedOwners = new Set<HTMLElement>();
  vi.spyOn(scope, 'owners', 'get').mockImplementation(() => [...owners]);
  vi.spyOn(scope, 'visibleOwners', 'get').mockImplementation(() => [...visibleOwners]);
  vi.spyOn(scope, 'preparedOwners', 'get').mockImplementation(() => [...preparedOwners]);
  vi.spyOn(scope, 'owns').mockImplementation((element) => [...owners].some((owner) => owner === element || owner.contains(element)));
  vi.spyOn(scope, 'isVisible').mockImplementation((element) =>
    [...visibleOwners].some((owner) => owner === element || owner.contains(element)),
  );
  return { owners, visibleOwners, preparedOwners };
};
