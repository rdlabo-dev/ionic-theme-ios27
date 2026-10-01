import { iosPopoverEnterAnimation } from '@rdlabo/ionic-theme-utils';
import type { ProjectedClickEvent } from './click';

export const popoverEnterAnimation: typeof iosPopoverEnterAnimation = (baseEl, opts = {}) => {
  const frame = (opts.event as ProjectedClickEvent | undefined)?.projectionFrame;
  if (!frame) return iosPopoverEnterAnimation(baseEl, opts);

  // Give Ionic a real layout reference without changing the source DOM's geometry.
  const anchor = baseEl.ownerDocument.createElement('span');
  anchor.setAttribute('aria-hidden', 'true');
  Object.assign(anchor.style, {
    position: 'fixed',
    pointerEvents: 'none',
    opacity: '0',
    left: `${frame.x}px`,
    top: `${frame.y}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
  });
  const source = opts.trigger ?? opts.event?.target;
  const edge = (opts.event as ProjectedClickEvent).projectionEdge;
  // A default callout below an edge control cannot keep its arrow on the button.
  // Open into the page instead, using the existing side/align positioning API.
  const side = edge && (!opts.side || opts.side === 'bottom') ? (edge === 'left' ? 'right' : 'left') : opts.side;
  const pane = source?.closest?.('.ion-page, ion-content, ion-menu');
  (pane ?? baseEl.ownerDocument.body).append(anchor);
  try {
    // Ionic pages can contain fixed elements; account for their offset in the viewport.
    const placed = anchor.getBoundingClientRect();
    const scaleX = placed.width / frame.width;
    const scaleY = placed.height / frame.height;
    anchor.style.left = `${frame.x + (frame.x - placed.x) / scaleX}px`;
    anchor.style.top = `${frame.y + (frame.y - placed.y) / scaleY}px`;
    anchor.style.width = `${frame.width / scaleX}px`;
    anchor.style.height = `${frame.height / scaleY}px`;
    return iosPopoverEnterAnimation(baseEl, {
      ...opts,
      trigger: anchor,
      side,
      align: side !== opts.side ? 'center' : opts.align,
      verticalOffset: edge && (side === 'left' || side === 'right' || side === 'start' || side === 'end') ? 0 : opts.verticalOffset,
    });
  } finally {
    anchor.remove();
  }
};
