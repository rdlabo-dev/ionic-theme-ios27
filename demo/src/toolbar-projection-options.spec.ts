import { afterEach, expect, test } from 'vitest';
import { readCandidate, selector } from '../../packages/capacitor-native-ui/src/native/components';
import { prehideVerticalBarsToolbarSources } from '../../packages/capacitor-native-ui/src/native/prehide';
import { verticalBarsOwned } from '../../packages/capacitor-native-ui/src/native/shared/dom';
import type { VerticalControlAreaOptions } from '../../packages/capacitor-native-ui/src/native/definitions';

afterEach(() => document.body.replaceChildren());

const mount = () => {
  document.body.innerHTML = `<ion-app><main class="ion-page"><ion-header><ion-toolbar>
    <ion-buttons class="ios" id="group">
      <ion-button class="ios button-clear" id="a">Alpha</ion-button>
      <ion-button class="ios button-clear" id="b">Beta</ion-button>
    </ion-buttons><ion-back-button class="ios" id="back"></ion-back-button>
  </ion-toolbar></ion-header></main></ion-app>`;
  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    element.style.cssText = 'display:block;visibility:visible;opacity:1;transform:none;--ios-theme-glass-background-rgb:255,255,255';
    element.getBoundingClientRect = () => ({ x: 0, y: 0, width: 44, height: 44, top: 0, left: 0, right: 44, bottom: 44 }) as DOMRect;
  });
  document.querySelectorAll<HTMLIonButtonElement>('ion-button').forEach((button) => (button.fill = 'clear'));
  const back = document.querySelector('ion-back-button')!;
  (back.shadowRoot ?? back.attachShadow({ mode: 'open' })).innerHTML = '<span part="text">Back</span>';
};
const candidates = (options: VerticalControlAreaOptions) =>
  Array.from(document.querySelectorAll<HTMLElement>(selector))
    .map((element) => readCandidate(element, (source) => source.id, options))
    .filter((candidate) => !!candidate)
    .map((candidate) => candidate!.element.id);

test.each([
  [true, true, ['group', 'back']],
  [false, true, ['a', 'b', 'back']],
  [true, false, ['back']],
  [false, false, ['back']],
] as const)('horizontal grouping=%s selection=%s', (buttons, button, expected) => {
  mount();
  expect(candidates({ controls: { buttonGroup: buttons, button, backButton: 'horizontalOnly' } })).toEqual(expected);
});

test('horizontal local selection and grouping are independent from vertical attributes', () => {
  mount();
  document.querySelector('#group')!.setAttribute('data-horizontal-bars', 'true');
  document.querySelector('#group')!.setAttribute('data-vertical-bars', 'false');
  document.querySelector('#a')!.setAttribute('data-horizontal-bars', 'true');
  document.querySelector('#b')!.setAttribute('data-vertical-bars', 'true');
  document.querySelector('#back')!.setAttribute('data-horizontal-bars', 'false');
  expect(candidates({ controls: { buttonGroup: false, button: false } })).toEqual(['a']);
  document.querySelector('#b')!.setAttribute('data-horizontal-bars', 'true');
  expect(candidates({ controls: { buttonGroup: false, button: false } })).toEqual(['group']);
});

test('vertical configuration never reads horizontal settings or attributes', () => {
  mount();
  document.querySelector('ion-app')!.classList.add('ios-theme-vertical-bars');
  document.querySelector('#group')!.setAttribute('data-horizontal-bars', 'false');
  for (const id of ['a', 'b']) document.getElementById(id)!.setAttribute('data-vertical-bars', 'true');
  const handle = prehideVerticalBarsToolbarSources(document, undefined, undefined, {
    controls: { buttonGroup: 'verticalOnly', button: false, backButton: 'horizontalOnly' },
  });
  try {
    expect(['group', 'a', 'b', 'back'].map((id) => verticalBarsOwned(document.getElementById(id)!))).toEqual([true, true, true, false]);
  } finally {
    handle.stop();
  }
});

test('horizontal back button can opt in independently inside an ungrouped container', () => {
  mount();
  const back = document.querySelector('#back')!;
  document.querySelector('#group')!.append(back);
  document.querySelector('#group')!.setAttribute('data-horizontal-bars', 'false');
  back.setAttribute('data-horizontal-bars', 'true');
  expect(candidates({ controls: false })).toEqual(['back']);
});

