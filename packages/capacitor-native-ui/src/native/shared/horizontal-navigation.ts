import type { Candidate } from './candidate';
import { inFixedToolbar } from './dom';

export const navigationMarker = 'data-native-ui-navigation-source';
export const horizontalToolbar = (candidate: Candidate): boolean =>
  candidate.control.placement !== 'vertical-bars' &&
  ['button', 'button-group', 'back-button', 'menu-button'].includes(candidate.control.kind) &&
  inFixedToolbar(candidate.element);

/** Keep the acknowledged native toolbar while Ionic moves the page underneath it.
 * The destination is committed after playback, never measured in moving coordinates.
 */
export const createHorizontalNavigation = () => {
  let current:
    | {
        scopes: Set<HTMLElement>;
        frozen: Candidate[];
        phase: 'playing' | 'settling' | 'committing';
        masked: Set<HTMLElement>;
        leased: boolean;
      }
    | undefined;
  const clear = () => {
    current?.masked.forEach((element) => element.removeAttribute(navigationMarker));
    current = undefined;
  };
  return {
    get current() {
      return current;
    },
    begin(scopes: HTMLElement[], acknowledged: Candidate[], leased = false) {
      if (current && ((leased && current.leased) || current.phase !== 'playing')) clear();
      if (!current)
        current = {
          scopes: new Set(),
          frozen: acknowledged
            .filter((candidate) => horizontalToolbar(candidate) && scopes.some((scope) => scope.contains(candidate.element)))
            .map((candidate) => ({ ...candidate, icons: [] })),
          phase: 'playing',
          masked: new Set(),
          leased,
        };
      scopes.forEach((scope) => current!.scopes.add(scope));
      current.leased ||= leased;
      return current;
    },
    mask(candidates: Candidate[]) {
      if (!current || current.phase !== 'playing') return;
      for (const candidate of candidates.filter(horizontalToolbar)) {
        // Only hide a destination that already has a retained native counterpart.
        // New controls keep Ionic's entry animation and stay Web until native acknowledges them.
        if (!current.frozen.some((previous) => previous.control.transitionId === candidate.control.transitionId)) continue;
        for (const source of candidate.sources ?? [candidate.element]) {
          source.setAttribute(navigationMarker, '');
          current.masked.add(source);
        }
      }
    },
    measure<T>(read: () => T): T {
      const masked = [...(current?.masked ?? [])];
      masked.forEach((element) => element.removeAttribute(navigationMarker));
      try {
        return read();
      } finally {
        masked.forEach((element) => element.setAttribute(navigationMarker, ''));
      }
    },
    retain(candidates: Candidate[]): Candidate[] {
      if (!current || current.phase === 'committing') return candidates;
      const frozen = new Set(current.frozen.map((candidate) => candidate.element));
      return [
        ...candidates.filter(
          (candidate) =>
            !frozen.has(candidate.element) &&
            !(horizontalToolbar(candidate) && [...current!.scopes].some((scope) => scope.contains(candidate.element))),
        ),
        ...current.frozen,
      ];
    },
    owns(element: HTMLElement): boolean {
      return (
        !!current &&
        (current.frozen.some((candidate) => candidate.element === element || candidate.element.contains(element)) ||
          ([...current.scopes].some((scope) => scope.contains(element)) && inFixedToolbar(element)))
      );
    },
    clear,
  };
};
