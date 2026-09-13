// Injected only into the simulator acceptance build. Product markup is unchanged.
const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;top:240px;left:8px;z-index:10000;background:white;color:black;font:10px sans-serif;max-width:95vw';
const status = document.createElement('button');
status.style.cssText = 'display:block;max-height:30px;overflow:hidden;width:300px;font:9px sans-serif';
panel.append(status);
const tabs = () => document.querySelector('ion-tabs > ion-tab-bar');
for (const [label, action] of [
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
    tabsNative: bar?.hasAttribute('data-native-ui-shell') ?? false,
    items: bar ? Array.from(bar.querySelectorAll('ion-tab-button')).map((b) => ({ label: b.textContent.trim(), rect: rect(b) })) : [],
    back: back ? rect(back) : null,
    backNative: back?.hasAttribute('data-native-ui-shell') ?? false,
  };
  // Accessibility value lets XCTest read the same source geometry used by the Web.
  status.textContent = JSON.stringify(value);
}, 100);
