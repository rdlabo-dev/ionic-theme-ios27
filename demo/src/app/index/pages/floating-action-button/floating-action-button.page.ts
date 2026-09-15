import { Component, OnInit } from '@angular/core';

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
} from '@demo/ionic';

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
export class FloatingActionButtonPage implements OnInit {
  constructor() {}

  ngOnInit() {}
}
