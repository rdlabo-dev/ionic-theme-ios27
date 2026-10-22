import type { Candidate } from './candidate';

/** Presentation correspondence only. Action IDs always remain source-specific. */
export const assignToolbarTransitionIds = (candidates: Candidate[]): void => {
  const counters = new Map<Element, Map<string, number>>();
  const identities: { target: { transitionId?: string }; id: string; fallback: string }[] = [];
  for (const candidate of candidates) {
    const { element, control } = candidate;
    if (!['button', 'button-group', 'menu-button', 'back-button'].includes(control.kind)) continue;
    const toolbar = element.closest('ion-toolbar, [role="toolbar"]');
    if (!toolbar && control.placement !== 'vertical-bars') continue;
    const page = element.closest('.ion-page, ion-modal') ?? element.ownerDocument.body;
    const section = toolbar?.closest('ion-header, ion-footer');
    const sectionName = section?.tagName.toLowerCase() ?? 'toolbar';
    const toolbars = Array.from(page.querySelectorAll('ion-toolbar, [role="toolbar"]')).filter(
      (node) => (node.closest('ion-header, ion-footer')?.tagName.toLowerCase() ?? 'toolbar') === sectionName,
    );
    const scope = [control.placement ?? 'element', sectionName, toolbar ? toolbars.indexOf(toolbar) : 0];
    const slotOwner = element.closest('ion-buttons') ?? element;
    const railBack = control.placement === 'vertical-bars' && control.kind === 'back-button';
    const slot = railBack
      ? 'back'
      : (control.toolbarSlot ?? slotOwner.getAttribute('slot') ?? (control.kind === 'back-button' ? 'start' : 'end'));
    const counts = counters.get(toolbar ?? page) ?? new Map<string, number>();
    counters.set(toolbar ?? page, counts);
    const next = (kind: string) => {
      const key = JSON.stringify([slot, kind]);
      const index = counts.get(key) ?? 0;
      counts.set(key, index + 1);
      return index;
    };
    identities.push({ target: control, id: JSON.stringify(['group', ...scope, slot, next('group')]), fallback: control.id });
    for (const item of control.items) {
      const source = candidate.actions.get(item.id);
      const explicit = source?.getAttribute('data-transition-id')?.trim();
      const role = railBack ? 'back' : 'button';
      // Explicit items still occupy a position, so adding an override does not renumber their neighbours.
      const index = next(role);
      identities.push({
        target: item,
        id: explicit ? JSON.stringify(['explicit', ...scope, explicit]) : JSON.stringify(['auto', ...scope, slot, role, index]),
        fallback: item.id,
      });
    }
  }
  const counts = new Map<string, number>();
  for (const { id } of identities) counts.set(id, (counts.get(id) ?? 0) + 1);
  // Ambiguous keys must not merge actions or produce duplicate SwiftUI identities.
  for (const { target, id, fallback } of identities) {
    target.transitionId = counts.get(id) === 1 ? id : JSON.stringify(['unmatched', fallback]);
  }
  // Shared glass is indivisible: retain a horizontal surface only when every
  // item corresponds. Explicit IDs also follow standalone buttons across slots.
  for (const { control } of candidates) {
    if (control.placement !== 'vertical-bars' && control.transitionId) {
      control.transitionId = JSON.stringify(['surface', ...control.items.map((item) => item.transitionId).sort()]);
    }
  }
};
