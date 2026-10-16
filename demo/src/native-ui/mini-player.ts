import { defineNativeUI } from '../../../src/native';

export const miniPlayer = defineNativeUI({
  name: 'demo.mini-player',
  selector: '[data-mini-player]',
  placement: 'tab-accessory',
  read(element) {
    return {
      props: {
        title: element.querySelector('[data-player-title]')?.textContent?.trim() ?? '',
        artist: element.querySelector('[data-player-artist]')?.textContent?.trim() ?? '',
        playing: element.dataset['playing'] === 'true',
        elapsed: Number(element.dataset['elapsed']),
        duration: Number(element.dataset['duration']),
      },
      actions: {
        open: element.querySelector<HTMLElement>('[data-player-open]'),
        toggle: element.querySelector<HTMLElement>('[data-player-toggle]'),
      },
    };
  },
});
