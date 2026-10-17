import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IonBackButton, IonToggle, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@demo/ionic';
import { MiniPlayerDemo } from './mini-player-demo';

@Component({
  selector: 'app-native-ui-extension-page',
  imports: [IonBackButton, IonToggle, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar],
  templateUrl: './native-ui-extension.page.html',
  styleUrl: './native-ui-extension.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NativeUIExtensionPage {
  readonly demo = inject(MiniPlayerDemo);
}
