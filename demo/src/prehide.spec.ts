import { expect, test } from 'vitest';
import { prehideVerticalBarsToolbarSources } from '../../packages/capacitor-native-ui/src/native/prehide';
import { prehiddenClass, prehideRootClass, verticalBarsOwned } from '../../packages/capacitor-native-ui/src/native/shared/dom';

const markup = `
  <ion-app class="ios-theme-vertical-bars">
    <main class="ion-page">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start"><ion-menu-button></ion-menu-button></ion-buttons>
        </ion-toolbar>
      </ion-header>
    </main>
  </ion-app>`;

test('a departed page is not recaptured before Ionic hides it', async () => {
  document.documentElement.className = '';
  document.body.innerHTML = markup;
  const page = document.querySelector<HTMLElement>('.ion-page')!;
  const group = document.querySelector<HTMLElement>('ion-buttons')!;
  const toolbar = document.querySelector<HTMLElement>('ion-toolbar')!;
  const prehide = prehideVerticalBarsToolbarSources(document);
  try {
    expect(group.classList.contains(prehiddenClass)).toBe(true);

    page.dispatchEvent(new Event('ionViewDidLeave'));
    expect(group.classList.contains(prehiddenClass)).toBe(false);

    // A mutation-triggered reconcile must not recapture the departed page.
    toolbar.classList.add('unrelated');
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(group.classList.contains(prehiddenClass)).toBe(false);

    // Re-entering the page starts a new placement epoch.
    page.dispatchEvent(new Event('ionViewWillEnter'));
    expect(group.classList.contains(prehiddenClass)).toBe(true);
  } finally {
    prehide.stop();
    document.body.innerHTML = '';
    document.documentElement.className = '';
  }
});

// Scoped runtimes patch child accessors on upgraded elements (Stencil slots),
// so a not-yet-hydrated group reports no children; capture must still see them.
test('captures a group whose child accessors are virtualized', () => {
  document.documentElement.className = '';
  document.body.innerHTML = markup;
  const group = document.querySelector<HTMLElement>('ion-buttons')!;
  for (const name of ['childNodes', 'children'] as const) {
    Object.defineProperty(group, name, { configurable: true, get: () => [] });
  }
  const prehide = prehideVerticalBarsToolbarSources(document);
  try {
    expect(group.classList.contains(prehiddenClass)).toBe(true);
  } finally {
    prehide.stop();
    document.body.innerHTML = '';
    document.documentElement.className = '';
  }
});

// Initial opt-out and later toggles must both preserve the ability to join the rail.
test.each(['class', 'data-native-ui'] as const)('shell opt-out via %s can be removed before page re-entry', async (attribute) => {
  document.documentElement.className = '';
  document.body.innerHTML = markup;
  const toolbar = document.querySelector<HTMLElement>('ion-toolbar')!;
  const group = document.querySelector<HTMLElement>('ion-buttons')!;
  const value = attribute === 'class' ? 'native-ui-disabled' : 'disabled';
  toolbar.setAttribute(attribute, value);
  const prehide = prehideVerticalBarsToolbarSources(document);
  try {
    expect(group.classList.contains(prehiddenClass)).toBe(false);
    for (let i = 0; i < 2; i++) {
      toolbar.removeAttribute(attribute);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(group.classList.contains(prehiddenClass)).toBe(true);
      toolbar.setAttribute(attribute, value);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(group.classList.contains(prehiddenClass)).toBe(false);
    }
    toolbar.setAttribute(attribute, '');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(group.classList.contains(prehiddenClass)).toBe(true);
  } finally {
    prehide.stop();
    document.body.innerHTML = '';
    document.documentElement.className = '';
  }
});

test('disabling rail projection releases prehidden sources without losing placement', () => {
  document.body.innerHTML = markup;
  let enabled = true;
  const source = document.querySelector<HTMLElement>('ion-buttons')!;
  const controller = prehideVerticalBarsToolbarSources(document, () => enabled);
  try {
    expect(source.classList.contains(prehiddenClass)).toBe(true);
    enabled = false;
    window.dispatchEvent(new Event('nativeUIRefresh'));
    expect(source.classList.contains(prehiddenClass)).toBe(false);
    expect(document.documentElement.classList.contains(prehideRootClass)).toBe(false);
    expect(verticalBarsOwned(source)).toBe(true);
    enabled = true;
    window.dispatchEvent(new Event('nativeUIRefresh'));
    expect(source.classList.contains(prehiddenClass)).toBe(true);
  } finally {
    controller.stop();
    document.body.replaceChildren();
  }
});

test('late horizontal-only placement restores a captured Web search action', async () => {
  document.body.innerHTML = markup;
  const group = document.querySelector<HTMLElement>('ion-buttons')!;
  const prehide = prehideVerticalBarsToolbarSources(document);
  try {
    expect(group.classList.contains(prehiddenClass)).toBe(true);
    group.classList.add('ios-theme-horizontal-only');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(group.classList.contains(prehiddenClass)).toBe(false);
    group.classList.remove('ios-theme-horizontal-only');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(group.classList.contains(prehiddenClass)).toBe(true);
  } finally {
    prehide.stop();
    document.body.replaceChildren();
    document.documentElement.className = '';
  }
});

