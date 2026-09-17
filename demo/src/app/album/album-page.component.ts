import { Component, DOCUMENT, ElementRef, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonFooter,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonTitle,
  IonToolbar,
  ViewWillEnter,
} from '@demo/ionic';
import { attachTabBarSearchable, TabBarSearchableFunction, TabBarSearchableType } from '../../../../src';

@Component({
  selector: 'app-album-page',
  templateUrl: './album-page.component.html',
  styleUrls: ['./album-page.component.scss'],
  imports: [
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    FormsModule,
    IonIcon,
    IonButton,
    IonButtons,
    IonFab,
    IonFabButton,
    IonFooter,
    IonSearchbar,
  ],
})
export class AlbumPage implements ViewWillEnter {
  readonly sourceIonIcons = [...Array(60)].map((_, i) => i);

  readonly document = inject(DOCUMENT);
  readonly el = inject(ElementRef);
  searchableFun: TabBarSearchableFunction | undefined;
  #attachedFooter?: HTMLElement;

  ionViewWillEnter() {
    // Register before the page transition paints so searchable projection can
    // replace ordinary UITabBar without a Web flash after didEnter.
    const tabBar = this.document.querySelector<HTMLElement>('ion-tab-bar')!;
    const fab = this.el.nativeElement.querySelector('ion-fab-button') as HTMLElement;
    const footer = this.el.nativeElement.querySelector('ion-footer') as HTMLElement;
    if (this.searchableFun && this.#attachedFooter === footer) return;
    this.#attachedFooter = footer;
    this.searchableFun = attachTabBarSearchable(tabBar, fab, footer);
  }

  present(event: Event) {
    this.searchableFun!(event, TabBarSearchableType.Enter);
  }

  dismiss(event: Event) {
    this.searchableFun!(event, TabBarSearchableType.Leave);
  }
}
