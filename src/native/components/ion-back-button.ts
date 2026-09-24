import { createCandidate, appendItem } from '../shared/candidate.js';
import type { Candidate, Identify } from '../shared/candidate.js';
import { inFixedToolbar } from '../shared/dom.js';

export const tag = 'ion-back-button';

export const read = (element: HTMLElement, id: Identify): Candidate | undefined => {
  const button = element as HTMLIonBackButtonElement;
  if (!inFixedToolbar(element) || button.icon !== undefined || button.color !== undefined || !button.shadowRoot) return;
  const candidate = createCandidate(element, tag, id);
  const label = button.shadowRoot.querySelector('[part="text"]')?.textContent?.trim() ?? '';
  return appendItem(candidate, element, id, button.shadowRoot, label) ? candidate : undefined;
};
