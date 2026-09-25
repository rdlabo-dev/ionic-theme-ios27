import { createCandidate, appendItem } from '../shared/candidate';
import type { Candidate, Identify } from '../shared/candidate';
import { inFixedToolbar, isVerticalBarsSource } from '../shared/dom';

export const tag = 'ion-back-button';

export const read = (element: HTMLElement, id: Identify): Candidate | undefined => {
  const button = element as HTMLIonBackButtonElement;
  if (
    !button.shadowRoot ||
    button.icon !== undefined ||
    button.color !== undefined ||
    (!isVerticalBarsSource(element) && !inFixedToolbar(element))
  )
    return;
  const candidate = createCandidate(element, tag, id);
  const label = button.shadowRoot.querySelector('[part="text"]')?.textContent?.trim() ?? '';
  return appendItem(candidate, element, id, button.shadowRoot, label) ? candidate : undefined;
};
