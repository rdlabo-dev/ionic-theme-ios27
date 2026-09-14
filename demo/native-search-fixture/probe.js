// Simulator-only diagnostics, injected into a copied demo build by the verification script.
const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;top:155px;left:8px;z-index:10000;background:white;color:black;font:11px sans-serif;max-width:95vw';
const status = document.createElement('button');
let clicks = 0;
status.onclick = () => {
  clicks++;
};
panel.append(status);
const bar = () => document.querySelector('app-album-page:not(.ion-page-hidden) ion-searchbar');
let watch;
const watchSearch = () => {
  const footer = bar().closest('ion-footer');
  const sources = [document.querySelector('ion-tab-bar'), footer, footer.parentElement.querySelector('ion-fab')];
  watch = { running: true, frames: 0, releases: 0, exposed: 0 };
  const current = watch;
  const release = (event) => {
    if (sources.includes(event.target) && !event.target.hasAttribute('data-native-ui-shell')) current.releases++;
  };
  document.addEventListener('nativeUIShellChange', release, true);
  const sample = () => {
    if (!current.running) {
      document.removeEventListener('nativeUIShellChange', release, true);
      return;
    }
    current.frames++;
    if (sources.some((source) => !source.hasAttribute('data-native-ui-shell') || getComputedStyle(source).visibility !== 'hidden'))
      current.exposed++;
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};
for (const [label, action] of [
  ['Watch search', watchSearch],
  [
    'Stop watch',
    () => {
      watch.running = false;
    },
  ],
  ['Toggle native theme', () => document.documentElement.classList.toggle('ionic-theme-disabled')],
  ['Destroy native', () => window.nativeUIShell.destroy()],
  [
    'External value',
    () => {
      bar().value = 'external';
    },
  ],
  ['Focus search', () => bar().setFocus()],
  ...['start', 'center', 'end'].map((position) => [
    `Position ${position}`,
    () => {
      const tabs = document.querySelector('ion-tab-bar');
      ['start', 'center', 'end'].forEach((value) => tabs.classList.remove(`tab-bar-position-${value}`));
      tabs.classList.add(`tab-bar-position-${position}`);
    },
  ]),
  [
    'Toggle RTL',
    () => {
      document.documentElement.dir = document.documentElement.dir === 'rtl' ? 'ltr' : 'rtl';
    },
  ],
  [
    'Move FAB',
    () => {
      const trigger = document.querySelector('app-album-page:not(.ion-page-hidden) ion-fab-button');
      trigger.style.transform = trigger.style.transform ? '' : 'translateY(-24px)';
    },
  ],
  ['Toggle search theme', () => bar().classList.toggle('ionic-theme-disabled')],
]) {
  const button = document.createElement('button');
  button.textContent = label;
  button.onclick = action;
  panel.append(button);
}
const events = [];
for (const name of ['ionInput', 'ionChange', 'ionFocus', 'ionBlur', 'ionClear', 'ionCancel'])
  document.addEventListener(name, (event) => {
    if (event.target.matches('ion-searchbar')) events.push([name, event.detail?.value, event.detail?.event?.isComposing]);
  });
const webInput = document.createElement('input');
webInput.setAttribute('aria-label', 'Web keyboard');
webInput.onkeydown = (event) => {
  if (event.key === 'Enter') webInput.blur();
};
panel.append(webInput);
document.body.append(panel);
setInterval(() => {
  const input = bar();
  const native = input?.closest('ion-footer').hasAttribute('data-native-ui-shell');
  const tabs = document.querySelector('ion-tab-bar');
  const position = ['start', 'center', 'end'].find((value) => tabs?.classList.contains(`tab-bar-position-${value}`)) ?? 'default';
  const trigger = document.querySelector('app-album-page:not(.ion-page-hidden) ion-fab-button')?.getBoundingClientRect();
  status.textContent = `Probe ${native ? 'native' : 'web'} value:${input?.value ?? ''} viewport:${innerWidth > innerHeight ? 'landscape' : 'portrait'} clicks:${clicks} focus:${events.filter((e) => e[0] === 'ionFocus').length} clear:${events.filter((e) => e[0] === 'ionClear').length} ime:${events.some((e) => e[2])} position:${position} dir:${document.documentElement.dir || 'ltr'} origin:${trigger ? trigger.x + trigger.width / 2 : 0} settled:${!document.getAnimations().some((a) => a.playState === 'running')}${watch ? ` watch:${watch.running ? 'running' : 'done'} frames:${watch.frames} releases:${watch.releases} exposed:${watch.exposed}` : ''}`;
  window.searchProbe = {
    native,
    value: input?.value,
    events,
    url: location.pathname,
    tab: document.querySelector('ion-tab-bar')?.getBoundingClientRect().toJSON(),
    fab: document.querySelector('app-album-page:not(.ion-page-hidden) ion-fab-button')?.getBoundingClientRect().toJSON(),
  };
}, 100);
