import { Component, effect, ElementRef, inject, input, OnInit } from '@angular/core';

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
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@demo/ionic';
import { modalTypes } from '../../../overlay-types';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-modal',
  templateUrl: './modal.page.html',
  styleUrls: ['./modal.page.scss'],
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
  ],
})
export class ModalPage implements OnInit {
  readonly #route = inject(ActivatedRoute);
  readonly #params = toSignal(this.#route.queryParams);
  readonly overlayCtrl = inject(ModalController);
  readonly #el = inject(ElementRef);

  readonly isModal = input<boolean>();

  constructor() {
    effect(async () => {
      if (!this.isModal() && this.#params()?.['type']) {
        await this.present(this.#params()?.['type']);
      }
    });
  }

  ngOnInit() {}

  async present(type: (typeof modalTypes)[number]) {
    const modalDefault = {
      component: ModalPage,
      componentProps: {
        isModal: true,
      },
    };
    const applyConfig = ((type) => {
      if (type === 'card') {
        return {
          ...modalDefault,
          presentingElement: this.#el.nativeElement,
        };
      } else if (type === 'sheet') {
        return {
          ...modalDefault,
          breakpoints: [0, 0.5, 0.8],
          initialBreakpoint: 0.8,
          expandToScroll: false,
        };
      }
      return modalDefault;
    })(type);
    const modal = await this.overlayCtrl.create(applyConfig);
    await modal.present();
  }
}
