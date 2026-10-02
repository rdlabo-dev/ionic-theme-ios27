export const sheetText = (sheets: readonly CSSStyleSheet[]): string =>
  sheets.flatMap((sheet) => Array.from(sheet.cssRules, (rule) => rule.cssText)).join('\n');

export const relayStyles = (
  source: Document,
  destination: Document,
  overlay: HTMLElement,
  verticalBars = false,
): { destination: HTMLElement; stop: () => void } => {
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
    const update = () => {
      for (const attribute of Array.from(target.attributes)) if (!node.hasAttribute(attribute.name)) target.removeAttribute(attribute.name);
      for (const attribute of Array.from(node.attributes)) target.setAttribute(attribute.name, attribute.value);
      // Centered dialogs and ordinary iPhones keep their Web toolbar layout.
      if (!verticalBars && target.localName === 'ion-app') target.classList.remove('ios-theme-vertical-bars');
      if (flatten) target.style.setProperty('display', 'contents', 'important');
    };
    update();
    const observer = new MutationObserver(update);
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
  const observer = new MutationObserver(sync);
  observer.observe(source.head, { subtree: true, childList: true, characterData: true, attributes: true });
  observers.push(observer);
  return { destination: parent, stop: () => observers.forEach((item) => item.disconnect()) };
};
