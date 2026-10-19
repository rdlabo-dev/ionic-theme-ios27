import { close } from 'ionicons/icons';

/** Keep the application's original dismissal handler for the focused search layout. */
export const addSearchDismissButton = (footer: HTMLElement): void => {
  if (footer.querySelector('.ios-theme-searchable-dismiss')) return;
  const original = footer.querySelector<HTMLElement>('ion-buttons[slot=start] ion-button');
  if (!original) return;
  const buttons = footer.ownerDocument.createElement('ion-buttons');
  buttons.slot = 'end';
  // Remain hidden when the full theme is absent or opted out.
  buttons.style.display = 'none';
  buttons.classList.add('ios-theme-searchable-dismiss', 'ios-theme-horizontal-only');
  const button = footer.ownerDocument.createElement('ion-button');
  button.fill = 'default';
  button.type = 'button';
  button.setAttribute('aria-label', original.getAttribute('aria-label') ?? 'Close');
  // WebKit can blur the field between pointerup and click despite preventDefault.
  // Complete pointer activation on release before blur can remove the button.
  const doc = footer.ownerDocument;
  let pointer: number | undefined;
  let pointerTarget: HTMLElement | undefined;
  const actionTarget = (event: Event): HTMLElement | undefined => {
    const target = event.target instanceof Element ? event.target : undefined;
    if (target?.closest('ion-button') === button) return button;
    const clear = target?.closest<HTMLElement>('ion-searchbar .searchbar-clear-button');
    return clear && footer.contains(clear) ? clear : undefined;
  };
  const syncEditing = () => {
    if (!footer.contains(doc.activeElement)) footer.classList.remove('ios-theme-searchable-editing');
  };
  const releasePointer = () => {
    pointer = undefined;
    pointerTarget = undefined;
    doc.removeEventListener('pointerup', finishPointer, true);
    doc.removeEventListener('pointercancel', cancelPointer, true);
    doc.defaultView?.removeEventListener('blur', releasePointer);
    syncEditing();
  };
  const finishPointer = (event: PointerEvent) => {
    if (event.pointerId !== pointer || !pointerTarget) return;
    const target = pointerTarget;
    const rect = target.getBoundingClientRect();
    const inside =
      rect.width > 0 &&
      rect.height > 0 &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    releasePointer();
    if (inside) (target === button ? original : target).click();
  };
  const cancelPointer = (event: PointerEvent) => {
    if (event.pointerId === pointer) releasePointer();
  };
  footer.addEventListener(
    'pointerdown',
    (event) => {
      const target = actionTarget(event);
      if (!target || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      pointer = event.pointerId;
      pointerTarget = target;
      doc.addEventListener('pointerup', finishPointer, true);
      doc.addEventListener('pointercancel', cancelPointer, true);
      doc.defaultView?.addEventListener('blur', releasePointer);
    },
    true,
  );
  // Capture before Ionic's clear handler. Our programmatic click (detail 0) still
  // invokes its existing ionClear/input/refocus behavior, including after hydration.
  footer.addEventListener(
    'click',
    (event) => {
      if (event.detail !== 0 && actionTarget(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
  button.addEventListener('click', (event) => {
    // Pointer release already invoked the action. Keyboard/AT activation has no pointer click count.
    if (event.detail !== 0) return;
    releasePointer();
    original.click();
  });
  const icon = footer.ownerDocument.createElement('ion-icon');
  icon.slot = 'icon-only';
  icon.icon = close;
  button.append(icon);
  buttons.append(button);
  // Keep the editing layout while focus moves from clear to the slotted close button.
  footer.addEventListener('focusin', (event) => {
    if ((event.target as HTMLElement).closest('ion-searchbar')) footer.classList.add('ios-theme-searchable-editing');
  });
  footer.addEventListener('focusout', (event) => {
    if (pointer === undefined && !footer.contains(event.relatedTarget as Node | null))
      footer.classList.remove('ios-theme-searchable-editing');
  });
  original.closest('ion-toolbar')?.append(buttons);
};
