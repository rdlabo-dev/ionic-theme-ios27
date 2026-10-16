import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@demo/ionic';

@Component({
  selector: 'app-mini-player',
  imports: [IonContent, IonHeader, IonModal, IonTitle, IonToolbar],
  templateUrl: './mini-player.component.html',
  styleUrl: './mini-player.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiniPlayerComponent {
  readonly playing = signal(true);
  readonly opened = signal(false);
  readonly lift = signal(0);
  readonly title = 'Now Playing';
  readonly artist = 'Demo Artist';
  readonly elapsed = 84;
  readonly duration = 225;
  #start?: { id: number; x: number; y: number };
  #swiped = false;

  start(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return;
    this.#swiped = false;
    this.#start = { id: event.pointerId, x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  move(event: PointerEvent) {
    if (this.#start?.id !== event.pointerId) return;
    const dy = event.clientY - this.#start.y;
    this.lift.set(Math.abs(dy) > Math.abs(event.clientX - this.#start.x) ? Math.max(-64, Math.min(0, dy)) : 0);
  }

  end(event: PointerEvent) {
    if (this.#start?.id !== event.pointerId) return;
    this.#swiped = this.lift() < -32;
    this.cancel();
    if (this.#swiped) this.opened.set(true);
  }

  cancel() {
    this.#start = undefined;
    this.lift.set(0);
  }

  open(event: MouseEvent) {
    if (!this.#swiped || event.detail === 0) this.opened.set(true);
    this.#swiped = false;
  }
}
