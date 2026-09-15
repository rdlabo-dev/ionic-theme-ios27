import { Component, OnInit } from '@angular/core';

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
  IonFooter,
  IonMenuButton,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonText,
  IonTitle,
  IonToolbar,
} from '@demo/ionic';

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.page.html',
  styleUrls: ['./toolbar.page.scss'],
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
    IonMenuButton,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonFooter,
  ],
})
export class ToolbarPage implements OnInit {
  constructor() {}

  ngOnInit() {}
}
