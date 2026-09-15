import { Component, ElementRef, inject, OnDestroy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonFabList,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemGroup,
  IonLabel,
  IonList,
  IonText,
  IonTitle,
  IonToolbar,
  ViewDidEnter,
  ViewDidLeave,
} from '@demo/ionic';
import { registeredEffect, registerButtonEffect } from '../../../../../../src';

@Component({
  selector: 'app-floating-action-button',
  templateUrl: './floating-action-button.page.html',
  styleUrls: ['./floating-action-button.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    FormsModule,
    IonBackButton,
    IonIcon,
    IonItem,
    IonItemGroup,
    IonLabel,
    IonList,
    IonText,
    IonFab,
    IonFabButton,
    IonFabList,
    IonButtons,
  ],
})
export class FloatingActionButtonPage implements ViewDidEnter, ViewDidLeave, OnDestroy {
  readonly #el = inject(ElementRef<HTMLElement>);
  readonly registeredGestures: registeredEffect[] = [];
  ionViewDidEnter() {
    this.#el.nativeElement.querySelectorAll<HTMLElement>('ion-fab-button').forEach((button) => {
      const effect = registerButtonEffect(button);
      if (effect) this.registeredGestures.push(effect);
    });
  }
  ionViewDidLeave() {
    this.registeredGestures.splice(0).forEach((effect) => effect.destroy());
  }
  ngOnDestroy() {
    this.ionViewDidLeave();
  }
}
