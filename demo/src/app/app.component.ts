import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@demo/ionic';
import { addIcons } from 'ionicons';
import * as allIcons from 'ionicons/icons';

@Component({
  selector: 'app-root',
  imports: [IonRouterOutlet, IonApp],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  readonly #router = inject(Router);

  constructor() {
    addIcons(allIcons);
  }

  ngOnInit(): void {
    // In parity mode the native harness registers this message handler;
    // navigate to the fixture page so XCTest sees a deterministic layout.
    const timer = setInterval(() => {
      if ((window as any).webkit?.messageHandlers?.parity) {
        clearInterval(timer);
        void this.#router.navigateByUrl('/native-glass-poc');
      }
    }, 200);
    setTimeout(() => clearInterval(timer), 10_000);
  }
}
