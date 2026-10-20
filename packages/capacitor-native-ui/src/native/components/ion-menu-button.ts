import { horizontalSelected, horizontalToolbarGroup, inVerticalToolbarLayout } from '../shared/toolbar-options';
import { createCandidate, appendItem } from '../shared/candidate';
import type { Candidate, Identify } from '../shared/candidate';
import type { VerticalControlAreaOptions } from '../definitions';
import { childElements, inFixedToolbar, isVerticalBarsToolbarAction, isVerticalBarsToolbarGroup } from '../shared/dom';

export const tag = 'ion-menu-button';
// Horizontal menu buttons belong to ion-buttons; vertical actions can opt out of grouping.
export const selector = tag;
export const shadowSelector = tag;

export const append = (candidate: Candidate, button: HTMLIonMenuButtonElement, id: Identify): boolean => {
  if (button.type !== 'button') return false;
  const content = !button.shadowRoot?.querySelector('slot')?.assignedNodes().length ? button.shadowRoot : button;
  return !!content && !!appendItem(candidate, button, id, content);
};

export const read = (group: HTMLElement, id: Identify, options: VerticalControlAreaOptions = {}): Candidate | undefined => {
  if (group.matches(tag)) {
    if (!inFixedToolbar(group)) return;
    if (inVerticalToolbarLayout(group)) {
      if (!isVerticalBarsToolbarAction(group)) return;
      if (group.parentElement && isVerticalBarsToolbarGroup(group.parentElement)) return;
    } else {
      if (!horizontalSelected(group, options) || !group.parentElement?.matches('ion-buttons')) return;
      if (horizontalToolbarGroup(group.parentElement, options)) return;
    }
    const candidate = createCandidate(group, tag, id, options);
    return append(candidate, group as HTMLIonMenuButtonElement, id) ? candidate : undefined;
  }
  const children = group.matches('ion-buttons') ? childElements(group) : [];
  if (!inFixedToolbar(group) || children.length !== 1) return;
  const button = children[0];
  if (!button?.matches(`${tag}${group.closest('ion-app.ios-theme-vertical-bars') ? '' : '.ios'}`)) return;
  const candidate = createCandidate(group, tag, id, options);
  return append(candidate, button as HTMLIonMenuButtonElement, id) ? candidate : undefined;
};
