import { Component, input, signal } from '@angular/core';
import { IonButton, IonContent, IonItem, IonItemGroup, IonLabel, IonList } from '@demo/ionic';

@Component({
  selector: 'app-popover-content',
  standalone: true,
  imports: [IonButton, IonContent, IonItem, IonItemGroup, IonLabel, IonList],
  template: `
    <ion-content>
      <ion-list>
        <ion-item-group>
          <ion-item
            ><ion-label>Count: {{ count() }}</ion-label
            ><ion-button (click)="count.update(increment)">Increment</ion-button></ion-item
          >
          @if (scrollable()) {
            @for (row of rows; track row) {
              <ion-item
                ><ion-label>Row {{ row }}</ion-label></ion-item
              >
            }
          }
        </ion-item-group>
      </ion-list>
    </ion-content>
  `,
  styles: [':host { display: block; height: 100%; }'],
})
export class PopoverContentComponent {
  readonly scrollable = input(false);
  readonly count = signal(0);
  readonly rows = Array.from({ length: 20 }, (_, index) => index + 1);
  readonly increment = (value: number) => value + 1;
}
