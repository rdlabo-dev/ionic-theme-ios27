import type { NativeUIControls, NativeUIOptions } from '../definitions';

/** Resolve one default without changing discovery, explicit selection, or placement. */
export const controlDefault = (options: NativeUIOptions, kind: keyof NativeUIControls, vertical: boolean): boolean => {
  const controls = options.controls;
  const value = typeof controls === 'object' ? controls[kind] : controls;
  if (value === undefined || value === true) return true;
  if (value === false) return false;
  return value === (vertical ? 'verticalOnly' : 'horizontalOnly');
};

export const controlSelected = (
  element: HTMLElement,
  options: NativeUIOptions,
  kind: keyof NativeUIControls,
  vertical: boolean,
): boolean => {
  const local = element.getAttribute(vertical ? 'data-vertical-bars' : 'data-horizontal-bars');
  return local === 'true' ? true : local === 'false' ? false : controlDefault(options, kind, vertical);
};
