import type { Frame } from '../native/definitions';

/** Position of the visible projection, in Web viewport CSS pixels. */
export interface ProjectedClickEvent extends MouseEvent {
  readonly projectionFrame: Frame;
}

export const projectedClick = (target: HTMLElement, frame: Frame): void => {
  if (target.matches(':disabled')) return;
  const win = target.ownerDocument.defaultView!;
  const event = new win.MouseEvent('click', {
    bubbles: true,
    composed: true,
    cancelable: true,
    clientX: frame.x + frame.width / 2,
    clientY: frame.y + frame.height / 2,
  });
  Object.defineProperty(event, 'projectionFrame', { value: frame });
  target.dispatchEvent(event);
};
