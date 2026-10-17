import { ChangeDetectionStrategy, AfterViewInit, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { MiniPlayerDemo } from './mini-player-demo';
import { mountNowPlaying } from '../../native-ui/mini-player';
import { IonButton, IonButtons, IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@demo/ionic';

@Component({
  selector: 'app-mini-player',
  imports: [IonButton, IonButtons, IonContent, IonHeader, IonModal, IonTitle, IonToolbar],
  templateUrl: './mini-player.component.html',
  styleUrl: './mini-player.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiniPlayerComponent implements AfterViewInit {
  readonly demo = inject(MiniPlayerDemo);
  readonly source = viewChild.required<ElementRef<HTMLElement>>('source');
  readonly #destroyRef = inject(DestroyRef);

  ngAfterViewInit() {
    this.#destroyRef.onDestroy(mountNowPlaying(this.source().nativeElement));
  }

  readonly playing = signal(true);
  readonly opened = signal(false);
  readonly title = 'Midnight Drive';
  readonly artist = 'The Coast';
}
