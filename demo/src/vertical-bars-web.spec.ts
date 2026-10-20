import { prehideVerticalBarsToolbarSources } from '../../packages/capacitor-native-ui/src/native/prehide';
import { expect, test } from 'vitest';
import { createVerticalBarsWebProjection } from '../../packages/capacitor-native-ui/src/native/vertical-bars-web';
import { setVerticalBarsPlacement } from '../../packages/capacitor-native-ui/src/native/shared/dom';

const mountEligibleBackButton = () => {
  document.body.innerHTML = `
    <ion-app class="ios-theme-vertical-bars">
      <main class="ion-page">
        <ion-header><ion-toolbar class="ios"><ion-back-button class="ios"></ion-back-button></ion-toolbar></ion-header>
      </main>
    </ion-app>`;
  const button = document.querySelector('ion-back-button') as HTMLElement;
  button.style.display = 'block';
  button.style.visibility = 'visible';
  button.getBoundingClientRect = () => ({ width: 44, height: 44 }) as DOMRect;
  // Eligibility requires prehide's per-page placement capture; mark it directly.
  setVerticalBarsPlacement(button, true);
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

test('toolbar opt-out leaves an otherwise eligible verticalBars back button under application ownership', async () => {
  mountEligibleBackButton();
  const enabled = createVerticalBarsWebProjection(document, {});
  await nextFrame();
  expect(enabled.getStatus().projected).toBe(1);
  expect(document.querySelector('.ios-theme-vertical-bars-back-button-projection')).not.toBeNull();
  await enabled.destroy();

  mountEligibleBackButton();
  const handle = createVerticalBarsWebProjection(document, { controls: { tabs: true } });
  await nextFrame();

  expect(handle.getStatus()).toEqual({ state: 'web', projected: 0, updates: 0 });
  expect(document.querySelector('ion-back-button')?.hasAttribute('data-native-ui-projected')).toBe(false);
  expect(document.querySelector('.ios-theme-vertical-bars-back-button-projection')).toBeNull();

  await handle.destroy();
});

test('a back button inside an ion-buttons group is projected only through the back slot', async () => {
  document.body.innerHTML = `
    <ion-app class="ios-theme-vertical-bars">
      <main class="ion-page">
        <ion-header><ion-toolbar class="ios"><ion-buttons slot="start" class="ios"><ion-back-button class="ios"></ion-back-button></ion-buttons></ion-toolbar></ion-header>
      </main>
    </ion-app>`;
  const button = document.querySelector('ion-back-button') as HTMLElement;
  button.style.display = 'block';
  button.style.visibility = 'visible';
  button.getBoundingClientRect = () => ({ width: 44, height: 44 }) as DOMRect;
  setVerticalBarsPlacement(button, true);

  const handle = createVerticalBarsWebProjection(document, {});
  try {
    await nextFrame();
    expect(handle.getStatus().projected).toBe(1);
    expect(document.querySelectorAll('.ios-theme-vertical-bars-back-button-projection')).toHaveLength(1);
    expect(document.querySelector('.ios-theme-vertical-bars-toolbar-projection')).toBeNull();
  } finally {
    await handle.destroy();
  }
});

test('explicit standalone text action projects, forwards clicks and restores its source', async () => {
  document.body.innerHTML = `<ion-app class="ios-theme-vertical-bars"><main class="ion-page">
    <ion-header><ion-toolbar><ion-button data-vertical-bars="true">Save</ion-button></ion-toolbar></ion-header>
    </main></ion-app>`;
  const source = document.querySelector<HTMLElement>('ion-button')!;
  source.style.display = 'block';
  source.style.visibility = 'visible';
  source.getBoundingClientRect = () => ({ width: 44, height: 44 }) as DOMRect;
  let clicks = 0;
  source.addEventListener('click', () => clicks++);
  const prehide = prehideVerticalBarsToolbarSources(document, undefined, undefined, { vertical: { button: false } });
  const handle = createVerticalBarsWebProjection(document, {});
  try {
    await nextFrame();
    const clone = document.querySelector<HTMLElement>('.ios-theme-vertical-bars-toolbar-projection')!;
    expect(clone).not.toBeNull();
    expect(clone.textContent).toBe('Save');
    clone.click();
    expect(clicks).toBe(1);
    expect(source.getAttribute('aria-hidden')).toBe('true');
  } finally {
    await handle.destroy();
    prehide.stop();
  }
  expect(source.hasAttribute('aria-hidden')).toBe(false);
  expect(document.querySelector('.ios-theme-vertical-bars-toolbar-projection')).toBeNull();
});
