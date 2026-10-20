import { prehideVerticalBarsToolbarSources } from '../../packages/capacitor-native-ui/src/native/prehide';
import { afterEach, expect, test } from 'vitest';
import { readCandidate, selector } from '../../packages/capacitor-native-ui/src/native/components';
import { setVerticalBarsPlacement } from '../../packages/capacitor-native-ui/src/native/shared/dom';
import { enableVerticalControlArea } from '../../packages/capacitor-native-ui/src/vertical-bars';

const mount = (fills: (string | undefined)[], grouped = false) => {
  document.body.innerHTML = `<ion-app class="ios-theme-vertical-bars"><main class="ion-page"><ion-header><ion-toolbar>${grouped ? '<ion-buttons>' : ''}${fills.map(() => '<ion-button><svg slot="icon-only" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg></ion-button>').join('')}${grouped ? '</ion-buttons>' : ''}</ion-toolbar></ion-header></main></ion-app>`;
  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    element.style.opacity = '1';
    element.style.visibility = 'visible';
  });
  const buttons = Array.from(document.querySelectorAll('ion-button')) as HTMLIonButtonElement[];
  buttons.forEach((button, i) => {
    button.id = `button-${i}`;
    button.fill = fills[i] as HTMLIonButtonElement['fill'];
    // Other suites may already have registered Ionic custom elements.
    const shadow = button.shadowRoot ?? button.attachShadow({ mode: 'open' });
    const native = document.createElement('span');
    shadow.replaceChildren(native);
    native.setAttribute('part', 'native');
    native.style.cssText = 'color: white; background-color: rgba(0,0,0,0.24); border: 2px solid red';
  });
  document.querySelectorAll<HTMLElement>('ion-button, ion-buttons, svg').forEach((element) => {
    element.style.cssText = 'display: block; visibility: visible; opacity: 1';
    element.getBoundingClientRect = () => ({ x: 0, y: 0, width: 44, height: 44, top: 0, left: 0, right: 44, bottom: 44 }) as DOMRect;
    setVerticalBarsPlacement(element, true);
  });
  return grouped ? document.querySelector<HTMLElement>('ion-buttons')! : buttons[0];
};
afterEach(() => document.body.replaceChildren());

test.each([undefined, 'glass'] as const)('default %s preserves the existing glass projection', (buttonDefaultFill) => {
  const item = readCandidate(mount([undefined]), () => 'button', {
    ionic: { verticalBars: { buttonProjection: 'source', buttonDefaultFill } },
  })!.control.items[0];
  expect(item.color).toBe('rgb(255, 255, 255)');
  expect(item.backgroundColor).toBeUndefined();
  expect(item.borderColor).toBeUndefined();
});

test.each([undefined, 'default'])('solid default retains computed colors for fill %s without changing the source', (fill) => {
  const element = mount([fill]);
  const item = readCandidate(element, () => 'button', {
    ionic: { verticalBars: { buttonProjection: 'source', buttonDefaultFill: 'solid' } },
  })!.control.items[0];
  expect(item.color).toBe('rgb(255, 255, 255)');
  expect(item.backgroundColor).toBe('rgba(0, 0, 0, 0.24)');
  expect((element as HTMLIonButtonElement).fill).toBe(fill);
});

test.each([undefined, 'glass', 'solid'] as const)(
  'grouped buttons default to clear with option %s and preserve explicit fills',
  (buttonDefaultFill) => {
    const element = mount([undefined, 'clear', 'outline', 'solid'], true);
    const items = readCandidate(element, (e) => e.localName, {
      ionic: { verticalBars: { buttonProjection: 'source', buttonDefaultFill } },
    })!.control.items;
    expect(items.map((item) => item.backgroundColor)).toEqual([undefined, undefined, undefined, 'rgba(0, 0, 0, 0.24)']);
    expect(items[2].borderColor).toBe('rgb(255, 0, 0)');
    expect(items[2].borderWidth).toBe(2);
  },
);

test('explicit solid wins over a glass default', () => {
  const item = readCandidate(mount(['solid']), () => 'button', {
    ionic: { verticalBars: { buttonProjection: 'source', buttonDefaultFill: 'glass' } },
  })!.control.items[0];
  expect(item.backgroundColor).toBe('rgba(0, 0, 0, 0.24)');
});

