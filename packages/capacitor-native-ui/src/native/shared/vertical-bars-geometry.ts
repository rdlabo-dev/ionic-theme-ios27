import type { Frame, NativeUIVerticalBarFrame } from '../definitions';

const measurements = new WeakMap<Element, { frame: Frame; viewport: string }>();
const viewport = (element: Element) => {
  const win = element.ownerDocument.defaultView!;
  const classes = element.closest('ion-app')?.classList;
  return `${win.innerWidth}:${win.innerHeight}:${classes?.contains('ios-theme-vertical-bars')}:${classes?.contains('ios-theme-vertical-bars-left')}`;
};

export const validVerticalBarFrame = (frame: Frame) =>
  [frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) && frame.width > 0 && frame.height > 0;

export const forgetVerticalBarFrame = (element: Element) => measurements.delete(element);

export const rememberVerticalBarFrame = (element: Element, frame: Frame) => {
  if (validVerticalBarFrame(frame)) measurements.set(element, { frame, viewport: viewport(element) });
};

export const verticalBarFrame = (element: Element): Frame | undefined => {
  const saved = measurements.get(element);
  return saved?.viewport === viewport(element) ? saved.frame : undefined;
};

/** Convert the native viewport rectangle into the clone's positioning container. */
export const alignVerticalBarClone = (clone: HTMLElement, source: Element, parent: HTMLElement) => {
  const frame = verticalBarFrame(source);
  if (!frame) return;
  const origin = parent.getBoundingClientRect();
  // Absolute children use the padding edge, not the outer edge of a glass group.
  Object.assign(clone.style, {
    position: 'absolute',
    left: `${frame.x - origin.left - parent.clientLeft}px`,
    top: `${frame.y - origin.top - parent.clientTop}px`,
    right: 'auto',
    bottom: 'auto',
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    minWidth: `${frame.width}px`,
    maxWidth: `${frame.width}px`,
    minHeight: `${frame.height}px`,
    maxHeight: `${frame.height}px`,
    margin: '0',
    boxSizing: 'border-box',
  });
};

export const alignVerticalTabBar = (
  tabBar: HTMLElement,
  frame: NativeUIVerticalBarFrame,
  items: Map<HTMLElement, NativeUIVerticalBarFrame>,
): (() => void) => {
  const doc = tabBar.ownerDocument;
  const style = doc.createElement('style');
  const token = `rail-${Math.random().toString(36).slice(2)}`;
  const selector = `[data-native-rail-geometry="${token}"]`;
  const origin = (tabBar.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? { left: 0, top: 0 };
  tabBar.setAttribute('data-native-rail-geometry', token);
  // Preserve the measured shape. Only older binaries need the capsule fallback.
  const radius = (rect: NativeUIVerticalBarFrame) =>
    Number.isFinite(rect.cornerRadius) && rect.cornerRadius! >= 0 ? rect.cornerRadius! : Math.min(rect.width, rect.height) / 2;
  const box = (rect: NativeUIVerticalBarFrame, x: number, y: number) =>
    `position:absolute!important;left:${rect.x - x}px!important;top:${rect.y - y}px!important;right:auto!important;bottom:auto!important;width:${rect.width}px!important;min-width:${rect.width}px!important;max-width:${rect.width}px!important;height:${rect.height}px!important;min-height:${rect.height}px!important;max-height:${rect.height}px!important;margin:0!important;padding:0!important;box-sizing:border-box!important;border-radius:${radius(rect)}px!important;`;
  style.textContent =
    `${selector}{${box(frame, origin.left, origin.top)}}` +
    [...items]
      .map(([element, rect]) => {
        const index = Array.from(tabBar.children).indexOf(element) + 1;
        return `${selector}>:nth-child(${index}){${box(rect, frame.x, frame.y)}}${selector}>:nth-child(${index})::part(native){min-height:0!important}`;
      })
      .join('');
  doc.head.append(style);
  const win = doc.defaultView!;
  const measuredViewport = viewport(tabBar);
  const stop = () => {
    observer.disconnect();
    win.removeEventListener('resize', stop);
    style.remove();
    if (tabBar.getAttribute('data-native-rail-geometry') === token) tabBar.removeAttribute('data-native-rail-geometry');
  };
  const observer = new MutationObserver((records) => {
    if (viewport(tabBar) !== measuredViewport || records.some((record) => record.type === 'childList')) stop();
  });
  observer.observe(tabBar, { childList: true });
  const app = tabBar.closest('ion-app');
  if (app) observer.observe(app, { attributes: true, attributeFilter: ['class'] });
  win.addEventListener('resize', stop);
  return stop;
};
