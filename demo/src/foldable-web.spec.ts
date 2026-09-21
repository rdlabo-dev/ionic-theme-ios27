import { expect, test } from 'vitest';
import { createFoldableWebProjection } from '../../src/native/foldable-web';

const mountEligibleBackButton = () => {
  document.body.innerHTML = `
    <ion-app class="ios-theme-enable-foldable">
      <main class="ion-page">
        <ion-header><ion-toolbar class="ios"><ion-back-button class="ios"></ion-back-button></ion-toolbar></ion-header>
      </main>
    </ion-app>`;
  const button = document.querySelector('ion-back-button') as HTMLElement;
  button.style.display = 'block';
  button.style.visibility = 'visible';
  button.getBoundingClientRect = () => ({ width: 44, height: 44 }) as DOMRect;
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

test('toolbar opt-out leaves an otherwise eligible foldable back button under application ownership', async () => {
  mountEligibleBackButton();
  const enabled = createFoldableWebProjection(document, {});
  await nextFrame();
  expect(enabled.getStatus().projected).toBe(1);
  expect(document.querySelector('.ios-theme-foldable-back-button-projection')).not.toBeNull();
  await enabled.destroy();

  mountEligibleBackButton();
  const handle = createFoldableWebProjection(document, { controls: { tabs: true } });
  await nextFrame();

  expect(handle.getStatus()).toEqual({ state: 'web', projected: 0, updates: 0 });
  expect(document.querySelector('ion-back-button')?.hasAttribute('data-native-ui-shell')).toBe(false);
  expect(document.querySelector('.ios-theme-foldable-back-button-projection')).toBeNull();

  await handle.destroy();
});
