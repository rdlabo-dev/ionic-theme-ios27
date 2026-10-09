import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@demo/ionic';

@Component({
  selector: 'app-native-ui-shell-child',
  imports: [IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/main/index/native-ui-shell"></ion-back-button>
        </ion-buttons>
        <ion-title>Child</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <p>No segment. Native back should remain; the parent segment should not cover this page.</p>
    </ion-content>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NativeUIShellChildPage {}
