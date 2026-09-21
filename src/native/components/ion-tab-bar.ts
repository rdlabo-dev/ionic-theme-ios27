import { createCandidate, appendItem } from '../shared/candidate';
import type { Candidate, Identify } from '../shared/candidate';

export const tag = 'ion-tab-bar';
export const shadowSelector = 'ion-tab-button';
export const tracksMotion = true;

export const read = (element: HTMLElement, id: Identify): Candidate | undefined => {
  if (element.closest('ion-content')) return;
  if (element.closest('ion-tabs')?.matches('.ionic-theme-adaptive-tabs:is(.ionic-theme-tabs-side-left, .ionic-theme-tabs-side-right)'))
    return;
  const children = Array.from(element.querySelectorAll<HTMLElement>(':scope > ion-tab-button:not(.ion-cloned-element)'));
  if (!children.length) return;
  // Only equal items with Ionic's default layout map to UIKit's adaptive tabs.
  const width = children[0].getBoundingClientRect().width;
  if (
    children.some(
      (child) =>
        ((child as HTMLIonTabButtonElement).layout ?? 'icon-top') !== 'icon-top' ||
        Math.abs(child.getBoundingClientRect().width - width) > 1,
    )
  )
    return undefined;

  const candidate = createCandidate(element, tag, id);
  const style = getComputedStyle(element);
  const rtl = style.direction === 'rtl';
  const position = ['start', 'center', 'end'].find((value) => element.classList.contains(`tab-bar-position-${value}`));
  candidate.control.tabBarAnchor = {
    x: position === 'center' ? 0.5 : position ? ((position === 'start') !== rtl ? 0 : 1) : style.left !== 'auto' ? 0 : 1,
    y: element.slot === 'bottom' ? 1 : 0,
  };

  for (const child of children) {
    const item = appendItem(candidate, child, id);
    if (!item) return;
    const svg = child.querySelector<SVGElement>('svg') ?? child.querySelector('ion-icon')?.shadowRoot?.querySelector<SVGElement>('svg');
    if (svg) {
      item.iconPosition = 'top';
      const color = getComputedStyle(svg).color;
      const shapes = Array.from(svg.querySelectorAll('path, rect, circle, ellipse, line, polygon, polyline'));
      // Only text-colored SVGs follow UIKit selection tint; preserve explicit artwork colors.
      item.iconTemplate =
        shapes.length > 0 &&
        shapes.every((shape) => {
          const paint = getComputedStyle(shape);
          return [paint.fill, paint.stroke].every((value) => value === 'none' || value === color);
        });
    }
  }
  return candidate;
};
