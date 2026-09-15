import { initialize } from '@ionic/core/components/index.js';
import { defineCustomElement as app } from '@ionic/core/components/ion-app.js';
import { defineCustomElement as button } from '@ionic/core/components/ion-button.js';
import { defineCustomElement as toggle } from '@ionic/core/components/ion-toggle.js';
import { defineCustomElement as segment } from '@ionic/core/components/ion-segment.js';
import { defineCustomElement as segmentButton } from '@ionic/core/components/ion-segment-button.js';
import { defineCustomElement as range } from '@ionic/core/components/ion-range.js';
import { defineCustomElement as tabBar } from '@ionic/core/components/ion-tab-bar.js';
import { defineCustomElement as tabButton } from '@ionic/core/components/ion-tab-button.js';
import { defineCustomElement as searchbar } from '@ionic/core/components/ion-searchbar.js';
import { defineCustomElement as alert } from '@ionic/core/components/ion-alert.js';
import { defineCustomElement as actionSheet } from '@ionic/core/components/ion-action-sheet.js';
import '@ionic/core/css/core.css';
import '@ionic/core/css/normalize.css';
import '@ionic/core/css/structure.css';
import '@ionic/core/css/typography.css';
import '@ionic/core/css/palettes/dark.class.css';
import {
  registerButtonEffect,
  registerSegmentEffect,
  registerTabBarEffect,
  alertEnterAnimation,
  alertLeaveAnimation,
  actionSheetEnterAnimation,
  actionSheetLeaveAnimation,
} from '../../../src';
import { setupNavigation } from './NavigationProbe';

initialize({
  mode: 'ios',
  alertEnter: alertEnterAnimation,
  alertLeave: alertLeaveAnimation,
  actionSheetEnter: actionSheetEnterAnimation,
  actionSheetLeave: actionSheetLeaveAnimation,
});
[app, button, toggle, segment, segmentButton, range, tabBar, tabButton, searchbar, alert, actionSheet].forEach((define) => define());

const params = new URLSearchParams(location.search);
document.documentElement.classList.toggle('ion-palette-dark', params.get('appearance') === 'dark');
const kind = params.get('control') ?? 'button';
const shell = params.get('shell') === '1';
const fixtures: Record<string, string> = {
  navigation: '<ion-nav id="Navigation"></ion-nav>',
  button: shell
    ? '<ion-button id="Glass" fill="default">Glass</ion-button>'
    : '<ion-button id="Glass" fill="default">Glass</ion-button><ion-button id="Prominent" fill="solid" type="submit">Prominent</ion-button>',
  'button-short': '<ion-button id="Glass" fill="default">Glass</ion-button>',
  toggle: '<ion-toggle id="Toggle" aria-label="Toggle"></ion-toggle>',
  segment:
    '<ion-segment id="Segment" value="One"><ion-segment-button value="One">One</ion-segment-button><ion-segment-button value="Two">Two</ion-segment-button><ion-segment-button value="Three">Three</ion-segment-button></ion-segment>',
  range: '<ion-range id="Range" aria-label="Range" value="50"></ion-range>',
  tabs: '<ion-tab-bar id="Tabs" selected-tab="One"><ion-tab-button tab="One">One</ion-tab-button><ion-tab-button tab="Two">Two</ion-tab-button><ion-tab-button tab="Three">Three</ion-tab-button></ion-tab-bar>',
  search: '<ion-searchbar id="Search" placeholder="Search"></ion-searchbar>',
  alert:
    '<button type="button" id="Show-overlay">Show overlay</button><ion-alert id="Alert" mode="ios" header="A Short Title Is Best" message="A message should be a short, complete sentence."></ion-alert>',
  'action-sheet':
    '<button type="button" id="Show-overlay">Show overlay</button><ion-action-sheet id="ActionSheet" mode="ios" header="Actions" sub-header="Action Sheet"></ion-action-sheet>',
};
const root = document.querySelector<HTMLElement>('#controls')!;
root.innerHTML = fixtures[kind === 'tabs-motion' ? 'tabs' : kind];

