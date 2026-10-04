import { expect, test } from 'vitest';
import { prehideVerticalBarsToolbarSources } from '../../src/native/prehide';
import { prehiddenClass } from '../../src/native/shared/dom';

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

test('releases controls adopted into another document and recaptures them on return', async () => {
  document.body.innerHTML = markup;
  const app = document.querySelector('ion-app')!;
  const page = document.querySelector<HTMLElement>('.ion-page')!;
  const group = document.querySelector<HTMLElement>('ion-buttons')!;
  const destination = document.implementation.createHTMLDocument();
  const prehide = prehideVerticalBarsToolbarSources(document);
  try {
    expect(group.classList.contains(prehiddenClass)).toBe(true);
    destination.body.append(destination.adoptNode(page));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(page.isConnected).toBe(true);
    expect(group.classList.contains(prehiddenClass)).toBe(false);

    app.append(document.adoptNode(page));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(group.classList.contains(prehiddenClass)).toBe(true);
  } finally {
    prehide.stop();
    document.body.innerHTML = '';
  }
});

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
test.each(['class', 'data-shell'] as const)('shell opt-out via %s can be removed before page re-entry', async (attribute) => {
  document.documentElement.className = '';
  document.body.innerHTML = markup;
  const toolbar = document.querySelector<HTMLElement>('ion-toolbar')!;
  const group = document.querySelector<HTMLElement>('ion-buttons')!;
  const value = attribute === 'class' ? 'ios-theme-shell-disabled' : 'disabled';
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
