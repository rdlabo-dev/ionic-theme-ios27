import { createCandidate, appendItem } from '../shared/candidate';
import type { Candidate, Identify } from '../shared/candidate';
import { childElements, verticalBarsToolbarActions, inFixedToolbar, isVerticalBarsToolbarGroup } from '../shared/dom';
import * as menuButton from './ion-menu-button';

export const tag = 'ion-buttons';
export const tracksMotion = true;

export const read = (element: HTMLElement, id: Identify): Candidate | undefined => {
  if (!inFixedToolbar(element)) return;
  let children = childElements(element);
  if (children.length === 1) return menuButton.read(element, id);
  const verticalBars = !element.closest('ion-menu, ion-modal, ion-popover') && !!element.closest('ion-app.ios-theme-vertical-bars');
  if (verticalBars && !isVerticalBarsToolbarGroup(element)) return;
  if (verticalBars) children = verticalBarsToolbarActions(element);
  if (
    !children.length ||
    children.some(
      (child) =>
        !child.matches(`${menuButton.tag}${verticalBars ? '' : '.ios'}`) &&
        (!child.matches(`ion-button${verticalBars ? '' : '.ios.button-clear'}`) ||
          !(verticalBars ? ['default', 'clear'] : ['clear']).includes((child as HTMLIonButtonElement).fill ?? 'default')),
    )
  )
    return;
  const candidate = createCandidate(element, tag, id);
  if (verticalBars && children.length !== childElements(element).length) candidate.sources = children;
  for (const child of children) {
    const supported = child.matches(menuButton.tag)
      ? menuButton.append(candidate, child as HTMLIonMenuButtonElement, id)
      : appendItem(candidate, child, id);
    if (!supported) return;
  }
  return candidate;
};
