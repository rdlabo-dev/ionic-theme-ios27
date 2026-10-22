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
    const scope = [sectionName, toolbar ? toolbars.indexOf(toolbar) : 0];
    const slotOwner = element.closest('ion-buttons') ?? element;
    const slot = control.toolbarSlot ?? slotOwner.getAttribute('slot') ?? (control.kind === 'back-button' ? 'start' : 'end');
    const counts = counters.get(toolbar ?? page) ?? new Map<string, number>();
    counters.set(toolbar ?? page, counts);
    const position = counts.get(slot) ?? 0;
    counts.set(slot, position + 1);
    const explicitSurface =
      element.getAttribute('data-transition-id')?.trim() ||
      (!element.matches('ion-buttons') && control.items.length === 1
        ? candidate.actions.get(control.items[0].id)?.getAttribute('data-transition-id')?.trim()
        : undefined);
    const surfaceId = JSON.stringify(
      explicitSurface ? ['surface-explicit', ...scope, explicitSurface] : ['group', ...scope, slot, position],
    );
    identities.push({
      target: control,
      id: surfaceId,
      fallback: control.id,
    });
    for (const [index, item] of control.items.entries()) {
      const source = candidate.actions.get(item.id);
      const explicit = source?.getAttribute('data-transition-id')?.trim();
      // Child positions belong to their surface. Resizing a group cannot renumber the next one.
      identities.push({
        target: item,
        id: explicit ? JSON.stringify(['explicit', ...scope, explicit]) : JSON.stringify(['auto', surfaceId, index]),
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
};
