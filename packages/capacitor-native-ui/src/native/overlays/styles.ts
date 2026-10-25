export const sheetText = (sheets: readonly CSSStyleSheet[]): string =>
  sheets.flatMap((sheet) => Array.from(sheet.cssRules, (rule) => rule.cssText)).join('\n');

export const relayStyles = (
  source: Document,
  destination: Document,
  overlay: HTMLElement,
  changed?: () => void,
): { destination: HTMLElement; ready: Promise<void>; stop: () => void } => {
  const base = destination.createElement('base');
  base.href = source.baseURI;
  destination.head.append(base);
  const copies = new Map<Element, Element>();
  const sheets = destination.createElement('style');
  destination.head.append(sheets);
  const sync = () => {
    sheets.textContent = sheetText(source.adoptedStyleSheets);
    const sources = Array.from(source.querySelectorAll('meta[name=viewport],link[rel=stylesheet],style:not([data-overlay-relay-local])'));
    for (const [node, copy] of copies)
      if (!sources.includes(node)) {
        copy.remove();
        copies.delete(node);
      }
    for (const node of sources) {
      let copy = copies.get(node);
      if (!copy) {
        copy = node.cloneNode(true) as Element;
        copies.set(node, copy);
      } else {
        for (const attribute of Array.from(copy.attributes)) copy.removeAttribute(attribute.name);
        for (const attribute of Array.from(node.attributes)) copy.setAttribute(attribute.name, attribute.value);
        copy.textContent = node.textContent;
      }
      destination.head.append(copy);
    }
    destination.head.append(surface);
  };
  const surface = destination.createElement('style');
  surface.textContent = 'html,body{background:transparent!important}';
  const observers: MutationObserver[] = [];
  const mirror = (node: Element, target: HTMLElement, flatten = false) => {
    let attributes = '';
    const update = () => {
      const next = JSON.stringify(Array.from(node.attributes, ({ name, value }) => [name, value]));
      if (next === attributes) return false;
      attributes = next;
      for (const attribute of Array.from(target.attributes)) if (!node.hasAttribute(attribute.name)) target.removeAttribute(attribute.name);
      for (const attribute of Array.from(node.attributes)) target.setAttribute(attribute.name, attribute.value);
      // The popover content must not inherit the source page's rail layout.
      if (target.localName === 'ion-app') target.classList.remove('ios-theme-vertical-bars');
      if (flatten) target.style.setProperty('display', 'contents', 'important');
      return true;
    };
    update();
    const observer = new MutationObserver(() => {
      if (update()) changed?.();
    });
    observer.observe(node, { attributes: true });
    observers.push(observer);
  };
  mirror(source.documentElement, destination.documentElement);
  mirror(source.body, destination.body);
  const ancestors: Element[] = [];
  for (let node = overlay.parentElement; node && node !== source.body; node = node.parentElement) ancestors.unshift(node);
  let parent = destination.body;
  for (const node of ancestors) {
    const shell = destination.createElement(node.localName);
    mirror(node, shell, true);
    parent.append(shell);
    parent = shell;
  }
  sync();
  // A copied external stylesheet can still be loading when Ionic's content is
  // ready. Do not expose an unstyled first native frame (notably button sizes).
  const ready = Promise.all(
    Array.from(destination.querySelectorAll<HTMLLinkElement>('link[rel=stylesheet]'), (link) => {
      if (link.sheet) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        link.addEventListener('load', () => resolve(), { once: true });
        link.addEventListener('error', () => reject(new Error('Popover stylesheet unavailable')), { once: true });
      });
    }),
  ).then(() => undefined);
  const localStyle = (node: Node) => node instanceof Element && node.matches('style[data-overlay-relay-local]');
  const observer = new MutationObserver((records) => {
    // Source-only projection pixels never affect the relayed content. Their
    // preparation must not dismiss a popover which still owns its native anchor.
    const local = (record: MutationRecord) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest('style[data-overlay-relay-local]')) return true;
      const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
      return record.type === 'childList' && nodes.length > 0 && nodes.every(localStyle);
    };
    if (records.every(local)) return;
    sync();
    changed?.();
  });
  observer.observe(source.head, { subtree: true, childList: true, characterData: true, attributes: true });
  observers.push(observer);
  return { destination: parent, ready, stop: () => observers.forEach((item) => item.disconnect()) };
};

// Compare the live content at the same proposed size before exposing a native
// surface. Ancestor/sibling selectors and container queries can change when
// ancestor shells become display:contents; unsupported contexts stay on Web.
export const captureRelayAppearance = (roots: Element[]): (() => boolean) => {
  const properties = [
    'display',
    'position',
    'box-sizing',
    'color',
    'background-color',
    'background-image',
    'background-size',
    'background-position',
    'box-shadow',
    'visibility',
    'opacity',
    'transform',
    'filter',
    'overflow',
    'text-decoration',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'letter-spacing',
    'text-align',
    'text-transform',
    'white-space',
    'direction',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-top-color',
    'border-radius',
    'flex-direction',
    'flex-wrap',
    'justify-content',
    'align-items',
    'grid-template-columns',
    'grid-template-rows',
    'gap',
    'width',
    'height',
  ];
  const snapshots: { node: Element; values: string[] }[] = [];
  const values = (node: Element) => {
    const css = node.ownerDocument.defaultView!.getComputedStyle(node);
    return properties.map((property) => css.getPropertyValue(property));
  };
  const visit = (node: Element) => {
    if (snapshots.length >= 1000) throw new Error('Popover content too complex to verify native styling');
    snapshots.push({ node, values: values(node) });
    Array.from(node.children).forEach(visit);
    if (node.shadowRoot)
      Array.from(node.shadowRoot.children)
        .filter((child) => !child.matches('style, link'))
        .forEach(visit);
  };
  roots.forEach(visit);
  return () =>
    snapshots.every(({ node, values: before }) =>
      values(node).every((value, index) => {
        return value === before[index];
      }),
    );
};

/** Flattening an ancestor must not remove a containing block or visual effect. */
export const relayLayoutSupported = (overlay: HTMLElement): boolean => {
  const win = overlay.ownerDocument.defaultView!;
  for (let node = overlay.parentElement; node; node = node.parentElement) {
    const css = win.getComputedStyle(node);
    if (
      css.containerType !== 'normal' ||
      (css.transform !== 'none' && !new DOMMatrixReadOnly(css.transform).isIdentity) ||
      css.perspective !== 'none' ||
      css.filter !== 'none' ||
      css.opacity !== '1'
    )
      return false;
  }
  return true;
};
