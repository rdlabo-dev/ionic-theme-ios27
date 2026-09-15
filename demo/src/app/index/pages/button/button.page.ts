import { Component, inject, OnInit } from '@angular/core';

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
  NavController,
} from '@demo/ionic';

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
export class ButtonPage implements OnInit {
  readonly navCtrl = inject(NavController);
  constructor() {}

  ngOnInit() {}

  navigateTo() {
    return this.navCtrl.navigateForward('/main/index/action-sheet');
  }
}
