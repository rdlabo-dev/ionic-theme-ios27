import { Component, AfterViewInit } from '@angular/core';

import { IonButton, IonLabel, IonRange, IonSegment, IonSegmentButton, IonTabBar, IonTabButton, IonToggle } from '@demo/ionic';

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

/**
 * Dense parity fixture rendered inside the real demo app. The AppDelegate
 * mounts UIKit reference controls at matching positions in parity mode; this
 * page posts its DOM frames through the `parity` message handler so XCTest can
 * compare the projection against UIKit in the same run.
 */
@Component({
  selector: 'app-native-glass-poc',
  templateUrl: './native-glass-poc.page.html',
  styleUrls: ['./native-glass-poc.page.scss'],
  standalone: true,
  imports: [IonButton, IonLabel, IonRange, IonSegment, IonSegmentButton, IonTabBar, IonTabButton, IonToggle],
})
export class NativeGlassPocPage implements AfterViewInit {
  #rect(el: Element): ParityFrame {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }

  #rel(el: Element, origin: ParityFrame): ParityFrame {
    const r = el.getBoundingClientRect();
    return { x: r.x - origin.x, y: r.y - origin.y, w: r.width, h: r.height };
  }

  #collect(): Record<string, unknown> {
    const metrics: Record<string, unknown> = {};
    const doc = document;

    // Compare the visual control surface, not the element's margin box.
    const surface = (id: string) =>
      doc.getElementById(id)!.shadowRoot?.querySelector('[part="native"], .button-native') ?? doc.getElementById(id)!;
    metrics['glass'] = this.#rect(surface('Glass'));
    metrics['prominent'] = this.#rect(surface('Prominent'));
    metrics['toggle'] = this.#rect(doc.getElementById('Toggle')!);

    const segment = doc.getElementById('Segment')!;
    const segmentFrame = this.#rect(segment);
    metrics['segment'] = {
      frame: segmentFrame,
      items: [...segment.querySelectorAll('ion-segment-button')].map((b) => this.#rel(b, segmentFrame)),
    };

    const range = doc.getElementById('Range')!;
    const rangeFrame = this.#rect(range);
    const bar = range.shadowRoot?.querySelector('[part="bar"], .range-bar');
    const knob = range.shadowRoot?.querySelector('[part="knob"], .range-knob-handle');
    metrics['range'] = {
      frame: rangeFrame,
      bar: bar ? this.#rel(bar, rangeFrame) : null,
      knob: knob ? this.#rel(knob, rangeFrame) : null,
    };

    const tabs = doc.getElementById('Tabs')!;
    const tabsFrame = this.#rect(tabs);
    metrics['tabs'] = {
      frame: tabsFrame,
      items: [...tabs.querySelectorAll('ion-tab-button')].map((b) => this.#rel(b, tabsFrame)),
    };

    return metrics;
  }

  ngAfterViewInit(): void {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            window.webkit?.messageHandlers?.parity?.postMessage({ metrics: this.#collect() });
          } catch {
            // Reporting must never break the page.
          }
        }, 400);
      }),
    );
  }
}
