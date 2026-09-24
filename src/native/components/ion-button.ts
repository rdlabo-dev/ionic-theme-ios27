import { createCandidate, appendItem } from '../shared/candidate';
import type { Candidate, Identify } from '../shared/candidate';
import { inFixedToolbar, isFoldableToolbarAction, isFoldableToolbarGroup } from '../shared/dom';

export const tag = 'ion-button';

export const read = (element: HTMLElement, id: Identify): Candidate | undefined => {
  const button = element as HTMLIonButtonElement;
  const foldable =
    !element.closest('ion-menu, ion-modal, ion-popover') && !!element.closest(':is(ion-app, body).ios-theme-enable-foldable');
  if (foldable && element.parentElement && isFoldableToolbarGroup(element.parentElement)) return;
  const fill = button.fill ?? 'default';
  if (
    !inFixedToolbar(element) ||
    (foldable && !isFoldableToolbarAction(element)) ||
    (!foldable && fill !== 'default') ||
    (foldable && !['default', 'clear'].includes(fill)) ||
    button.classList.contains('ion-color')
  )
    return;
  const candidate = createCandidate(element, tag, id);
  return appendItem(candidate, element, id) ? candidate : undefined;
};
