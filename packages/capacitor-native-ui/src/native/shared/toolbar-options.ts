import { modalUsesVerticalBars } from './modal';
import type { ToolbarProjectionOptions, VerticalControlAreaOptions } from '../definitions';
import { childElements, inFixedToolbar, isExcluded, isShellDisabled } from './dom';

export const toolbarOptions = (options: VerticalControlAreaOptions, vertical: boolean): Required<ToolbarProjectionOptions> => {
  const layout = vertical ? options.vertical : options.horizontal;
  if (typeof layout === 'boolean') return { buttons: layout, button: layout, backButton: layout };
  const settings = layout ?? {};
  return {
    buttons: settings.buttons ?? true,
    button: settings.button ?? true,
    backButton: settings.backButton ?? true,
  };
};

export const localToolbarOption = (element: HTMLElement, vertical: boolean): boolean | undefined => {
  const value = element.getAttribute(vertical ? 'data-vertical-bars' : 'data-horizontal-bars');
  return value === 'true' ? true : value === 'false' ? false : undefined;
};

export const horizontalSelected = (element: HTMLElement, options: VerticalControlAreaOptions): boolean => {
  const group = element.parentElement;
  if (group?.matches('ion-buttons') && isShellDisabled(group)) return false;
  return localToolbarOption(element, false) ?? toolbarOptions(options, false)[element.matches('ion-back-button') ? 'backButton' : 'button'];
};

// Group only if all original children qualify; otherwise selected actions remain individual.
// Back navigation never joins an ordinary action group.
export const horizontalToolbarGroup = (element: HTMLElement, options: VerticalControlAreaOptions): boolean => {
  if (
    !element.matches('ion-buttons.ios') ||
    !(localToolbarOption(element, false) ?? toolbarOptions(options, false).buttons) ||
    !inFixedToolbar(element) ||
    isExcluded(element) ||
    isShellDisabled(element)
  )
    return false;
  const children = childElements(element);
  return (
    children.length > 0 &&
    children.every(
      (child) =>
        horizontalSelected(child, options) &&
        !isExcluded(child) &&
        !isShellDisabled(child) &&
        (child.matches('ion-menu-button.ios') ||
          (children.length > 1 && child.matches('ion-button.ios.button-clear') && (child as HTMLIonButtonElement).fill === 'clear')),
    )
  );
};

export const inVerticalToolbarLayout = (element: HTMLElement): boolean =>
  !element.closest('ion-menu, ion-popover') && modalUsesVerticalBars(element) && !!element.closest('ion-app.ios-theme-vertical-bars');