test.each([undefined, true, false, 'horizontalOnly', 'verticalOnly'] as const)(
  'horizontal shorthand %s controls all actions',
  (horizontal) => {
    mount();
    expect(candidates({ controls: horizontal })).toEqual(horizontal === false || horizontal === 'verticalOnly' ? [] : ['group', 'back']);
  },
);

test('horizontal false still allows local action, grouping and back overrides', () => {
  mount();
  for (const id of ['group', 'a', 'b', 'back']) document.getElementById(id)!.setAttribute('data-horizontal-bars', 'true');
  expect(candidates({ controls: false })).toEqual(['group', 'back']);
});

test.each([undefined, true, false, 'horizontalOnly', 'verticalOnly'] as const)(
  'vertical shorthand %s controls all eligible actions',
  (vertical) => {
    mount();
    document.querySelector('ion-app')!.classList.add('ios-theme-vertical-bars');
    for (const button of document.querySelectorAll('ion-button')) button.innerHTML = '<ion-icon slot="icon-only"></ion-icon>';
    const handle = prehideVerticalBarsToolbarSources(document, undefined, undefined, { controls: vertical });
    try {
      expect(['group', 'a', 'b', 'back'].map((id) => verticalBarsOwned(document.getElementById(id)!))).toEqual(
        Array(4).fill(vertical !== false && vertical !== 'horizontalOnly'),
      );
    } finally {
      handle.stop();
    }
  },
);

test('vertical false still allows local action, grouping and back overrides', () => {
  mount();
  document.querySelector('ion-app')!.classList.add('ios-theme-vertical-bars');
  for (const id of ['group', 'a', 'b', 'back']) document.getElementById(id)!.setAttribute('data-vertical-bars', 'true');
  const handle = prehideVerticalBarsToolbarSources(document, undefined, undefined, { controls: false });
  try {
    expect(['group', 'a', 'b', 'back'].map((id) => verticalBarsOwned(document.getElementById(id)!))).toEqual([true, true, true, true]);
  } finally {
    handle.stop();
  }
});

test('partial controls preserve selection and grouping for omitted kinds', () => {
  mount();
  expect(candidates({ controls: { backButton: false } })).toEqual(['group']);
  expect(candidates({ controls: { button: false } })).toEqual(['back']);
});

test.each(['ion-button', 'ion-menu-button', 'ion-back-button'])(
  'vertical exclusions never fall through to horizontal selection: %s',
  (tag) => {
    mount();
    document.querySelector('ion-app')!.classList.add('ios-theme-vertical-bars');
    const action = document.createElement(tag) as HTMLElement & { type: string };
    action.id = 'excluded';
    action.className = 'ios';
    action.type = 'button';
    action.style.cssText = 'display:block;visibility:visible;opacity:1;transform:none';
    action.getBoundingClientRect = () => ({ x: 0, y: 0, width: 44, height: 44 }) as DOMRect;
    action.attachShadow({ mode: 'open' }).innerHTML = '<span part="text">Action</span>';
    document.querySelector('#group')!.replaceChildren(action);
    const options = { controls: 'horizontalOnly' as const };
    const prehide = prehideVerticalBarsToolbarSources(document, undefined, undefined, options);
    try {
      expect(candidates(options)).toEqual([]);
    } finally {
      prehide.stop();
    }
  },
);

test('a shell opt-out in a group prevents sibling projection even with local opt-in', () => {
  mount();
  document.querySelector('#a')!.setAttribute('data-native-ui', 'disabled');
  document.querySelector('#b')!.setAttribute('data-horizontal-bars', 'true');
  expect(candidates({ controls: { buttonGroup: false } })).toEqual(['back']);
});

for (const tag of ['img', 'canvas']) {
  test(`Engine-owned ${tag} does not change toolbar discovery`, () => {
    mount();
    const options = { controls: { buttonGroup: true, button: true } };
    const expected = candidates(options);
    const image = document.createElement(tag);
    image.setAttribute('data-native-ui-projection-node', '');
    document.querySelector('#group')!.append(image);
    expect(candidates(options)).toEqual(expected);
    // Application-owned unsupported content must still reject the group.
    image.removeAttribute('data-native-ui-projection-node');
    expect(candidates(options)).not.toContain('group');
  });
}
