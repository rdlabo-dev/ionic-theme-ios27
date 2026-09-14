import '@ionic/core/css/ionic.bundle.css';
import '@rdlabo/ionic-theme-ios27/dist/css/default-variables.css';
import '@rdlabo/ionic-theme-ios27/dist/css/ionic-theme-ios27.css';
import { initialize } from '@ionic/core/components';
import { defineCustomElement as defineApp } from '@ionic/core/components/ion-app.js';
import { defineCustomElement as defineHeader } from '@ionic/core/components/ion-header.js';
import { defineCustomElement as defineToolbar } from '@ionic/core/components/ion-toolbar.js';
import { defineCustomElement as defineButtons } from '@ionic/core/components/ion-buttons.js';
import { defineCustomElement as defineButton } from '@ionic/core/components/ion-button.js';
import { defineCustomElement as defineContent } from '@ionic/core/components/ion-content.js';
import { defineCustomElement as defineTabBar } from '@ionic/core/components/ion-tab-bar.js';
import { defineCustomElement as defineTabButton } from '@ionic/core/components/ion-tab-button.js';
import { defineCustomElement as defineFab } from '@ionic/core/components/ion-fab.js';
import { defineCustomElement as defineFabButton } from '@ionic/core/components/ion-fab-button.js';
import { defineCustomElement as defineFabList } from '@ionic/core/components/ion-fab-list.js';
import { iosTransitionAnimation } from '@rdlabo/ionic-theme-ios27';
import { enableNativeUIShell } from '@rdlabo/ionic-theme-ios27/native';
initialize({ mode: 'ios' });
[
  defineApp,
  defineHeader,
  defineToolbar,
  defineButtons,
  defineButton,
  defineContent,
  defineTabBar,
  defineTabButton,
  defineFab,
  defineFabButton,
  defineFabList,
].forEach((define) => define());
const tabs = document.querySelector('ion-tab-bar');
const fab = document.querySelector('ion-fab');
fab.addEventListener('nativeUIShellChange', () => {
  document.querySelector('[data-fab-source]').textContent = `FAB source: ${fab.hasAttribute('data-native-ui-shell') ? 'native' : 'web'}`;
});
let fabClicks = 0;
let singleClicks = 0;
document.querySelector('ion-fab-button[aria-label="Standalone FAB"]').addEventListener('click', () => {
  document.querySelector('[data-single-count]').textContent = `Standalone clicks: ${++singleClicks}`;
});
fab.querySelector('ion-fab-list ion-fab-button').addEventListener('click', () => {
  document.querySelector('[data-fab-count]').textContent = `FAB clicks: ${++fabClicks}`;
});
document.querySelector('[data-remove-fab-list]').addEventListener('click', () => fab.querySelector('ion-fab-list')?.remove());
document.querySelector('[data-count]').addEventListener('click', () => tabs.lastElementChild.remove());
document.querySelectorAll('[data-position]').forEach((button) =>
  button.addEventListener('click', () => {
    tabs.classList.remove('tab-bar-position-start', 'tab-bar-position-center', 'tab-bar-position-end');
    tabs.classList.add(`tab-bar-position-${button.dataset.position}`);
  }),
);
document.querySelectorAll('[data-direction]').forEach((button) =>
  button.addEventListener('click', () => {
    tabs.dir = button.dataset.direction;
  }),
);
document.querySelectorAll('[data-slot]').forEach((button) =>
  button.addEventListener('click', () => {
    tabs.slot = button.dataset.slot;
  }),
);
tabs.querySelectorAll('ion-tab-button').forEach((button) =>
  button.addEventListener('click', () => {
    tabs.querySelectorAll('ion-tab-button').forEach((item) => (item.selected = item === button));
  }),
);
window.transition = iosTransitionAnimation;
void enableNativeUIShell().then((handle) => (window.nativeUIShell = handle));
