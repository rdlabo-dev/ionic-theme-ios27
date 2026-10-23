/** Keep the Web fallback at the acknowledged native width, without feeding that
 * width back as the next layout request (which can progressively shrink a bar). */
export const createTabBarWidths = (doc: Document) => {
  const entries = new Map<HTMLElement, { style: HTMLStyleElement; key: string; width: number; cssWidth: number }>();
  let next = 0;
  const key = (bar: HTMLElement) => {
    const computed = doc.defaultView!.getComputedStyle(bar);
    return JSON.stringify([
      doc.defaultView!.innerWidth,
      doc.defaultView!.innerHeight,
      bar.closest('ion-app')?.className,
      computed.width,
      computed.boxSizing,
      computed.paddingLeft,
      computed.paddingRight,
      computed.borderLeftWidth,
      computed.borderRightWidth,
      Array.from(bar.children)
        .filter((child) => !child.classList.contains('ion-cloned-element'))
        .map((child) => child.textContent),
    ]);
  };
  const remove = (bar: HTMLElement) => {
    entries.get(bar)?.style.remove();
    entries.delete(bar);
    bar.removeAttribute('data-native-tab-width');
  };
  return {
    measure<T>(read: () => T): T {
      // Compare layout with the source CSS. Gesture classes and transforms must
      // not discard the measured resting width during a Web handoff.
      for (const { style } of entries.values()) if (style.sheet) style.sheet.disabled = true;
      for (const [bar, entry] of entries) if (!bar.isConnected || entry.key !== key(bar)) remove(bar);
      try {
        return read();
      } finally {
        for (const { style } of entries.values()) if (style.sheet) style.sheet.disabled = false;
      }
    },
    apply(bar: HTMLElement, width: number) {
      if (!Number.isFinite(width) || width <= 0) return;
      const previous = entries.get(bar);
      const computed = doc.defaultView!.getComputedStyle(bar);
      const inset =
        computed.boxSizing === 'border-box'
          ? 0
          : (['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'] as const).reduce(
              (total, property) => total + (parseFloat(computed[property]) || 0),
              0,
            );
      const cssWidth = Math.max(0, width - inset);
      if (previous && Math.abs(previous.width - width) < 0.1 && Math.abs(previous.cssWidth - cssWidth) < 0.1) return;
      remove(bar);
      const sourceKey = key(bar);
      const token = `tab-${++next}`;
      const style = doc.createElement('style');
      bar.setAttribute('data-native-tab-width', token);
      style.textContent = `[data-native-tab-width="${token}"]{width:${cssWidth}px!important;min-width:${cssWidth}px!important;max-width:${cssWidth}px!important}`;
      doc.head.append(style);
      entries.set(bar, { style, key: sourceKey, width, cssWidth });
    },
    clear() {
      for (const bar of entries.keys()) remove(bar);
    },
  };
};
