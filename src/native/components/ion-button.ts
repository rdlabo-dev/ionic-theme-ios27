import { createCandidate, appendItem } from '../shared/candidate';
import type { Candidate, Identify } from '../shared/candidate';
import { inFixedToolbar } from '../shared/dom';

export const tag = 'ion-button';

export const read = (element: HTMLElement, id: Identify): Candidate | undefined => {
  const button = element as HTMLIonButtonElement;
  if (!inFixedToolbar(element) || button.fill !== 'default' || button.classList.contains('ion-color')) return;
  const candidate = createCandidate(element, tag, id);
  return appendItem(candidate, element, id) ? candidate : undefined;
};
