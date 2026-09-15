import { Component, DOCUMENT, ElementRef, inject, OnDestroy } from '@angular/core';

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
  ViewDidLeave,
} from '@demo/ionic';
import {
  attachTabBarSearchable,
  registeredEffect,
  registerButtonEffect,
  TabBarSearchableFunction,
  TabBarSearchableType,
} from '../../../../src';

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
export class AlbumPage implements ViewDidEnter, ViewDidLeave, OnDestroy {
  readonly sourceIonIcons = [...Array(60)].map((_, i) => i);

  readonly document = inject(DOCUMENT);
  readonly el = inject(ElementRef);
  searchableFun: TabBarSearchableFunction | undefined;
  private fabEffect: registeredEffect | undefined;

  ionViewDidEnter() {
    this.fabEffect?.destroy();
    this.fabEffect = registerButtonEffect(this.el.nativeElement.querySelector('ion-fab-button'));
    this.searchableFun = attachTabBarSearchable(
      this.document.querySelector<HTMLElement>('ion-tab-bar')!,
      this.el.nativeElement.querySelector('ion-fab-button'),
      this.el.nativeElement.querySelector('ion-footer'),
    );
  }

  ionViewDidLeave() {
    this.fabEffect?.destroy();
    this.fabEffect = undefined;
  }

  ngOnDestroy() {
    this.ionViewDidLeave();
  }

  present(event: Event) {
    this.searchableFun!(event, TabBarSearchableType.Enter);
  }

  dismiss(event: Event) {
    this.searchableFun!(event, TabBarSearchableType.Leave);
  }
}
