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
  const pane = source?.closest?.('.ion-page, ion-content, ion-menu');
  (pane ?? baseEl.ownerDocument.body).append(anchor);
  try {
    // Ionic pages can contain fixed elements; account for their offset in the viewport.
    const placed = anchor.getBoundingClientRect();
    anchor.style.left = `${frame.x + (frame.x - placed.x)}px`;
    anchor.style.top = `${frame.y + (frame.y - placed.y)}px`;
    return iosPopoverEnterAnimation(baseEl, { ...opts, trigger: anchor });
  } finally {
    anchor.remove();
  }
};
