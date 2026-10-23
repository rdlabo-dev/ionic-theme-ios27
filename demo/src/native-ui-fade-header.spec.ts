import { afterEach, expect, test } from 'vitest';
import {
  inFixedToolbar,
  verticalBarsActionCandidate,
  verticalBarsBackCandidate,
  verticalBarsOwned,
} from '../../packages/capacitor-native-ui/src/native/shared/dom';
import { prehideVerticalBarsToolbarSources } from '../../packages/capacitor-native-ui/src/native/prehide';

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.replaceChildren();
});

const fixture = (collapse: string, scrolling = false) => {
  const header = `<ion-header ${collapse}><ion-toolbar><ion-buttons slot="start"><ion-back-button></ion-back-button></ion-buttons><ion-buttons slot="end"><ion-button><ion-icon slot="icon-only"></ion-icon></ion-button></ion-buttons></ion-toolbar></ion-header>`;
  document.body.innerHTML = `<ion-app class="ios-theme-vertical-bars"><div class="ion-page">${scrolling ? `<ion-content>${header}</ion-content>` : header}</div></ion-app>`;
  const back = document.querySelector('ion-back-button') as HTMLElement;
  back.attachShadow({ mode: 'open' });
  const button = document.querySelector('ion-button') as HTMLElement;
  return { back, button };
};

for (const collapse of ['', 'collapse="fade"']) {
  test(`fixed ${collapse || 'ordinary'} header projects back and toolbar actions into the rail`, () => {
    const { back, button } = fixture(collapse);
    expect(inFixedToolbar(button)).toBe(true);
    expect(verticalBarsBackCandidate(back)).toBe(true);
    expect(verticalBarsActionCandidate(button)).toBe(true);
    stop = prehideVerticalBarsToolbarSources(document).stop;
    expect(verticalBarsOwned(back)).toBe(true);
    expect(verticalBarsOwned(button)).toBe(true);
    expect(back.classList.contains('native-ui-prehidden')).toBe(true);
  });
}

test('condense headers remain excluded from rail projection', () => {
  const { back, button } = fixture('collapse="condense"', true);
  expect(inFixedToolbar(button)).toBe(false);
  expect(verticalBarsBackCandidate(back)).toBe(false);
  expect(verticalBarsActionCandidate(button)).toBe(false);
  stop = prehideVerticalBarsToolbarSources(document).stop;
  expect(verticalBarsOwned(back)).toBe(false);
  expect(verticalBarsOwned(button)).toBe(false);
});

test('fade toolbar actions inside scrolling content remain on the Web', () => {
  const { button } = fixture('collapse="fade"', true);
  expect(inFixedToolbar(button)).toBe(false);
  expect(verticalBarsActionCandidate(button)).toBe(false);
});

test('fixed condense header remains excluded even outside scrolling content', () => {
  const { back, button } = fixture('collapse="condense"');
  expect(inFixedToolbar(button)).toBe(false);
  expect(verticalBarsBackCandidate(back)).toBe(false);
  expect(verticalBarsActionCandidate(button)).toBe(false);
});

test('fixed fade header also supports ordinary horizontal projection', () => {
  const { button } = fixture('collapse="fade"');
  document.querySelector('ion-app')!.classList.remove('ios-theme-vertical-bars');
  expect(inFixedToolbar(button)).toBe(true);
});

test('fade footer remains excluded', () => {
  const { back, button } = fixture('collapse="fade"');
  const footer = document.createElement('ion-footer');
  footer.setAttribute('collapse', 'fade');
  footer.append(document.querySelector('ion-toolbar')!);
  document.querySelector('ion-header')!.replaceWith(footer);
  expect(inFixedToolbar(button)).toBe(false);
  expect(verticalBarsBackCandidate(back)).toBe(false);
  expect(verticalBarsActionCandidate(button)).toBe(false);
});
