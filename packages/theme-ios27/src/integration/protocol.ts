/// <reference lib="es2021.weakref" />
import type { Animation } from '@ionic/core/components';

// Versioned, plugin-free handshake shared by independently installed packages.
// Keep this structural protocol compatible across theme and Native UI releases.
export interface NativeSearchBinding {
  tabBar: HTMLElement;
  trigger: HTMLElement;
  footer: HTMLElement;
  active: boolean;
  focused: boolean;
}
export interface NativeUIShellIntegration {
  suspend(scopes: HTMLElement[]): Promise<(canceled?: boolean) => void>;
  search?(binding: NativeSearchBinding, active: boolean, focus?: boolean): Promise<boolean>;
}
interface Coordination {
  runtimes: WeakMap<
    Document,
    NativeUIShellIntegration & {
      connectTransition(animation: Animation, entering: HTMLElement, leaving?: HTMLElement): void;
    }
  >;
  searches: WeakMap<Document, WeakRef<NativeSearchBinding>[]>;
  cancellations: WeakSet<Animation>;
  metrics: { radius: number };
}
const key = Symbol.for('@rdlabo/native-ui-coordination/v1');
const scope = globalThis as typeof globalThis & { [key]?: Coordination };
export const coordination = (scope[key] ??= {
  runtimes: new WeakMap(),
  searches: new WeakMap(),
  cancellations: new WeakSet(),
  metrics: { radius: 0 },
});
