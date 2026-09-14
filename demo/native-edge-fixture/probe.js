import { initialize } from '@ionic/core/components';
import { defineCustomElement } from '@ionic/core/components/ion-badge.js';

// The production demo does not otherwise use badges, so register the real Ionic component here.
initialize({ mode: 'ios' });
defineCustomElement();
// Injected only into the simulator acceptance build. Product markup is unchanged.
const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;top:240px;left:8px;z-index:10000;background:white;color:black;font:10px sans-serif;max-width:95vw';
const status = document.createElement('button');
status.style.cssText = 'display:block;max-height:30px;overflow:hidden;width:300px;font:9px sans-serif';
panel.append(status);
const tabs = () => document.querySelector('ion-tabs > ion-tab-bar');
for (const [label, action] of [
  ['Edge typography', () => { tabs().querySelectorAll('ion-label').forEach((label) => { label.style.fontSize = '14px'; label.style.fontWeight = label.style.fontWeight === '700' ? '300' : '700'; }); }],
  ['Edge update-badge', () => { tabs().querySelectorAll('ion-badge')[1].textContent = '999'; }],
  ...['icon-only', 'label-only', 'badges', 'clear-badges'].map((variant) => [
    `Edge ${variant}`,
    () => {
      const bar = tabs();
      bar.setAttribute('color', 'light');
      const buttons = [...bar.querySelectorAll('ion-tab-button:not(.ion-cloned-element)')];
      buttons.forEach((button) => {
        button.dataset.originalContent ??= button.innerHTML;
        button.setAttribute('aria-label', button.getAttribute('aria-label') ?? button.textContent.trim());
        if (variant !== 'clear-badges') button.innerHTML = button.dataset.originalContent;
      });
      if (variant === 'icon-only') buttons.forEach((button) => button.querySelector('ion-label')?.remove());
      if (variant === 'label-only') buttons.forEach((button) => button.querySelector('ion-icon')?.remove());
      if (variant === 'clear-badges') buttons.forEach((button) => button.querySelector('ion-badge')?.remove());
      if (variant === 'badges') {
        ['heart', 'musical-note', 'calendar'].forEach((name, index) => (buttons[index].querySelector('ion-icon').name = name));
        for (const [index, text] of [[0, ''], [2, '47']]) {
          const badge = document.createElement('ion-badge');
          badge.setAttribute('color', 'danger');
          badge.textContent = text;
          buttons[index].append(badge);
        }
      }
    },
  ]),
  ['Edge show-dot', () => {
    tabs().querySelector('ion-badge').style.cssText = 'display:block;min-width:8px;height:8px';
  }],
  ['Edge dark', () => document.documentElement.classList.add('ion-palette-dark')],
  ['Edge light', () => document.documentElement.classList.remove('ion-palette-dark')],
  ['Edge Web', () => window.nativeUIShell.destroy()],
  ['Edge narrow', () => (tabs().style.width = '300px')],
  ['Edge auto width', () => tabs().style.removeProperty('width')],
  ['Edge fixed', () => document.querySelectorAll('ion-header[collapse="condense"]').forEach((header) => header.remove())],
  ...['start', 'center', 'end'].map((position) => [
    `Edge ${position}`,
    () => {
      const bar = tabs();
      ['start', 'center', 'end'].forEach((p) => bar.classList.remove(`tab-bar-position-${p}`));
      bar.classList.add(`tab-bar-position-${position}`);
    },
  ]),
  ...['ltr', 'rtl'].map((dir) => [`Edge ${dir}`, () => (document.documentElement.dir = dir)]),
]) {
  const button = document.createElement('button');
  button.textContent = label;
  button.onclick = action;
  panel.append(button);
}
const input = document.createElement('input');
input.style.cssText = 'display:block;font:16px sans-serif;width:120px';
input.setAttribute('aria-label', 'Edge keyboard');
input.onkeydown = (event) => {
  if (event.key === 'Enter') input.blur();
};
panel.append(input);
document.body.append(panel);
const rect = (element) => {
  if (!element) return null;
  const r = element.getBoundingClientRect();
  return [r.x, r.y, r.width, r.height];
};
setInterval(() => {
  const bar = tabs();
  const back = Array.from(document.querySelectorAll('ion-header > ion-toolbar ion-back-button')).find(
    (b) => !b.closest('.ion-page-hidden, .ion-page-invisible, .ion-cloned-element') && b.getBoundingClientRect().width > 0,
  );
  const value = {
    path: location.pathname,
    native: window.nativeUIShell?.getStatus().state,
    tabs: bar ? rect(bar) : null,
    searchNative: !!document.querySelector('app-album-page:not(.ion-page-hidden) ion-footer[data-native-ui-shell]'),
    tabsNative: bar?.hasAttribute('data-native-ui-shell') ?? false,
    items: bar ? Array.from(bar.querySelectorAll('ion-tab-button')).map((b) => ({ label: b.textContent.trim(), rect: rect(b), lens: rect(b.shadowRoot?.querySelector('[part="native"]')), icon: b.querySelector('ion-icon') ? rect(b.querySelector('ion-icon')) : null, labelRect: b.querySelector('ion-label') ? rect(b.querySelector('ion-label')) : null })) : [],
    badges: bar ? [...bar.querySelectorAll('ion-badge')].map((badge) => ({
      value: badge.textContent,
      color: getComputedStyle(badge).backgroundColor,
      hydrated: !!badge.shadowRoot,
    })) : [],
    back: back ? rect(back) : null,
    backNative: back?.hasAttribute('data-native-ui-shell') ?? false,
  };
  // Accessibility value lets XCTest read the same source geometry used by the Web.
  status.textContent = JSON.stringify(value);
}, 100);