test('startup rejects a different default until the previous owner is destroyed', async () => {
  const first = await enableVerticalControlArea({ ionic: { verticalBars: { buttonProjection: 'source' } } });
  try {
    await expect(
      enableVerticalControlArea({ ionic: { verticalBars: { buttonProjection: 'source', buttonDefaultFill: 'glass' } } }),
    ).resolves.toBeDefined();
    await expect(
      enableVerticalControlArea({ ionic: { verticalBars: { buttonProjection: 'source', buttonDefaultFill: 'solid' } } }),
    ).rejects.toThrow('different controls');
  } finally {
    await first.destroy();
  }
  const next = await enableVerticalControlArea({ ionic: { verticalBars: { buttonProjection: 'source', buttonDefaultFill: 'solid' } } });
  await next.destroy();
});

// Disabling the themed group keeps its buttons eligible for individual projection.
test.each([undefined, 'glass', 'solid'] as const)(
  'individual buttons in a disabled group respect clear with option %s',
  (buttonDefaultFill) => {
    const group = mount([undefined, 'default', 'clear', 'solid', 'outline'], true);
    group.classList.add('ios-theme-disabled');
    expect(
      readCandidate(group, (e) => e.localName, { ionic: { verticalBars: { buttonProjection: 'source', buttonDefaultFill } } }),
    ).toBeUndefined();
    const buttons = Array.from(group.querySelectorAll('ion-button'));
    const items = buttons.map(
      (button) =>
        readCandidate(button, (e) => e.localName, { ionic: { verticalBars: { buttonProjection: 'source', buttonDefaultFill } } })!.control
          .items[0],
    );
    expect(items.map((item) => item.backgroundColor)).toEqual([undefined, undefined, undefined, 'rgba(0, 0, 0, 0.24)', undefined]);
    expect(items[4].borderColor).toBe('rgb(255, 0, 0)');
    expect(items[4].borderWidth).toBe(2);
    expect(buttons[0].fill).toBeUndefined();
  },
);

// System projection preserves semantics while leaving appearance to SwiftUI.
test.each([undefined, 'system'] as const)('projection %s ignores source styling and the default fill', (buttonProjection) => {
  const group = mount([undefined, 'clear', 'solid', 'outline'], true);
  const disabled = group.querySelectorAll('ion-button')[2];
  disabled.disabled = true;
  const candidate = readCandidate(group, (e) => e.id || e.localName, {
    ionic: { verticalBars: { buttonProjection, buttonDefaultFill: 'solid' } },
  })!;
  expect(candidate.control.kind).toBe('button-group');
  expect(candidate.control.items).toHaveLength(4);
  for (const item of candidate.control.items) {
    expect(item.iconTemplate).toBe(true);
    expect(item.color).toBe('currentColor');
    expect(item.buttonFill).toBeUndefined();
    expect(item.backgroundColor).toBeUndefined();
    expect(item.borderColor).toBeUndefined();
  }
  expect(candidate.control.items.map((item) => item.disabled)).toEqual([false, false, true, false]);
  expect(candidate.actions.size).toBe(4);
  expect(candidate.actions.get('button-2')).toBe(disabled);
});

test('system is the default but retains default fill for local source overrides', async () => {
  const first = await enableVerticalControlArea();
  try {
    await expect(
      enableVerticalControlArea({ ionic: { verticalBars: { buttonProjection: 'system', buttonDefaultFill: 'glass' } } }),
    ).resolves.toBeDefined();
    await expect(enableVerticalControlArea({ ionic: { verticalBars: { buttonDefaultFill: 'solid' } } })).rejects.toThrow(
      'different controls',
    );
    await expect(enableVerticalControlArea({ ionic: { verticalBars: { buttonProjection: 'source' } } })).rejects.toThrow(
      'different controls',
    );
  } finally {
    await first.destroy();
  }
});

