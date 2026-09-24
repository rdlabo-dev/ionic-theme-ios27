import * as button from './ion-button';
import * as buttons from './ion-buttons';
import * as backButton from './ion-back-button';
import * as menuButton from './ion-menu-button';
import * as tabBar from './ion-tab-bar';
import * as segment from './ion-segment';
import * as fab from './ion-fab';
import { isDisabledButtonGroupChild, isVerticalBarsSource, visible } from '../shared/dom';
import type { Candidate, Identify } from '../shared/candidate';

// Static composition only. Each component declares its own tag, discovery and reader.
export const components = [button, buttons, backButton, menuButton, tabBar, segment, fab] as const;
export type NativeUIShellComponent = (typeof components)[number]['tag'];
export const selector = components
  .map((component) => ('selector' in component ? component.selector : component.tag))
  .filter(Boolean)
  .join(', ');
export const shadowSelector = [
  'ion-icon',
  ...components.flatMap((component) => ('shadowSelector' in component ? [component.shadowSelector] : [])),
].join(', ');
export const motionSelector = [
  '.ion-page',
  'ion-header',
  'ion-footer',
  'ion-toolbar',
  ...components.filter((component) => 'tracksMotion' in component && component.tracksMotion).map((component) => component.tag),
].join(', ');

export const isVerticalBarsCandidate = isVerticalBarsSource;

export const readCandidate = (element: HTMLElement, id: Identify): Candidate | undefined => {
  const verticalBars = isVerticalBarsCandidate(element);
  if (
    (!element.classList.contains('ios') && !(verticalBars && element.matches('ion-back-button'))) ||
    !visible(element, verticalBars) ||
    element.closest('ion-modal, ion-popover')
  )
    return;
  const style = getComputedStyle(element);
  if (
    !isDisabledButtonGroupChild(element) &&
    !style.getPropertyValue('--ios-theme-glass-background-rgb').trim() &&
    !style.getPropertyValue('--ios26-glass-background-rgb').trim() &&
    !verticalBars
  )
    return;
  if (element.contains(element.ownerDocument.activeElement)) return;
  return components.find((component) => component.tag === element.localName)?.read(element, id);
};
