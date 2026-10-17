export const activeElement = (doc: Document): Element | null => {
  let element = doc.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
};

const focusableElements = (root: HTMLElement): HTMLElement[] => {
  const elements: HTMLElement[] = [];
  const win = root.ownerDocument.defaultView!;
  const collect = (scope: HTMLElement | ShadowRoot) => {
    for (const node of Array.from(scope.querySelectorAll<HTMLElement>('*'))) {
      if (node.inert || node.closest('[inert]') || (node as HTMLButtonElement).disabled) continue;
      const before = elements.length;
      if (node.shadowRoot) collect(node.shadowRoot);
      const css = win.getComputedStyle(node);
      if (
        elements.length === before &&
        node.tabIndex >= 0 &&
        !node.hidden &&
        css.display !== 'none' &&
        css.visibility !== 'hidden' &&
        node.getClientRects().length
      )
        elements.push(node);
    }
  };
  collect(root);
  return elements
    .map((element, index) => ({ element, index }))
    .sort((a, b) => (a.element.tabIndex || Infinity) - (b.element.tabIndex || Infinity) || a.index - b.index)
    .map(({ element }) => element);
};

export const trapFocus = (root: HTMLElement, enabled: () => boolean): (() => void) => {
  const doc = root.ownerDocument;
  const previous = root.getAttribute('tabindex');
  root.tabIndex = -1;
  let last: Element | null;
  const onFocus = (event: FocusEvent) => {
    if (!enabled()) return;
    if (event.composedPath().includes(root)) {
      last = activeElement(doc);
      return;
    }
    const elements = focusableElements(root);
    (elements.find((element) => element === last) ?? elements[0] ?? root).focus({ preventScroll: true });
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || !enabled()) return;
    const elements = focusableElements(root);
    const index = elements.findIndex((element) => element === activeElement(doc));
    const next = event.shiftKey ? (index <= 0 ? elements.length - 1 : index - 1) : (index + 1) % elements.length;
    event.preventDefault();
    (elements[next] ?? root).focus();
  };
  doc.addEventListener('focusin', onFocus, true);
  doc.addEventListener('keydown', onKey, true);
  return () => {
    doc.removeEventListener('focusin', onFocus, true);
    doc.removeEventListener('keydown', onKey, true);
    if (previous === null) root.removeAttribute('tabindex');
    else root.setAttribute('tabindex', previous);
  };
};
