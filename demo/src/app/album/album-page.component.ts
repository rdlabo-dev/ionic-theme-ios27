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
  ViewDidEnter,
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
export class AlbumPage implements ViewDidEnter {
  readonly sourceIonIcons = [...Array(60)].map((_, i) => i);

  readonly document = inject(DOCUMENT);
  readonly el = inject(ElementRef);
  searchableFun: TabBarSearchableFunction | undefined;

  ionViewDidEnter() {
    this.searchableFun = attachTabBarSearchable(
      this.document.querySelector<HTMLElement>('ion-tab-bar')!,
      this.el.nativeElement.querySelector('ion-fab-button'),
      this.el.nativeElement.querySelector('ion-footer'),
    );
  }

  present(event: Event) {
    this.searchableFun!(event, TabBarSearchableType.Enter);
  }

  dismiss(event: Event) {
    this.searchableFun!(event, TabBarSearchableType.Leave);
  }
}
