import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@demo/ionic';
import { addIcons } from 'ionicons';
import * as allIcons from 'ionicons/icons';

interface ParityFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

declare global {
  interface Window {
    webkit?: { messageHandlers?: { parity?: { postMessage(body: unknown): void } } };
  }
}

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
    // navigate to the audit page so XCTest sees a deterministic layout.
    const timer = setInterval(() => {
      const parity = (window as any).webkit?.messageHandlers?.parity;
      if (parity) {
        clearInterval(timer);
        void this.#router.navigateByUrl('/main/index/native-ui-shell').then(() => this.#report());
      }
    }, 200);
    setTimeout(() => clearInterval(timer), 10_000);
  }

  #rect(el: Element): ParityFrame {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }

  #rel(el: Element, origin: ParityFrame): ParityFrame {
    const r = el.getBoundingClientRect();
    return { x: r.x - origin.x, y: r.y - origin.y, w: r.width, h: r.height };
  }

  #collect(): Record<string, unknown> {
    const doc = document;
    const metrics: Record<string, unknown> = {};

    // Compare the visual control surface, not the element's margin box.
    const surface = (el: Element | null) => el?.shadowRoot?.querySelector('[part="native"], .button-native') ?? el;

    const save = doc.querySelector('ion-button[type="submit"]');
    if (save) metrics['save'] = this.#rect(surface(save)!);

    const segment = doc.querySelector('ion-segment');
    if (segment) {
      const segmentFrame = this.#rect(segment);
      metrics['segment'] = {
        frame: segmentFrame,
        items: [...segment.querySelectorAll('ion-segment-button')].map((b) => this.#rel(b, segmentFrame)),
      };
    }

    // The shell's real ion-tab-bar, not a page-level fixture.
    const tabs = doc.querySelector('ion-tab-bar');
    if (tabs) {
      const tabsFrame = this.#rect(tabs);
      metrics['tabs'] = {
        frame: tabsFrame,
        items: [...tabs.querySelectorAll('ion-tab-button')].map((b) => this.#rel(b, tabsFrame)),
      };
    }

    return metrics;
  }

  // Give the audit page two frames to lay out before measuring.
  #report() {
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          (window as any).webkit?.messageHandlers?.parity?.postMessage({ metrics: this.#collect() });
        } catch {
          // Reporting must never break the page.
        }
      }, 500);
    });
  }
}
