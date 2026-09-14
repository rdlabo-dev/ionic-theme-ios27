import { createCandidate, appendItem } from '../shared/candidate';
import type { Candidate, Identify } from '../shared/candidate';
import { inFixedToolbar } from '../shared/dom';
import * as menuButton from './ion-menu-button';

export const tag = 'ion-buttons';
export const tracksMotion = true;

export const read = (element: HTMLElement, id: Identify): Candidate | undefined => {
  if (!inFixedToolbar(element)) return;
  const children = Array.from(element.children) as HTMLElement[];
  if (children.length === 1) return menuButton.read(element, id);
  if (
    !children.length ||
    children.some(
      (child) =>
        !child.matches(`${menuButton.tag}.ios`) &&
        (!child.matches('ion-button.ios.button-clear') || (child as HTMLIonButtonElement).fill !== 'clear'),
    )
  )
    return;
  const candidate = createCandidate(element, tag, id);
  for (const child of children) {
    const supported = child.matches(menuButton.tag)
      ? menuButton.append(candidate, child as HTMLIonMenuButtonElement, id)
      : appendItem(candidate, child, id);
    if (!supported) return;
  }
  return candidate;
};
