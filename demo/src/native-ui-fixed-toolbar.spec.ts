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

const fixture = (tag: string, attributes = '', scrolling = false) => {
  const surface = `<${tag} ${attributes}><ion-toolbar><ion-buttons slot="start"><ion-back-button></ion-back-button></ion-buttons><ion-buttons slot="end"><ion-button><ion-icon slot="icon-only"></ion-icon></ion-button></ion-buttons></ion-toolbar></${tag}>`;
  document.body.innerHTML = `<ion-app class="ios-theme-vertical-bars"><div class="ion-page">${scrolling ? `<ion-content>${surface}</ion-content>` : surface}</div></ion-app>`;
  const back = document.querySelector('ion-back-button') as HTMLElement;
  back.attachShadow({ mode: 'open' });
  const button = document.querySelector('ion-button') as HTMLElement;
  return { back, button };
};

for (const tag of ['ion-header', 'ion-footer']) {
  for (const attributes of ['', 'collapse="fade"']) {
    test(`fixed ${tag} ${attributes} supports horizontal and rail controls`, () => {
      const { back, button } = fixture(tag, attributes);
      document.querySelector('ion-app')!.classList.remove('ios-theme-vertical-bars');
      expect(inFixedToolbar(button)).toBe(true);
      document.querySelector('ion-app')!.classList.add('ios-theme-vertical-bars');
      expect(inFixedToolbar(button)).toBe(true);
      expect(verticalBarsBackCandidate(back)).toBe(true);
      expect(verticalBarsActionCandidate(button)).toBe(true);
      stop = prehideVerticalBarsToolbarSources(document).stop;
      expect(verticalBarsOwned(back)).toBe(true);
      expect(verticalBarsOwned(button)).toBe(true);
      expect(back.classList.contains('native-ui-prehidden')).toBe(true);
    });

    test(`scrolling ${tag} ${attributes} stays Web-owned`, () => {
      const { back, button } = fixture(tag, attributes, true);
      expect(inFixedToolbar(button)).toBe(false);
      expect(verticalBarsBackCandidate(back)).toBe(false);
      expect(verticalBarsActionCandidate(button)).toBe(false);
      stop = prehideVerticalBarsToolbarSources(document).stop;
      expect(verticalBarsOwned(back)).toBe(false);
      expect(verticalBarsOwned(button)).toBe(false);
      expect(back.classList.contains('native-ui-prehidden')).toBe(false);
    });
  }
}

for (const attributes of ['collapse="condense"', 'class="header-collapse-condense"']) {
  test(`${attributes} is excluded in both layouts even before content placement`, () => {
    const { back, button } = fixture('ion-header', attributes);
    expect(inFixedToolbar(button)).toBe(false);
    expect(verticalBarsBackCandidate(back)).toBe(false);
    expect(verticalBarsActionCandidate(button)).toBe(false);
    document.querySelector('ion-app')!.classList.remove('ios-theme-vertical-bars');
    expect(inFixedToolbar(button)).toBe(false);
  });
}

for (const condenseFirst of [true, false]) {
  test(`fixed back wins over its condense duplicate regardless of DOM order (${condenseFirst})`, () => {
    const { back } = fixture('ion-header', 'collapse="fade"');
    const page = document.querySelector('.ion-page')!;
    const content = document.createElement('ion-content');
    content.innerHTML = '<ion-header collapse="condense"><ion-toolbar><ion-back-button></ion-back-button></ion-toolbar></ion-header>';
    const duplicate = content.querySelector('ion-back-button') as HTMLElement;
    duplicate.attachShadow({ mode: 'open' });
    if (condenseFirst) page.prepend(content);
    else page.append(content);
    expect(verticalBarsBackCandidate(back)).toBe(true);
    expect(verticalBarsBackCandidate(duplicate)).toBe(false);
    stop = prehideVerticalBarsToolbarSources(document).stop;
    expect(verticalBarsOwned(back)).toBe(true);
    expect(verticalBarsOwned(duplicate)).toBe(false);
  });
}

test('a standalone routed-content back button retains dedicated rail support', () => {
  fixture('ion-header');
  document.querySelector('.ion-page')!.innerHTML = '<ion-content><ion-back-button></ion-back-button></ion-content>';
  const back = document.querySelector('ion-back-button') as HTMLElement;
  back.attachShadow({ mode: 'open' });
  expect(inFixedToolbar(back)).toBe(false);
  expect(verticalBarsBackCandidate(back)).toBe(true);
  stop = prehideVerticalBarsToolbarSources(document).stop;
  expect(verticalBarsOwned(back)).toBe(true);
});
