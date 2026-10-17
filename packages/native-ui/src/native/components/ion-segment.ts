import { createCandidate, appendItem } from '../shared/candidate';
import type { Candidate, Identify } from '../shared/candidate';
import { inFixedToolbar } from '../shared/dom';

export const tag = 'ion-segment';
export const shadowSelector = 'ion-segment-button';
export const tracksMotion = true;

export const read = (element: HTMLElement, id: Identify): Candidate | undefined => {
  const segment = element as HTMLIonSegmentElement;
  if (
    !inFixedToolbar(element) ||
    segment.scrollable ||
    element.classList.contains('segment-expand') ||
    element.querySelector('ion-segment-button[content-id]')
  )
    return;
  const children = Array.from(element.querySelectorAll<HTMLIonSegmentButtonElement>(':scope > ion-segment-button'));
  if (!children.length) return;
  const candidate = createCandidate(element, tag, id);
  for (const child of children) {
    const item = appendItem(candidate, child, id);
    if (!item || (item.label && item.iconWidth)) return;
    item.selected = segment.value === child.value;
  }
  return candidate;
};
