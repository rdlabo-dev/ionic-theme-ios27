import type { Frame } from '../definitions';

/** Keep the Web replacement at the native action's last visible bounds. */
export const placeProjection = (element: HTMLElement, frame: Frame, position = 'fixed'): void => {
  element.setAttribute('data-native-ui-shell-frame', '');
  Object.assign(element.style, {
    position,
    left: `${frame.x}px`,
    top: `${frame.y}px`,
    right: 'auto',
    bottom: 'auto',
    width: `${frame.width}px`,
    minWidth: '0',
    height: `${frame.height}px`,
    minHeight: '0',
    margin: '0',
  });
};
