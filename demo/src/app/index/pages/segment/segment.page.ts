import { Component, ElementRef, inject, OnDestroy } from '@angular/core';

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
  IonSegment,
  IonSegmentButton,
  IonText,
  IonToolbar,
  ViewDidEnter,
  ViewDidLeave,
} from '@demo/ionic';
import { registeredEffect, registerSegmentEffect } from '@rdlabo/ionic-theme-ios27';

@Component({
  selector: 'app-segment',
  templateUrl: './segment.page.html',
  styleUrls: ['./segment.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    IonHeader,
    IonToolbar,
    FormsModule,
    IonBackButton,
    IonIcon,
    IonItem,
    IonItemGroup,
    IonLabel,
    IonList,
    IonText,
    IonSegment,
    IonSegmentButton,
    IonButtons,
    IonButton,
  ],
})
export class SegmentPage implements OnDestroy, ViewDidEnter, ViewDidLeave {
  readonly #el = inject(ElementRef);
  readonly registeredGestures: registeredEffect[] = [];
  ionViewDidEnter() {
    this.#el.nativeElement.querySelectorAll('ion-segment').forEach((item: HTMLElement) => {
      const registerGesture = registerSegmentEffect(item);
      if (registerGesture) {
        this.registeredGestures.push(registerGesture);
      }
    });
  }

  ngOnDestroy() {
    this.ionViewDidLeave();
  }

  ionViewDidLeave() {
    this.registeredGestures.splice(0).forEach((gesture) => gesture.destroy());
  }
}
