import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonModal,
  IonIcon,
  IonMenuButton,
} from '@demo/ionic';

@Component({
  selector: 'app-native-ui-shell',
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonModal,
    IonIcon,
    IonMenuButton,
  ],
  templateUrl: './native-ui-shell.page.html',
  styleUrl: './native-ui-shell.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NativeUIShellPage {
  readonly saves = signal(0);
  readonly github = signal(0);
  readonly refreshes = signal(0);
  readonly disabled = signal(false);
  readonly hidden = signal(false);
  readonly themeDisabled = signal(false);
  readonly fill = signal<'default' | 'clear' | 'solid' | 'outline'>('default');
  readonly fills = ['default', 'clear', 'solid', 'outline'] as const;
  readonly bands = Array.from({ length: 24 }, (_, index) => index + 1);
  readonly selected = signal<string | number>('one');
  readonly changes = signal(0);
  readonly modalOpen = signal(false);
  readonly increment = (value: number) => value + 1;

  save(event: Event) {
    event.preventDefault();
    this.saves.update((value) => value + 1);
  }
}
