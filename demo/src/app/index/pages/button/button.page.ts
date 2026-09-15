import { Component, ElementRef, inject, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemGroup,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonText,
  IonTitle,
  IonToolbar,
  ViewDidEnter,
  ViewDidLeave,
} from '@demo/ionic';
import { registeredEffect, registerButtonEffect } from '../../../../../../src';

@Component({
  selector: 'app-button',
  templateUrl: './button.page.html',
  styleUrls: ['./button.page.scss'],
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
    IonButtons,
    IonButton,
    IonNote,
    IonListHeader,
  ],
})
export class ButtonPage implements OnInit, ViewDidEnter, ViewDidLeave {
  readonly #el = inject(ElementRef);
  readonly registeredGestures: registeredEffect[] = [];
  constructor() {}

  ngOnInit() {}

  ionViewDidEnter() {
    this.#el.nativeElement.querySelectorAll('ion-button, ion-back-button').forEach((item: HTMLElement) => {
      const registerGesture = registerButtonEffect(item);
      if (registerGesture) {
        this.registeredGestures.push(registerGesture);
      }
    });
  }

  ionViewDidLeave() {
    this.registeredGestures.splice(0).forEach((gesture) => gesture.destroy());
  }
}
