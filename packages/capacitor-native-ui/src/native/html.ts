import { fitsClip } from './shared/clipping';
import type { NativeUIShellRuntimeOptions, NativeUIShellRuntimeHandle } from './definitions';
import { appendItem, createCandidate, type Candidate, type Identify } from './shared/candidate';
import { marker, unprojected, visible } from './shared/dom';

/** Standard HTML sources use standard native renderers, not app-local Swift extensions. */
export const htmlSelector = '[data-native-ui="button"], [data-native-ui="back-button"]';
export const htmlRailSource = (element: Element) =>
  element.matches(htmlSelector) && element.getAttribute('data-native-ui-placement') === 'rail';

export const readHTMLControl = (element: HTMLElement, id: Identify, options: NativeUIShellRuntimeOptions): Candidate | undefined => {
  if (
    !(options.root ?? element.ownerDocument.body).contains(element) ||
    !element.matches(htmlSelector) ||
    element.closest('[data-native-ui-proxy]')
  )
    return;
  // Explicit opt-in; custom elements can implement click() and expose role=button.
  if (!element.matches('button, ion-button, [role="button"]') || !visible(element, htmlRailSource(element))) return;
  if (element.contains(element.ownerDocument.activeElement)) return;
  if (!htmlRailSource(element) && !fitsClip(element)) return;
  if (
    options.explicitControls === false ||
    (options.explicitControls === undefined && (options.controls?.toolbar === false || options.controls?.buttons === false))
  )
    return;
  if (htmlRailSource(element) && options.verticalBars?.enabled === false) return;
  const kind = element.getAttribute('data-native-ui') === 'back-button' ? 'back-button' : 'button';
  const candidate = createCandidate(element, kind, id, options);
  const item = appendItem(candidate, element, id);
  if (!item) return;
  const labelledBy = element
    .getAttribute('aria-labelledby')
    ?.trim()
    .split(/\s+/)
    .map((key) => element.ownerDocument.getElementById(key)?.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
  item.accessibilityLabel = labelledBy || element.getAttribute('aria-label') || item.label;
  if (!item.accessibilityLabel) return;
  item.disabled ||= element.matches(':disabled, [disabled]') || !!element.closest('[aria-disabled="true"]');
  if (htmlRailSource(element)) candidate.control.placement = 'vertical-bars';
  return candidate;
};

/** A rail host is supplied and styled by the application, never by the plugin. */
export const createHTMLWebProjection = (doc: Document, options: NativeUIShellRuntimeOptions): NativeUIShellRuntimeHandle => {
  const host = options.rail?.host;
  const win = doc.defaultView!;
  const owned = new Map<HTMLElement, { clone: HTMLButtonElement; aria: string | null; signature: string }>();
  const style = doc.createElement('style');
  style.textContent = `[data-native-ui-web-source] { visibility: hidden !important; pointer-events: none !important; }`;
  doc.head.append(style);
  let frame = 0;
  let stopped = false;
  let suspended = 0;
  let updates = 0;
  const restore = (source: HTMLElement) => {
    const state = owned.get(source);
    if (!state) return;
    const focused = state.clone.contains(doc.activeElement);
    state.clone.remove();
    source.removeAttribute('data-native-ui-web-source');
    if (focused && source.isConnected && !source.hasAttribute(marker)) source.focus();
    owned.delete(source);
  };
  const measure = <T>(source: HTMLElement, read: () => T): T => {
    const hidden = source.hasAttribute('data-native-ui-web-source');
    if (hidden) source.removeAttribute('data-native-ui-web-source');
    try {
      return unprojected([source], read);
    } finally {
      if (hidden) source.setAttribute('data-native-ui-web-source', '');
    }
  };
  const render = () => {
    frame = 0;
    if (stopped) return;
    observer.disconnect();
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const wanted = new Set<HTMLElement>();
    if (!suspended && options.verticalBars?.enabled !== false && host?.isConnected && options.root?.isConnected) {
      const sources = Array.from(options.root.querySelectorAll<HTMLElement>(htmlSelector));
      let back = false;
      for (const source of sources) {
        if (!htmlRailSource(source) || host.contains(source) || source.hasAttribute('data-native-ui-shell-vertical-bars')) continue;
        const iconRoot = source.querySelector('ion-icon')?.shadowRoot;
        if (iconRoot) observer.observe(iconRoot, { subtree: true, childList: true, attributes: true, characterData: true });
        const candidate = measure(source, () => readHTMLControl(source, () => 'web', options));
        if (!candidate) continue;
        if (candidate.control.kind === 'back-button') {
          if (back) continue;
          back = true;
        }
        wanted.add(source);
        const item = candidate.control.items[0];
        const svg = source.querySelector('svg') ?? iconRoot?.querySelector('svg');
        const signature = JSON.stringify([item, source.innerHTML, svg?.outerHTML]);
        let state = owned.get(source);
        if (!state) {
          const clone = doc.createElement('button');
          clone.type = 'button';
          clone.setAttribute('data-native-ui-proxy', candidate.control.kind);
          state = { clone, aria: source.getAttribute('aria-hidden'), signature: '' };
          owned.set(source, state);
          clone.addEventListener('click', () => {
            const current = !stopped && !suspended && measure(source, () => readHTMLControl(source, () => 'web', options));
            if (
              options.verticalBars?.enabled === false ||
              !current ||
              !htmlRailSource(source) ||
              !host.isConnected ||
              current.control.items[0].disabled ||
              source.hasAttribute(marker)
            )
              return;
            source.click(); // Source owns submission, custom handlers and back navigation.
            schedule();
          });
          host.append(clone);
        }
        if (state.signature !== signature) {
          state.signature = signature;
          state.clone.replaceChildren();
          if (svg) {
            const icon = svg.cloneNode(true) as SVGElement;
            icon.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
            icon.removeAttribute('id');
            for (const node of [icon, ...Array.from(icon.querySelectorAll('*'))])
              for (const attr of Array.from(node.attributes)) if (attr.name.startsWith('on')) node.removeAttribute(attr.name);
            state.clone.append(icon);
          }
          state.clone.append(doc.createTextNode(item.label));
          state.clone.setAttribute('aria-label', item.accessibilityLabel);
          state.clone.disabled = item.disabled;
          updates++;
        }
        if (!source.hasAttribute('data-native-ui-web-source')) source.setAttribute('data-native-ui-web-source', '');
      }
    }
    for (const source of owned.keys()) if (!wanted.has(source)) restore(source);
    // Ignore our own synchronous DOM writes; later application mutations still schedule a refresh.
    observer.takeRecords();
  };
  const schedule = () => {
    if (!stopped && !frame) frame = win.requestAnimationFrame(render);
  };
  const observer = new MutationObserver(schedule);
  win.addEventListener('resize', schedule);
  win.addEventListener('nativeUIShellRefresh', schedule);
  render();
  return {
    markForCheck: schedule,
    getStatus: () => ({ state: stopped ? 'stopped' : 'web', projected: owned.size, updates }),
    async suspend() {
      suspended++;
      for (const source of owned.keys()) restore(source);
      let resumed = false;
      return {
        async resume() {
          if (!resumed) {
            resumed = true;
            suspended--;
            render();
          }
        },
      };
    },
    async destroy() {
      if (stopped) return;
      stopped = true;
      observer.disconnect();
      win.cancelAnimationFrame(frame);
      win.removeEventListener('resize', schedule);
      win.removeEventListener('nativeUIShellRefresh', schedule);
      for (const source of owned.keys()) restore(source);
      style.remove();
    },
  };
};
