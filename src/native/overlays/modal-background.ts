/** Suppress Ionic's backing-page effect while UIKit owns the Card presentation. */
export const preserveModalBackground = (overlay: HTMLIonModalElement, id: string) => {
  if (!overlay.presentingElement) return;
  const doc = overlay.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute('data-overlay-relay-local', '');
  const saved = [
    { element: overlay.presentingElement, properties: ['transform', 'transform-origin', 'overflow', 'filter', 'border-radius'] },
    { element: doc.body, properties: ['background-color'] },
  ].map(({ element, properties }, index) => {
    const attribute = element.getAttribute('data-overlay-background');
    const token = `${id}-${index}`;
    const css = doc.defaultView!.getComputedStyle(element);
    const values = properties.map((name) => ({
      name,
      value: element.style.getPropertyValue(name),
      priority: element.style.getPropertyPriority(name),
    }));
    // Ionic still settles its Web presentation for a possible return to the WebView.
    // Its backing-page transform must not also scale UIKit's backing view.
    style.textContent += `[data-overlay-background="${token}"] {${properties.map((name) => `${name}:${css.getPropertyValue(name)}!important`).join(';')}}`;
    element.setAttribute('data-overlay-background', token);
    return { element, attribute, values };
  });
  doc.head.append(style);
  return (dismissed: boolean) => {
    style.remove();
    for (const { element, attribute, values } of saved) {
      if (attribute === null) element.removeAttribute('data-overlay-background');
      else element.setAttribute('data-overlay-background', attribute);
      if (dismissed) for (const { name, value, priority } of values) element.style.setProperty(name, value, priority);
    }
  };
};
