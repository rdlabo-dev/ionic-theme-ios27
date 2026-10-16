import { expect, test } from 'vitest';
import { miniPlayer, mountNowPlaying } from './mini-player';

test('plain data attributes drive both renderers and Web actions without native', async () => {
  const source = document.createElement('section');
  source.setAttribute('data-mini-player', '');
  source.setAttribute('data-title', '<b>Track</b>');
  source.setAttribute('data-artist', 'Artist');
  source.setAttribute('data-playing', 'true');
  document.body.append(source);
  const destroy = mountNowPlaying(source);
  try {
    expect(source.querySelector('strong')?.textContent).toBe('<b>Track</b>');
    expect(source.querySelector('strong b')).toBeNull();
    expect(miniPlayer.read(source)?.props).toEqual({ title: '<b>Track</b>', artist: 'Artist', playing: true });
    let opens = 0;
    let toggles = 0;
    source.addEventListener('openNowPlaying', () => {
      opens++;
    });
    source.addEventListener('togglePlayback', () => {
      toggles++;
      source.setAttribute('data-playing', 'false');
    });
    const actions = miniPlayer.read(source)!.actions!;
    actions['toggle']!.click();
    await vi.waitFor(() => expect(actions['toggle']!.getAttribute('aria-label')).toBe('Play'));
    expect(toggles).toBe(1);
    expect(opens).toBe(0);
    expect(miniPlayer.read(source)?.props['playing']).toBe(false);
    actions['open']!.click();
    expect(opens).toBe(1);
    destroy();
    actions['open']!.click();
    expect(opens).toBe(1);
    expect(source.childNodes).toHaveLength(0);
    const remount = mountNowPlaying(source);
    expect(source.querySelector('[data-player-toggle]')?.getAttribute('aria-label')).toBe('Play');
    remount();
  } finally {
    destroy();
    source.remove();
  }
});
