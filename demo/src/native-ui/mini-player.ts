import { defineNativeUI } from '@rdlabo/capacitor-native-ui';

const props = (element: HTMLElement) => ({
  title: element.getAttribute('data-title') ?? '',
  artist: element.getAttribute('data-artist') ?? '',
  playing: element.getAttribute('data-playing') === 'true',
});

/** The Web element is the source and fallback for the matching app-local SwiftUI View. */
export const miniPlayer = defineNativeUI({
  name: 'demo.mini-player',
  selector: '[data-mini-player]',
  read(element) {
    return {
      props: props(element),
      actions: {
        open: element.querySelector<HTMLElement>('[data-player-open]'),
        toggle: element.querySelector<HTMLElement>('[data-player-toggle]'),
      },
    };
  },
});

/** Render an empty ordinary element from data-* state. Return the matching teardown. */
export function mountNowPlaying(element: HTMLElement): () => void {
  if (element.hasChildNodes()) throw new Error('Now Playing needs an empty render target');
  const listeners = new AbortController();
  const { signal } = listeners;
  let start: { id: number; x: number; y: number } | undefined;
  let swiped = false;
  // Only static markup is HTML. Application values are assigned with textContent.
  element.innerHTML = `
        <style>
          [data-mini-player] { display:flex; align-items:center; gap:4px; min-height:48px; border-radius:24px;
            color:var(--ion-text-color,#111); background:var(--ion-background-color,#fff); box-shadow:0 2px 16px #0002; }
          [data-mini-player] button { color:inherit; background:transparent; border:0; min-height:44px; padding:6px 10px; cursor:pointer; }
          [data-mini-player] [data-player-open] { display:flex; flex:1; align-items:center; gap:10px; min-width:0; text-align:start; touch-action:pan-x; }
          [data-mini-player] .artwork { flex:none; width:32px; height:32px; border-radius:6px; background:
            linear-gradient(to bottom,transparent 62%,#1a2b45 62%),radial-gradient(circle at 62% 42%,#ffc28c 0 22%,transparent 23%),linear-gradient(135deg,#212959,#b34f6e); }
          [data-mini-player] .metadata { min-width:0; }
          [data-mini-player] strong, [data-mini-player] small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          [data-mini-player] strong { font-size:15px; font-weight:600; }
          [data-mini-player] small { opacity:.6; font-size:12px; margin-top:2px; }
          [data-mini-player] [data-player-toggle] { display:grid; place-items:center; flex:none; width:44px; margin-inline-end:2px; padding:0; }
        </style>
        <button type="button" data-player-open aria-label="Open Now Playing">
          <span class="artwork" aria-hidden="true"></span>
          <span class="metadata"><strong></strong><small></small></span>
        </button>
        <button type="button" data-player-toggle><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor"/></svg></button>`;
  const children = Array.from(element.childNodes);
  const open = element.querySelector<HTMLButtonElement>('[data-player-open]')!;
  const toggle = element.querySelector<HTMLButtonElement>('[data-player-toggle]')!;
  const emitOpen = () => element.dispatchEvent(new CustomEvent('openNowPlaying', { bubbles: true }));
  open.addEventListener(
    'click',
    (event) => {
      if (!swiped || event.detail === 0) emitOpen();
      swiped = false;
    },
    { signal },
  );
  toggle.addEventListener(
    'click',
    () => {
      element.dispatchEvent(new CustomEvent('togglePlayback', { bubbles: true }));
    },
    { signal },
  );
  open.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      swiped = false;
      start = { id: event.pointerId, x: event.clientX, y: event.clientY };
      open.setPointerCapture(event.pointerId);
    },
    { signal },
  );
  open.addEventListener(
    'pointerup',
    (event) => {
      if (start?.id !== event.pointerId) return;
      const dy = event.clientY - start.y;
      swiped = dy < -32 && Math.abs(dy) > Math.abs(event.clientX - start.x);
      start = undefined;
      if (swiped) emitOpen();
    },
    { signal },
  );
  open.addEventListener(
    'pointercancel',
    () => {
      start = undefined;
    },
    { signal },
  );
  const render = () => {
    const state = props(element);
    element.querySelector('strong')!.textContent = state.title;
    element.querySelector('small')!.textContent = state.artist;
    toggle.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    element.querySelector('path')!.setAttribute('d', state.playing ? 'M6 4h4v16H6zm8 0h4v16h-4z' : 'M7 3v18l15-9z');
  };
  const observer = new MutationObserver(render);
  observer.observe(element, { attributes: true, attributeFilter: ['data-title', 'data-artist', 'data-playing'] });
  render();
  return () => {
    observer.disconnect();
    listeners.abort();
    children.forEach((child) => child.parentNode === element && child.remove());
  };
}
