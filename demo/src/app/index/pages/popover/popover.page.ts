import { Component, inject, OnInit } from '@angular/core';

import { PopoverContentComponent } from './popover-content.component';

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
  IonPopover,
  IonText,
  IonTitle,
  IonToolbar,
  PopoverController,
} from '@demo/ionic';

@Component({
  selector: 'app-popover',
  templateUrl: './popover.page.html',
  styleUrls: ['./popover.page.scss'],
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
    IonButton,
    IonPopover,
    IonButtons,
    IonListHeader,
    IonNote,
  ],
})
export class PopoverPage implements OnInit {
  readonly popoverController = inject(PopoverController);

  async present(event: Event, scrollable = false) {
    const popover = await this.popoverController.create({
      component: PopoverContentComponent,
      componentProps: { scrollable },
      event,
      cssClass: scrollable ? 'demo-scrollable-popover' : 'demo-compact-popover',
    });
    await popover.present();
  }

  ngOnInit() {}
}
