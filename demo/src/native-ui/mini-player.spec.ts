import { expect, test } from 'vitest';
import { miniPlayer } from './mini-player';

test('the local reader derives playback props and separate click targets from Web state', () => {
  const source = document.createElement('section');
  source.innerHTML =
    '<button data-player-open><strong data-player-title>Track</strong><small data-player-artist>Artist</small></button><button data-player-toggle>Pause</button>';
  source.dataset['playing'] = 'true';
  source.dataset['elapsed'] = '84';
  source.dataset['duration'] = '225';
  const first = miniPlayer.read(source)!;
  expect(first.props).toEqual({ title: 'Track', artist: 'Artist', playing: true, elapsed: 84, duration: 225 });
  expect(first.actions?.['open']).toBe(source.querySelector('[data-player-open]'));
  expect(first.actions?.['toggle']).toBe(source.querySelector('[data-player-toggle]'));
  source.dataset['playing'] = 'false';
  expect(miniPlayer.read(source)?.props['playing']).toBe(false);
});
