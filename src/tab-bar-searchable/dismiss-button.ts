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
  // Keep the field focused until click; blur would hide this button before dismissal.
  button.addEventListener('pointerdown', (event) => event.preventDefault());
  button.addEventListener('click', () => original.click());
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
    if (!footer.contains(event.relatedTarget as Node | null)) footer.classList.remove('ios-theme-searchable-editing');
  });
  original.closest('ion-toolbar')?.append(buttons);
};
