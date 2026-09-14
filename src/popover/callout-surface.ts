/** Draw one glass silhouette so the arrow cannot sample the body's own border/shadow. */
export const createCalloutSurface = (
  root: ShadowRoot | HTMLElement,
  width: number,
  height: number,
  side: 'top' | 'right' | 'bottom' | 'left',
  center: number,
): HTMLElement[] => {
  const inset = 32;
  const x = inset;
  const y = inset;
  const right = x + width;
  const bottom = y + height;
  const radius = Math.max(0, Math.min(34, width / 2, height / 2, (side === 'left' || side === 'right' ? height : width) / 2 - 17));
  const point = (u: number, v: number): string => {
    switch (side) {
      case 'top':
        return `${x + center - 17 + u} ${y - 13 + v}`;
      case 'right':
        return `${right + 13 - v} ${y + center - 17 + u}`;
      case 'bottom':
        return `${x + center + 17 - u} ${bottom + 13 - v}`;
      case 'left':
        return `${x - 13 + v} ${y + center + 17 - u}`;
    }
  };
  const arrow = `L ${point(0, 13)} C ${point(3, 13)} ${point(4.5, 12)} ${point(6.5, 10)} L ${point(14.5, 1.5)} C ${point(16, -0.5)} ${point(18, -0.5)} ${point(19.5, 1.5)} L ${point(27.5, 10)} C ${point(29.5, 12)} ${point(31, 13)} ${point(34, 13)}`;
  const path = `M ${x + radius} ${y} ${side === 'top' ? arrow : ''}
    L ${right - radius} ${y} A ${radius} ${radius} 0 0 1 ${right} ${y + radius} ${side === 'right' ? arrow : ''}
    L ${right} ${bottom - radius} A ${radius} ${radius} 0 0 1 ${right - radius} ${bottom} ${side === 'bottom' ? arrow : ''}
    L ${x + radius} ${bottom} A ${radius} ${radius} 0 0 1 ${x} ${bottom - radius} ${side === 'left' ? arrow : ''}
    L ${x} ${y + radius} A ${radius} ${radius} 0 0 1 ${x + radius} ${y} Z`;
  const svg = (body: string) =>
    `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width + inset * 2}" height="${height + inset * 2}">${body}</svg>`)}")`;
  const fill = svg(`<path d="${path}" fill="white"/>`);
  const stroke = svg(`<path d="${path}" fill="none" stroke="white" stroke-width="0.5"/>`);
  const shadow = svg(
    `<defs><filter id="s" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="4"/><feOffset dy="2"/><feComposite in2="SourceGraphic" operator="out"/></filter></defs><path d="${path}" fill="white" filter="url(#s)"/>`,
  );
  const wrapper = root.querySelector('.popover-wrapper')!;
  return [
    ['callout-shadow', shadow],
    ['callout-glass', fill],
    ['callout-border', stroke],
  ].map(([part, mask]) => {
    const element = document.createElement('div');
    element.setAttribute('part', part);
    element.className = 'ios-theme-callout-layer';
    element.setAttribute('aria-hidden', 'true');
    element.style.cssText = `position:absolute;pointer-events:none;z-index:9;width:${width + inset * 2}px;height:${height + inset * 2}px;mask-image:${mask};-webkit-mask-image:${mask};mask-repeat:no-repeat;`;
    wrapper.append(element);
    return element;
  });
};
