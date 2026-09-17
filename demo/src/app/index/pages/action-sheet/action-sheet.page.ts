import { Component, effect, inject, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import {
  ActionSheetController,
  IonBackButton,
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
} from '@demo/ionic';
import { actionSheetUtil } from './action-sheet.util';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { actionSheetTypes } from '../../../overlay-types';

@Component({
  selector: 'app-action-sheet',
  templateUrl: './action-sheet.page.html',
  styleUrls: ['./action-sheet.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    FormsModule,
    IonBackButton,
    IonList,
    IonItem,
    IonItemGroup,
    IonLabel,
    IonIcon,
    IonText,
    IonButtons,
  ],
})
export class ActionSheetPage implements OnInit {
  readonly #route = inject(ActivatedRoute);
  readonly #params = toSignal(this.#route.queryParams);
  readonly overlayCtrl = inject(ActionSheetController);

  constructor() {
    effect(async () => {
      if (this.#params()?.['type']) {
        await this.present(this.#params()?.['type']);
      }
    });
  }

  ngOnInit() {}

  async present(type: (typeof actionSheetTypes)[number]) {
    const applyConfig = ((type) => {
      if (type === 'preferred') {
        return {
          ...actionSheetUtil(),
          buttons: actionSheetUtil().buttons.map((button) => (button.text === 'Share' ? { ...button, role: 'preferred' } : button)),
        };
      } else if (type === 'button-only') {
        return {
          ...actionSheetUtil(),
          header: undefined,
          subHeader: undefined,
        };
      } else if (type === 'no-cancel') {
        return {
          ...actionSheetUtil(),
          buttons: actionSheetUtil().buttons.filter((button) => button.role !== 'cancel'),
        };
      }
      return actionSheetUtil();
    })(type);
    const actionSheet = await this.overlayCtrl.create(applyConfig);
    console.log(applyConfig);
    await actionSheet.present().then(() => console.log(type));
  }
}
