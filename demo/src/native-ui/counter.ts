import { defineNativeUI, type NativeUIExtension } from '@rdlabo/capacitor-native-ui';

const read: NativeUIExtension['read'] = (element) => ({
  props: { count: Number(element.getAttribute('data-count') ?? 0) },
  actions: { increment: element.querySelector<HTMLButtonElement>('button') },
});

export const counter = defineNativeUI({
  name: 'demo.counter',
  selector: '[data-native-counter]',
  // ion-content exposes its scrolling element through the public `scroll` part.
  scrollElement: (element: HTMLElement) =>
    element.closest('ion-content')?.shadowRoot?.querySelector<HTMLElement>('[part="scroll"]') ?? null,
  read,
});
export const accessoryCounter = defineNativeUI({
  name: 'demo.accessory-counter',
  selector: '[data-native-accessory-counter]',
  placement: 'tab-accessory',
  read,
});
