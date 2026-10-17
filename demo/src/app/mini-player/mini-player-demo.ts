import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MiniPlayerDemo {
  readonly enabled = signal(false);
}
