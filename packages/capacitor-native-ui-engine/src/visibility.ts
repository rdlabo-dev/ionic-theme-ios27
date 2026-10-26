import { projectionAncestors } from './geometry.js';

/** Current CSS visibility without the Engine's projection hiding rules.
 * Use when an existing renderer decides whether its DOM source is authored hidden.
 * Projection attributes are restored synchronously before returning; this performs
 * a style read and may notify MutationObservers, so it is not a cached measurement.
 */
export const getUnprojectedVisibility = (element: HTMLElement): string => {
  const win = element.ownerDocument.defaultView;
  if (!win) return 'hidden';
  const markers: { node: HTMLElement; name: string; value: string }[] = [];
  for (const node of [element, ...projectionAncestors(element)]) {
    for (const attribute of Array.from(node.attributes)) {
      if (
        attribute.name === 'data-native-ui-snapshot-source' ||
        attribute.name === 'data-native-ui-snapshot-prepared' ||
        attribute.name.startsWith('data-native-ui-session-')
      )
        markers.push({ node, name: attribute.name, value: attribute.value });
    }
  }
  try {
    for (const { node, name } of markers) node.removeAttribute(name);
    return win.getComputedStyle(element).visibility;
  } finally {
    for (const { node, name, value } of markers) node.setAttribute(name, value);
  }
};