test.each([
  [{}, [true, true, true, true]],
  [{ buttons: false }, [true, true, true, true]],
  [{ button: false }, [false, false, false, true]],
  [{ backButton: false }, [true, true, true, false]],
  [{ buttons: false, button: false, backButton: false }, [false, false, false, false]],
] as const)('automatic vertical selection %j', (options, expected) => {
  document.body.innerHTML = `
    <ion-app class="ios-theme-vertical-bars"><main class="ion-page">
    <ion-header><ion-toolbar>
      <ion-buttons><ion-button id="a"><ion-icon slot="icon-only"></ion-icon></ion-button>
      <ion-button id="b"><ion-icon slot="icon-only"></ion-icon></ion-button>
      <ion-back-button id="back"></ion-back-button></ion-buttons>
      <ion-button id="single"><ion-icon slot="icon-only"></ion-icon></ion-button>
    </ion-toolbar></ion-header></main></ion-app>`;
  document.querySelector('#back')!.attachShadow({ mode: 'open' });
  const handle = prehideVerticalBarsToolbarSources(document, undefined, undefined, { vertical: options });
  try {
    expect(['a', 'b', 'single', 'back'].map((id) => verticalBarsOwned(document.getElementById(id)!))).toEqual(expected);
  } finally {
    handle.stop();
    document.body.innerHTML = '';
  }
});

test('group attributes never select children and explicit children override automatic selection', () => {
  document.body.innerHTML = `
    <ion-app class="ios-theme-vertical-bars"><main class="ion-page">
    <ion-header><ion-toolbar>
      <ion-buttons data-vertical-bars="true">
        <ion-button id="text">Save</ion-button>
        <ion-button id="excluded" data-vertical-bars="false">Cancel</ion-button>
        <ion-back-button id="back"></ion-back-button>
      </ion-buttons>
      <ion-buttons data-vertical-bars="false"><ion-button id="override" data-vertical-bars="true">Done</ion-button></ion-buttons>
      <ion-button id="single" data-vertical-bars="true">Add</ion-button>
      <ion-button id="invalid" data-vertical-bars="invalid">Ignore</ion-button>
    </ion-toolbar></ion-header>
    <ion-content><ion-button id="content" data-vertical-bars="true">Content</ion-button></ion-content>
    </main></ion-app>`;
  document.querySelector('#back')!.attachShadow({ mode: 'open' });
  const handle = prehideVerticalBarsToolbarSources(document, undefined, undefined, {
    vertical: { buttons: false, button: false, backButton: false },
  });
  try {
    expect(
      ['text', 'excluded', 'back', 'override', 'single', 'invalid', 'content'].map((id) => verticalBarsOwned(document.getElementById(id)!)),
    ).toEqual([false, false, false, true, true, false, false]);
  } finally {
    handle.stop();
    document.body.innerHTML = '';
  }
});

test.each([
  [true, true, true, true],
  [false, true, false, true],
  [true, false, false, false],
  [false, false, false, false],
] as const)('grouping %s and selection %s are independent', (buttons, button, grouped, selected) => {
  document.body.innerHTML = `<ion-app class="ios-theme-vertical-bars"><main class="ion-page">
    <ion-header><ion-toolbar><ion-buttons>
      <ion-button><ion-icon slot="icon-only"></ion-icon></ion-button>
      <ion-button><ion-icon slot="icon-only"></ion-icon></ion-button>
    </ion-buttons></ion-toolbar></ion-header></main></ion-app>`;
  const handle = prehideVerticalBarsToolbarSources(document, undefined, undefined, { vertical: { buttons, button } });
  try {
    expect(verticalBarsOwned(document.querySelector('ion-buttons')!)).toBe(grouped);
    expect(Array.from(document.querySelectorAll<HTMLElement>('ion-button')).map(verticalBarsOwned)).toEqual([selected, selected]);
  } finally {
    handle.stop();
    document.body.innerHTML = '';
  }
});

test.each(['true', 'false'] as const)('group override %s only changes grouping of explicitly selected actions', (attribute) => {
  document.body.innerHTML = `<ion-app class="ios-theme-vertical-bars"><main class="ion-page">
    <ion-header><ion-toolbar><ion-buttons data-vertical-bars="${attribute}">
      <ion-button data-vertical-bars="true">Save</ion-button>
      <ion-button data-vertical-bars="true">Done</ion-button>
    </ion-buttons></ion-toolbar></ion-header></main></ion-app>`;
  const handle = prehideVerticalBarsToolbarSources(document, undefined, undefined, {
    vertical: { buttons: attribute !== 'true', button: false },
  });
  try {
    expect(verticalBarsOwned(document.querySelector('ion-buttons')!)).toBe(attribute === 'true');
    expect(Array.from(document.querySelectorAll<HTMLElement>('ion-button')).map(verticalBarsOwned)).toEqual([true, true]);
  } finally {
    handle.stop();
    document.body.innerHTML = '';
  }
});

test.each(['true', 'false'] as const)('back selection ignores group attribute %s and both action options', (attribute) => {
  document.body.innerHTML = `<ion-app class="ios-theme-vertical-bars"><main class="ion-page">
    <ion-header><ion-toolbar><ion-buttons data-vertical-bars="${attribute}">
      <ion-back-button data-vertical-bars="true"></ion-back-button>
    </ion-buttons></ion-toolbar></ion-header></main></ion-app>`;
  document.querySelector('ion-back-button')!.attachShadow({ mode: 'open' });
  const handle = prehideVerticalBarsToolbarSources(document, undefined, undefined, {
    vertical: { buttons: false, button: false, backButton: false },
  });
  try {
    expect(verticalBarsOwned(document.querySelector('ion-back-button')!)).toBe(true);
    expect(verticalBarsOwned(document.querySelector('ion-buttons')!)).toBe(false);
  } finally {
    handle.stop();
    document.body.innerHTML = '';
  }
});
