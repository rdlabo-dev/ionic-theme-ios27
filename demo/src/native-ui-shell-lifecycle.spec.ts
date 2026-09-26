import { expect, test } from 'vitest';
import { enableNativeUIShell, setVerticalControlAreaPlacement } from '../../src/native';

test('placement requires ion-app and clears it when disabled', () => {
  document.body.replaceChildren();
  expect(() => setVerticalControlAreaPlacement('right')).toThrow('requires ion-app');
  document.body.innerHTML = '<ion-app></ion-app>';
  const app = document.querySelector('ion-app')!;

  setVerticalControlAreaPlacement('left');
  expect(app.classList.contains('ios-theme-vertical-bars-left')).toBe(true);
  expect(app.style.getPropertyValue('--ios-theme-vertical-bars-native-inset')).toBe('');

  setVerticalControlAreaPlacement({ edge: 'right', inset: 64 });
  expect(app.classList.contains('ios-theme-vertical-bars-left')).toBe(false);
  expect(app.style.getPropertyValue('--ios-theme-vertical-bars-native-inset')).toBe('64px');

  setVerticalControlAreaPlacement(null);
  expect(app.classList.contains('ios-theme-vertical-bars')).toBe(false);
  expect(app.style.getPropertyValue('--ios-theme-vertical-bars-native-inset')).toBe('');

  setVerticalControlAreaPlacement('right');
  expect(app.classList.contains('ios-theme-vertical-bars')).toBe(true);
  setVerticalControlAreaPlacement(null);
  document.body.replaceChildren();
});

test('a second startup cannot silently replace the active configuration', async () => {
  const first = await enableNativeUIShell({ controls: { tabs: true }, verticalBarsOnly: true });
  expect(await enableNativeUIShell({ controls: { tabs: true }, verticalBarsOnly: true })).toBe(first);
  await expect(enableNativeUIShell({ controls: { toolbar: true } })).rejects.toThrow('different controls');
  await first.destroy();
});

test('a new activation survives the previous runtime finishing its destroy', async () => {
  const options = { controls: { toolbar: true }, verticalBarsOnly: true } as const;
  const first = await enableNativeUIShell(options);
  const disabling = enableNativeUIShell({ enabled: false });
  const second = await enableNativeUIShell(options);
  expect(second).not.toBe(first);
  await disabling;
  // The stale destroy must not clear the newer activation's shared slot.
  await enableNativeUIShell({ enabled: false });
  expect(second.getStatus().state).toBe('stopped');
});
