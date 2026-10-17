export const iconSource = (svg: SVGElement, mirrored?: boolean): string | undefined => {
  // A small, local SVG subset. Never load external content while projecting UI.
  if (
    svg.querySelector('script, foreignObject, image, use, animate, animateTransform, set, style, text') ||
    /url\((?!["']?#)/.test(svg.outerHTML)
  )
    return undefined;
  // Ionicons flips the wrapper, not the SVG, for directional icons in RTL.
  if (mirrored === undefined && svg.parentElement?.matches('.icon-inner')) {
    const transform = new DOMMatrixReadOnly(getComputedStyle(svg.parentElement).transform);
    mirrored = transform.is2D && transform.a === -1 && transform.d === 1 && !transform.b && !transform.c && !transform.e && !transform.f;
  }
  const copy = svg.cloneNode(true) as SVGElement;
  const originals = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const copies = [copy, ...Array.from(copy.querySelectorAll('*'))];
  originals.forEach((node, index) => {
    const style = getComputedStyle(node);
    for (const property of ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'color']) {
      (copies[index] as SVGElement).style.setProperty(property, style.getPropertyValue(property));
    }
  });
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (mirrored) {
    copy.style.transform = 'scaleX(-1)';
    copy.style.transformOrigin = 'center';
  }
  return new XMLSerializer().serializeToString(copy);
};

export const createIconRenderer = () => {
  const cache = new Map<string, string>();
  return {
    clear: () => cache.clear(),
    async render(source: string, width: number, height: number): Promise<string> {
      const scale = devicePixelRatio || 1;
      const key = `${width}:${height}:${scale}:${source}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/png').split(',')[1];
        if (cache.size >= 128) cache.delete(cache.keys().next().value!);
        cache.set(key, data);
        return data;
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  };
};
