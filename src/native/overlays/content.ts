import { sheetText } from './styles';

/** Constructed stylesheets cannot cross documents with their nodes. */
export const moveContent = (content: HTMLElement[], destination: HTMLElement): (() => void) => {
  const home = content.map((element) => ({ element, parent: element.parentNode!, next: element.nextSibling }));
  const roots: { root: ShadowRoot; css: string; sheets: CSSStyleSheet[] }[] = [];
  const collect = (node: Element) => {
    if (node.shadowRoot) {
      roots.push({
        root: node.shadowRoot,
        css: sheetText(node.shadowRoot.adoptedStyleSheets),
        sheets: [...node.shadowRoot.adoptedStyleSheets],
      });
      for (const child of Array.from(node.shadowRoot.children)) collect(child);
    }
    for (const child of Array.from(node.children)) collect(child);
  };
  content.forEach(collect);
  for (const element of content) destination.append(destination.ownerDocument.adoptNode(element));
  const styles = roots
    .filter(({ css }) => css)
    .map(({ root, css }) => {
      const style = destination.ownerDocument.createElement('style');
      style.textContent = css;
      root.append(style);
      return style;
    });
  return () => {
    styles.forEach((style) => style.remove());
    for (const { element, parent, next } of home) {
      const connected = element.isConnected;
      parent.ownerDocument!.adoptNode(element);
      // Ionic may already have destroyed the Angular component on dismiss.
      if (connected) parent.insertBefore(element, next?.parentNode === parent ? next : null);
    }
    for (const { root, css, sheets } of roots) {
      // WebKit re-associates adopted sheets with the new document across
      // adoptNode, so they may no longer match this root; fall back to the
      // inline copy instead of aborting the remaining restore.
      try {
        root.adoptedStyleSheets = sheets;
      } catch {
        if (css) {
          const style = root.ownerDocument.createElement('style');
          style.textContent = css;
          root.append(style);
        }
      }
    }
  };
};
