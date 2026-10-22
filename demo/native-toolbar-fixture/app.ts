import '@ionic/core/css/ionic.bundle.css';
import { initialize, createAnimation } from '@ionic/core/components';
import { defineCustomElement as defineApp } from '@ionic/core/components/ion-app.js';
import { defineCustomElement as defineNav } from '@ionic/core/components/ion-nav.js';
import { defineCustomElement as defineHeader } from '@ionic/core/components/ion-header.js';
import { defineCustomElement as defineToolbar } from '@ionic/core/components/ion-toolbar.js';
import { defineCustomElement as defineTitle } from '@ionic/core/components/ion-title.js';
import { defineCustomElement as defineButton } from '@ionic/core/components/ion-button.js';
import { defineCustomElement as defineBack } from '@ionic/core/components/ion-back-button.js';
import { defineCustomElement as defineButtons } from '@ionic/core/components/ion-buttons.js';
import { defineCustomElement as defineContent } from '@ionic/core/components/ion-content.js';
import { registerPlugin } from '@capacitor/core';
import { createRuntime } from '../../packages/capacitor-native-ui/src/native/runtime';
import { withNativeUITransition } from '../../packages/theme-ios27/src/transition/native-ui';
import type { NativeUIPlugin } from '../../packages/capacitor-native-ui/src/native/definitions';
initialize({ mode: 'ios' });
[defineApp, defineNav, defineHeader, defineToolbar, defineTitle, defineButtons, defineButton, defineBack, defineContent].forEach((define) =>
  define(),
);
const native: NativeUIPlugin =
  (window as Window & { __nativeUI?: NativeUIPlugin }).__nativeUI ?? registerPlugin<NativeUIPlugin>('NativeUI');
const state = {
  phase: 'idle',
  cycles: 0,
  cancellations: 0,
  samples: 0,
  samplesByCycle: {} as Record<number, number>,
  maxProgress: {} as Record<number, number>,
  exposures: [] as string[],
  emptyAt: [] as string[],
  exposedWeb: 0,
  emptyNative: 0,
  action: '',
  labels: [] as string[],
  error: '',
};
let outgoing: HTMLElement | undefined;
let incoming: HTMLElement | undefined;
let sequence = 0;
const plugin = {
  ...native,
  addListener: native.addListener.bind(native),
  clear: native.clear.bind(native),
  async update(snapshot: Parameters<NativeUIPlugin['update']>[0]) {
    state.labels = snapshot.controls.flatMap((control) => control.items.map((item) => item.label ?? ''));
    if (state.phase === 'moving' && !snapshot.controls.length) {
      state.emptyNative++;
      state.emptyAt.push(String(state.cycles));
    }
    const result = await native.update(snapshot);
    return result;
  },
} as NativeUIPlugin;
const nav = document.querySelector('ion-nav')!;
nav.swipeGesture = true;
nav.animation = withNativeUITransition((_base, opts) => {
  const back = opts.direction === 'back';
  const animation = createAnimation()
    .duration(1200)
    .addAnimation([
      createAnimation()
        .addElement(opts.enteringEl)
        .fromTo('transform', `translateX(${back ? '-30%' : '100%'})`, 'translateX(0%)'),
      createAnimation()
        .addElement(opts.leavingEl)
        .fromTo('transform', 'translateX(0%)', `translateX(${back ? '100%' : '-30%'})`),
    ])
    .afterClearStyles(['transform']);
  animation.childAnimations.forEach((child) => child.afterClearStyles(['transform']));
  return animation;
});
const action = (name: string) => {
  state.action = `${name}:${++sequence}`;
};
class RootPage extends HTMLElement {
  connectedCallback() {
    if (this.children.length) return;
    this.innerHTML =
      '<ion-header><ion-toolbar><ion-title>Root</ion-title><ion-buttons slot="end"><ion-button>Edit</ion-button></ion-buttons></ion-toolbar></ion-header><ion-content><div class="actions"><button id="push">Push detail</button></div></ion-content>';
    this.querySelector('ion-button')!.addEventListener('click', () => action('root'));
    this.querySelector('#push')!.addEventListener('click', () => void nav.push('detail-page'));
  }
}
class DetailPage extends HTMLElement {
  connectedCallback() {
    if (this.children.length) return;
    this.innerHTML =
      '<ion-header><ion-toolbar><ion-buttons slot="start"><ion-back-button text="Back"></ion-back-button></ion-buttons><ion-title>Detail</ion-title><ion-buttons slot="end"><ion-button>Done</ion-button></ion-buttons></ion-toolbar></ion-header><ion-content><div class="actions"><button id="pop">Pop root</button></div></ion-content>';
    this.querySelector('ion-button')!.addEventListener('click', () => action('detail'));
    this.querySelector('#pop')!.addEventListener('click', () => void nav.pop());
  }
}
customElements.define('root-page', RootPage);
customElements.define('detail-page', DetailPage);
document.addEventListener(
  'ionViewWillEnter',
  (event) => {
    incoming = event.target as HTMLElement;
  },
  true,
);
document.addEventListener(
  'ionViewWillLeave',
  (event) => {
    outgoing = event.target as HTMLElement;
    state.phase = 'moving';
    state.cycles++;
  },
  true,
);
document.addEventListener(
  'ionViewDidEnter',
  () => {
    state.phase = 'idle';
  },
  true,
);
document.addEventListener('iosThemeVerticalBarsTransitionCanceled', () => {
  state.cancellations++;
  state.phase = 'idle';
});
const sample = () => {
  if (state.phase === 'moving') {
    state.samples++;
    state.samplesByCycle[state.cycles] = (state.samplesByCycle[state.cycles] ?? 0) + 1;
    state.maxProgress[state.cycles] = Math.max(
      state.maxProgress[state.cycles] ?? 0,
      (outgoing?.getBoundingClientRect().x ?? 0) / innerWidth,
    );
    const sources = [outgoing, incoming].flatMap((page) => [...(page?.querySelectorAll<HTMLElement>('ion-button, ion-back-button') ?? [])]);
    const exposed = sources.filter(
      (source) => getComputedStyle(source).visibility === 'visible' && !source.closest('.ion-page-hidden,.ion-page-invisible'),
    );
    if (exposed.length) {
      state.exposedWeb++;
      const value = `${state.cycles}:${exposed.map((source) => `${source.tagName}/${source.textContent}/${source.hasAttribute('data-native-ui-navigation-source')}/${source.closest('[data-native-ui-projected]')?.tagName}`).join('|')}`;
      if (!state.exposures.includes(value)) state.exposures.push(value);
    }
  }
  document.querySelector('#status')!.textContent = JSON.stringify(state);
  requestAnimationFrame(sample);
};
void createRuntime(document, plugin, { source: 'ionic' })
  .then(() => nav.setRoot('root-page', {}, { animated: false }))
  .then(sample)
  .catch((error) => {
    document.querySelector('#status')!.textContent = state.error = String(error);
  });