const frameOf = (rect: DOMRect, origin?: DOMRect) => ({
  x: rect.x - (origin?.x ?? 0),
  y: rect.y - (origin?.y ?? 0),
  width: rect.width,
  height: rect.height,
});

const labelText = (element: Element): string => {
  if (element.matches('ion-icon, svg, ion-badge, .ios26-segment-lens, .ion-cloned-element')) return '';
  return Array.from(element.childNodes)
    .map((node) => (node.nodeType === Node.TEXT_NODE ? node.textContent : node instanceof Element ? labelText(node) : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
};

const readItem = (child: HTMLElement, origin: DOMRect) => {
  const native = child.shadowRoot?.querySelector('[part="native"]') as HTMLElement | null;
  const labelElement = (child.shadowRoot?.querySelector('[part="text"], ion-label') as Element | null) ?? child;
  const labelStyle = getComputedStyle(labelElement);
  const label = labelText(child);
  const item: Record<string, unknown> = {
    id: child.id || (child.getAttribute('value') ?? child.getAttribute('tab') ?? label),
    ...frameOf(child.getBoundingClientRect(), origin),
    label,
    accessibilityLabel: child.getAttribute('aria-label') ?? native?.getAttribute('aria-label') ?? label,
    disabled: !!(child as HTMLElement & { disabled?: boolean }).disabled,
    selected: !!(child as HTMLElement & { selected?: boolean }).selected,
    fontSize: parseFloat(labelStyle.fontSize),
    fontWeight: parseInt(labelStyle.fontWeight, 10) || 400,
    color: getComputedStyle(native ?? child).color,
  };
  if (child.matches('ion-button') && native) {
    const style = getComputedStyle(native);
    item.contentInsetLeading = (parseFloat(style.paddingInlineStart) || 0) + (parseFloat(style.borderInlineStartWidth) || 0);
    item.contentInsetTrailing = (parseFloat(style.paddingInlineEnd) || 0) + (parseFloat(style.borderInlineEndWidth) || 0);
    item.imagePadding = 0;
  }
  return item;
};

// Shell DTO from live DOM geometry/styles — not Capacitor bridge/handoff verification.
const buildShellControls = (): Record<string, unknown>[] => {
  const dark = document.documentElement.classList.contains('ion-palette-dark');
  if (kind === 'button' || kind === 'button-short') {
    const element = root.querySelector<HTMLElement>('#Glass');
    if (!element) return [];
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return [
      {
        id: element.id,
        kind: 'ion-button',
        ...frameOf(rect),
        items: [readItem(element, rect)],
        dark,
        rtl: style.direction === 'rtl',
      },
    ];
  }
  if (kind === 'segment') {
    const element = root.querySelector<HTMLElement>('ion-segment');
    if (!element) return [];
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const value = (element as HTMLElement & { value?: string }).value;
    const children = Array.from(element.querySelectorAll<HTMLElement>(':scope > ion-segment-button'));
    return [
      {
        id: element.id || 'Segment',
        kind: 'ion-segment',
        ...frameOf(rect),
        items: children.map((child) => {
          const item = readItem(child, rect);
          item.selected = value === child.getAttribute('value');
          return item;
        }),
        dark,
        rtl: style.direction === 'rtl',
      },
    ];
  }
  if (kind === 'tabs') {
    const element = root.querySelector<HTMLElement>('ion-tab-bar');
    if (!element) return [];
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const selected = (element as HTMLElement & { selectedTab?: string }).selectedTab;
    const children = Array.from(element.querySelectorAll<HTMLElement>(':scope > ion-tab-button:not(.ion-cloned-element)'));
    return [
      {
        id: element.id || 'Tabs',
        kind: 'ion-tab-bar',
        ...frameOf(rect),
        items: children.map((child) => {
          const item = readItem(child, rect);
          item.selected = selected === child.getAttribute('tab');
          return item;
        }),
        dark,
        rtl: style.direction === 'rtl',
        tabBarAnchor: { x: style.left !== 'auto' ? 0 : 1, y: element.slot === 'bottom' ? 1 : 0 },
      },
    ];
  }
  return [];
};

void Promise.all(Array.from(root.querySelectorAll('*')).map(async (element: any) => element.componentOnReady?.())).then(async () => {
  if (kind === 'navigation') await setupNavigation(root);
  const segmentEl = root.querySelector('ion-segment');
  root.querySelectorAll<HTMLElement>('ion-button, ion-back-button').forEach(registerButtonEffect);
  if (segmentEl) registerSegmentEffect(segmentEl);
  const tabs = root.querySelector('ion-tab-bar');
  if (tabs) {
    registerTabBarEffect(tabs);
    tabs.addEventListener('ionTabButtonClick', (event: any) => {
      tabs.selectedTab = event.detail.tab;
    });
  }

  if (shell) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const controls = buildShellControls();
        (window as any).webkit?.messageHandlers.shell.postMessage(controls);
      });
    });
    return;
  }

  const rows: unknown[] = [];
  const start = performance.now();
  const overlayKind = kind === 'alert' || kind === 'action-sheet';
  if (overlayKind) {
    const overlay = root.querySelector(kind === 'alert' ? 'ion-alert' : 'ion-action-sheet') as any;
    if (kind === 'alert') {
      overlay.buttons = [
        { text: 'Cancel', role: 'cancel' },
        { text: 'OK', role: 'preferred' },
      ];
    } else {
      overlay.buttons = [
        { text: 'Delete', role: 'destructive' },
        { text: 'Share', role: 'selected' },
        { text: 'Cancel', role: 'cancel' },
      ];
    }
    root.querySelector('#Show-overlay')?.addEventListener('click', () => {
      rows.push({ t: (performance.now() - start) / 1000, event: 'present', id: kind });
      overlay.present();
    });
  }
  // Overlay actions live outside #controls (appended under ion-app); capture those input times too.
  const eventRoot: EventTarget = overlayKind ? document : root;
  for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'ionChange', 'ionTabButtonClick']) {
    eventRoot.addEventListener(event, (e) =>
      rows.push({
        t: (performance.now() - start) / 1000,
        event,
        id: (e.target as HTMLElement)?.id ?? '',
        ...('clientX' in e ? { x: (e as PointerEvent).clientX, y: (e as PointerEvent).clientY } : {}),
      }),
    );
  }
  const collect = (element: Element, path: string): unknown[] => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const children = [...Array.from(element.children), ...Array.from(element.shadowRoot?.children ?? [])];
    return [
      {
        path,
        tag: element.tagName,
        part: element.getAttribute('part'),
        // SVGElement.className is an SVGAnimatedString, not a bridge-safe string.
        class: element.getAttribute('class') ?? '',
        x: box.x,
        y: box.y,
        w: box.width,
        h: box.height,
        opacity: style.opacity,
        transform: style.transform,
        color: style.color,
        background: style.backgroundColor,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        border: style.borderColor,
        radius: style.borderRadius,
      },
      ...children.flatMap((child, index) => collect(child, `${path}/${index}`)),
    ];
  };
  const tick = () => {
    if (rows.length >= 6000) return;
    const primary = Array.from(root.children);
    const seen = new Set<Element>(primary);
    const extras = [
      ...Array.from(document.querySelectorAll('.ion-cloned-element, .ios26-segment-lens')).filter((el) => !root.contains(el)),
      ...Array.from(document.querySelectorAll('ion-alert, ion-action-sheet')).filter((el) => !seen.has(el)),
    ];
    rows.push({
      t: (performance.now() - start) / 1000,
      layers: [...primary, ...extras].flatMap((el, index) => collect(el, el.id || `effect-${index}`)),
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const flushMetrics = () => (window as any).webkit?.messageHandlers.metrics.postMessage(rows);
  if (kind.startsWith('tabs')) (window as any).flushParityMetrics = flushMetrics;
  else setInterval(flushMetrics, 1000);
  document.querySelector('#ready')!.textContent = 'Ready';
});
