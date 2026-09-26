import { createCandidate, appendItem } from '../shared/candidate';
import type { Candidate, Identify } from '../shared/candidate';
import { childElements, inFixedToolbar } from '../shared/dom';

export const tag = 'ion-menu-button';
// The glass and projection ownership belong to ion-buttons, even for one menu button.
export const selector = '';
export const shadowSelector = tag;

export const append = (candidate: Candidate, button: HTMLIonMenuButtonElement, id: Identify): boolean => {
  if (button.type !== 'button') return false;
  const content = !button.shadowRoot?.querySelector('slot')?.assignedNodes().length ? button.shadowRoot : button;
  return !!content && !!appendItem(candidate, button, id, content);
};

export const read = (group: HTMLElement, id: Identify): Candidate | undefined => {
  const children = group.matches('ion-buttons') ? childElements(group) : [];
  if (!inFixedToolbar(group) || children.length !== 1) return;
  const button = children[0];
  if (!button?.matches(`${tag}${group.closest('ion-app.ios-theme-vertical-bars') ? '' : '.ios'}`)) return;
  const candidate = createCandidate(group, tag, id);
  return append(candidate, button as HTMLIonMenuButtonElement, id) ? candidate : undefined;
};
