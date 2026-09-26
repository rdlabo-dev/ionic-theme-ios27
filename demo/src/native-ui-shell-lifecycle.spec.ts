import { expect, test } from 'vitest';
import { enableNativeUIShell, setVerticalControlAreaPlacement } from '../../src/native';

test('placement requires ion-app and clears it when disabled', () => {
  document.body.replaceChildren();
  expect(() => setVerticalControlAreaPlacement('trailing')).toThrow('requires ion-app');
  document.body.innerHTML = '<ion-app></ion-app>';
  const app = document.querySelector('ion-app')!;

  setVerticalControlAreaPlacement('leading');
  expect(app.classList.contains('ios-theme-vertical-bars-left')).toBe(true);
  expect(app.style.getPropertyValue('--ios-theme-vertical-bars-native-inset')).toBe('');

  setVerticalControlAreaPlacement({ edge: 'trailing', inset: 64 });
  expect(app.classList.contains('ios-theme-vertical-bars-left')).toBe(false);
  expect(app.style.getPropertyValue('--ios-theme-vertical-bars-native-inset')).toBe('64px');

  // Logical edges resolve through the document direction: trailing is the physical left in RTL.
  app.setAttribute('dir', 'rtl');
  setVerticalControlAreaPlacement('trailing');
  expect(app.classList.contains('ios-theme-vertical-bars-left')).toBe(true);
  app.removeAttribute('dir');
  setVerticalControlAreaPlacement('trailing', true);
  expect(app.classList.contains('ios-theme-vertical-bars-left')).toBe(true);

  setVerticalControlAreaPlacement(null);
  expect(app.classList.contains('ios-theme-vertical-bars')).toBe(false);
  expect(app.style.getPropertyValue('--ios-theme-vertical-bars-native-inset')).toBe('');

  setVerticalControlAreaPlacement('trailing');
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
