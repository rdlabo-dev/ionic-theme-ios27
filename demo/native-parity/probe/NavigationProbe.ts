import { defineCustomElement as nav } from '@ionic/core/components/ion-nav.js';
import { defineCustomElement as header } from '@ionic/core/components/ion-header.js';
import { defineCustomElement as toolbar } from '@ionic/core/components/ion-toolbar.js';
import { defineCustomElement as title } from '@ionic/core/components/ion-title.js';
import { defineCustomElement as content } from '@ionic/core/components/ion-content.js';
import { defineCustomElement as buttons } from '@ionic/core/components/ion-buttons.js';
import { defineCustomElement as back } from '@ionic/core/components/ion-back-button.js';
import { defineCustomElement as list } from '@ionic/core/components/ion-list.js';
import { defineCustomElement as item } from '@ionic/core/components/ion-item.js';
import { defineCustomElement as group } from '@ionic/core/components/ion-item-group.js';
import { defineCustomElement as label } from '@ionic/core/components/ion-label.js';
import { iosTransitionAnimation } from '../../../src';

export const setupNavigation = async (root: HTMLElement) => {
  // Match UITableView's grouped background without imposing app colors on the theme.
  const dark = document.documentElement.classList.contains('ion-palette-dark');
  root.style.setProperty('--ion-background-color', dark ? '#000' : '#f2f2f7');
  root.style.setProperty('--ion-item-background', dark ? '#1c1c1e' : '#fff');
  [nav, header, toolbar, title, content, buttons, back, list, item, group, label].forEach((define) => define());
  customElements.define(
    'parity-home',
    class extends HTMLElement {
      connectedCallback() {
        this.classList.add('ion-page', 'ios');
        this.innerHTML = `<ion-header translucent="true"><ion-toolbar><ion-title>Home</ion-title><ion-buttons slot="end"><ion-button id="Next">Next</ion-button></ion-buttons></ion-toolbar></ion-header>
        <ion-content fullscreen="true"><ion-header collapse="condense"><ion-toolbar><ion-title size="large">Home</ion-title></ion-toolbar></ion-header>
        <ion-list inset="true"><ion-item-group>${Array.from({ length: 8 }, (_, i) => `<ion-item><ion-label>Row ${i + 1}</ion-label></ion-item>`).join('')}</ion-item-group></ion-list></ion-content>`;
        this.querySelector('#Next')!.addEventListener('click', () => {
          void root.querySelector('ion-nav')!.push('parity-detail');
        });
      }
    },
  );
  customElements.define(
    'parity-detail',
    class extends HTMLElement {
      connectedCallback() {
        this.classList.add('ion-page', 'ios');
        this.innerHTML = `<ion-header translucent="true"><ion-toolbar><ion-buttons slot="start"><ion-back-button text="Home"></ion-back-button></ion-buttons><ion-title>Detail</ion-title></ion-toolbar></ion-header>
        <ion-content fullscreen="true"><div style="position:absolute;inset:0;display:grid;place-items:center">Detail content</div></ion-content>`;
      }
    },
  );
  const element = root.querySelector('ion-nav')!;
  element.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  element.animation = iosTransitionAnimation;
  await element.setRoot('parity-home');
};
