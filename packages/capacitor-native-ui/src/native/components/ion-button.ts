import type { VerticalControlAreaOptions } from '../definitions';
import { modalUsesVerticalBars } from '../shared/modal';
import { createCandidate, appendItem } from '../shared/candidate';
import type { Candidate, Identify } from '../shared/candidate';
import { inFixedToolbar, isVerticalBarsToolbarAction, isVerticalBarsToolbarGroup } from '../shared/dom';

export const tag = 'ion-button';

export const read = (element: HTMLElement, id: Identify, options: VerticalControlAreaOptions = {}): Candidate | undefined => {
  const button = element as HTMLIonButtonElement;
  const verticalBars =
    !element.closest('ion-menu, ion-popover') && modalUsesVerticalBars(element) && !!element.closest('ion-app.ios-theme-vertical-bars');
  if (verticalBars && element.parentElement && isVerticalBarsToolbarGroup(element.parentElement)) return;
  const fill = button.fill ?? 'default';
  if (
    !inFixedToolbar(element) ||
    (verticalBars && !isVerticalBarsToolbarAction(element)) ||
    (!verticalBars && fill !== 'default') ||
    (!verticalBars && button.classList.contains('ion-color'))
  )
    return;
  const candidate = createCandidate(element, tag, id, options);
  return appendItem(candidate, element, id) ? candidate : undefined;
};