test.each(['source', 'system'] as const)('local projection overrides button, group and startup %s in order', (buttonProjection) => {
  const group = mount(['solid', 'solid'], true);
  const button = group.querySelector('ion-button')!;
  const opposite = buttonProjection === 'source' ? 'system' : 'source';
  const read = () => readCandidate(group, (e) => e.id || e.localName, { ionic: { verticalBars: { buttonProjection } } })!.control.items[0];
  const expectedFill = (projection: string) => (projection === 'source' ? 'solid' : undefined);
  group.classList.add(`ios-theme-projection-${opposite}`);
  expect(read().buttonFill).toBe(expectedFill(opposite));
  button.classList.add(`ios-theme-projection-${buttonProjection}`);
  expect(read().buttonFill).toBe(expectedFill(buttonProjection));
  button.classList.add(`ios-theme-projection-${opposite}`);
  expect(read().buttonFill).toBeUndefined();
  button.classList.remove('ios-theme-projection-source', 'ios-theme-projection-system');
  expect(read().buttonFill).toBe(expectedFill(opposite));
  group.classList.remove(`ios-theme-projection-${opposite}`);
  expect(read().buttonFill).toBe(expectedFill(buttonProjection));

  // Attributes participate in the same hierarchy, taking precedence only on the same element.
  group.setAttribute('data-projection', opposite);
  expect(read().buttonFill).toBe(expectedFill(opposite));
  button.classList.add(`ios-theme-projection-${buttonProjection}`);
  expect(read().buttonFill).toBe(expectedFill(buttonProjection));
  button.setAttribute('data-projection', opposite);
  expect(read().buttonFill).toBe(expectedFill(opposite));
  for (const value of ['', 'invalid']) {
    button.setAttribute('data-projection', value);
    expect(read().buttonFill).toBe(expectedFill(buttonProjection));
  }
  button.removeAttribute('data-projection');
  expect(read().buttonFill).toBe(expectedFill(buttonProjection));
  button.classList.remove(`ios-theme-projection-${buttonProjection}`);
  expect(read().buttonFill).toBe(expectedFill(opposite));
  group.removeAttribute('data-projection');
  expect(read().buttonFill).toBe(expectedFill(buttonProjection));

  const standalone = mount([undefined]);
  standalone.setAttribute('data-projection', 'source');
  expect(
    readCandidate(standalone, () => 'button', { ionic: { verticalBars: { buttonProjection, buttonDefaultFill: 'solid' } } })!.control
      .items[0].buttonFill,
  ).toBe('solid');
});

test('horizontal controls project without theme variables and retain visibility exclusions', () => {
  const button = mount([undefined]);
  document.querySelector('ion-app')!.className = '';
  button.classList.add('ios');
  // jsdom leaves the default transform empty instead of the browser's 'none'.
  document.querySelectorAll<HTMLElement>('*').forEach((element) => (element.style.transform = 'none'));
  setVerticalBarsPlacement(button, false);
  expect(getComputedStyle(button).getPropertyValue('--ios-theme-glass-background-rgb')).toBe('');
  expect(getComputedStyle(button).getPropertyValue('--ios26-glass-background-rgb')).toBe('');
  expect(readCandidate(button, () => 'button')?.control.items).toHaveLength(1);
  button.hidden = true;
  expect(readCandidate(button, () => 'button')).toBeUndefined();
});

test.each([true, false])('native menu action is discovered with grouping %s', (buttons) => {
  document.body.innerHTML = `<ion-app class="ios-theme-vertical-bars"><main class="ion-page">
    <ion-header><ion-toolbar><ion-buttons><ion-menu-button></ion-menu-button></ion-buttons></ion-toolbar></ion-header>
    </main></ion-app>`;
  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    element.style.cssText = 'display: block; visibility: visible; opacity: 1';
    element.getBoundingClientRect = () => ({ x: 0, y: 0, width: 44, height: 44, top: 0, left: 0, right: 44, bottom: 44 }) as DOMRect;
  });
  const menu = document.querySelector('ion-menu-button') as HTMLIonMenuButtonElement;
  menu.type = 'button';
  menu.textContent = 'Menu';
  const shadow = menu.shadowRoot ?? menu.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<span>Menu</span>';
  const prehide = prehideVerticalBarsToolbarSources(document, undefined, undefined, { controls: { buttonGroup: buttons, button: true } });
  try {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .map((element) => readCandidate(element, (source) => source.localName))
      .filter((candidate) => !!candidate);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.element.localName).toBe(buttons ? 'ion-buttons' : 'ion-menu-button');
  } finally {
    prehide.stop();
  }
});
