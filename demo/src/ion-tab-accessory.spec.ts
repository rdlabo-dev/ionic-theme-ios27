import { afterEach, expect, test } from 'vitest';
import { readCandidate } from '../../src/native/components';

const size = () => ({ x: 16, y: 700, width: 358, height: 56, top: 700, left: 16, right: 374, bottom: 756 }) as DOMRect;

const identify = (el: HTMLElement) => {
  if (el.matches('[data-tab-accessory="play"]') || el.tagName === 'ION-BUTTON') return 'play';
  if (el.matches('[data-tab-accessory="artwork"]') || el.tagName === 'IMG') return 'artwork';
  return 'accessory';
};

const mount = (playing = true) => {
  document.documentElement.style.cssText = 'display: block; visibility: visible; opacity: 1; transform: none';
  document.body.style.cssText = 'display: block; visibility: visible; opacity: 1; transform: none';
  document.body.innerHTML = `
    <ion-toolbar class="ios ios-theme-tab-accessory">
      <img data-tab-accessory="artwork" src="https://example.test/cover.jpg" alt="" />
      <ion-label>
        <h2 data-tab-accessory="title">Mahamudra</h2>
        <p data-tab-accessory="subtitle">Lama Ole</p>
      </ion-label>
      <ion-buttons slot="end">
        <span data-tab-accessory="time">
          <span data-tab-accessory="elapsed">1:09:29</span>
          <span data-tab-accessory="duration">3:04:05</span>
        </span>
        <ion-button data-tab-accessory="play">
          <ion-icon name="${playing ? 'pause' : 'play'}"></ion-icon>
        </ion-button>
      </ion-buttons>
      <ion-progress-bar value="0.4"></ion-progress-bar>
    </ion-toolbar>`;
  const toolbar = document.querySelector<HTMLElement>('ion-toolbar')!;
  const play = document.querySelector<HTMLElement>('ion-button')!;
  const icon = document.querySelector<HTMLElement>('ion-icon')!;
  const shadow = icon.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';
  for (const element of [toolbar, play, icon, ...Array.from(document.querySelectorAll<HTMLElement>('img, ion-label, ion-progress-bar'))]) {
    element.style.cssText = 'display: flex; visibility: visible; opacity: 1; width: 358px; height: 56px';
    element.getBoundingClientRect = size;
  }
  return toolbar;
};

afterEach(() => document.body.replaceChildren());

test('projects marked toolbar title, progress and play state', () => {
  const candidate = readCandidate(mount(true), identify);
  expect(candidate?.control.kind).toBe('ion-toolbar');
  expect(candidate?.control.title).toBe('Mahamudra');
  expect(candidate?.control.subtitle).toBe('Lama Ole');
  expect(candidate?.control.artworkUrl).toContain('cover.jpg');
  expect(candidate?.control.progress).toBe(0.4);
  expect(candidate?.control.elapsed).toBe('1:09:29');
  expect(candidate?.control.duration).toBe('3:04:05');
  expect(candidate?.control.items).toHaveLength(2);
  expect(candidate?.control.items[0].selected).toBe(true);
  expect(candidate?.control.items[1].label).toBe('Artwork');
  expect(candidate?.actions.get('accessory')).toBe(document.querySelector('ion-toolbar'));
  expect(candidate?.actions.get('play')).toBe(document.querySelector('ion-button'));
  expect(candidate?.actions.get('artwork')).toBe(document.querySelector('img'));
});

test('projects play without a hydrated ion-icon svg', () => {
  const toolbar = mount(true);
  document.querySelector('ion-icon')?.shadowRoot?.replaceChildren();
  const candidate = readCandidate(toolbar, identify);
  expect(candidate?.control.items).toHaveLength(2);
  expect(candidate?.control.items[0].selected).toBe(true);
});

test('projects play only when artwork is absent', () => {
  const toolbar = mount(true);
  document.querySelector('img')?.remove();
  const candidate = readCandidate(toolbar, identify);
  expect(candidate?.control.items).toHaveLength(1);
  expect(candidate?.control.items[0].id).toBe('play');
  expect(candidate?.actions.get('artwork')).toBeUndefined();
});

test('projects progress of 0', () => {
  const toolbar = mount(false);
  const bar = document.querySelector('ion-progress-bar')!;
  bar.setAttribute('value', '0');
  (bar as HTMLElement & { value?: number }).value = 0;
  const candidate = readCandidate(toolbar, identify);
  expect(candidate?.control.progress).toBe(0);
});

test('maps play icon to unselected and skips unmarked toolbars', () => {
  const candidate = readCandidate(mount(false), identify);
  expect(candidate?.control.items[0].selected).toBe(false);
  document.body.innerHTML = '<ion-toolbar class="ios"><ion-button slot="end"><svg></svg></ion-button></ion-toolbar>';
  const plain = document.querySelector<HTMLElement>('ion-toolbar')!;
  document.documentElement.style.cssText = 'display: block; visibility: visible; opacity: 1; transform: none';
  document.body.style.cssText = 'display: block; visibility: visible; opacity: 1; transform: none';
  plain.style.cssText = 'display: flex; visibility: visible; opacity: 1; width: 358px; height: 56px; transform: none';
  plain.getBoundingClientRect = size;
  expect(readCandidate(plain, () => 'plain')).toBeUndefined();
});

test('does not project an accessory inside ion-modal', () => {
  const toolbar = mount(true);
  const modal = document.createElement('ion-modal');
  modal.append(toolbar);
  document.body.append(modal);
  expect(readCandidate(toolbar, identify)).toBeUndefined();
});

test('projects a classic-preset toolbar', () => {
  const toolbar = mount(true);
  toolbar.classList.add('ios-theme-tab-accessory-classic');
  const candidate = readCandidate(toolbar, identify);
  expect(candidate?.control.kind).toBe('ion-toolbar');
  expect(candidate?.control.title).toBe('Mahamudra');
  expect(candidate?.control.progress).toBe(0.4);
});
