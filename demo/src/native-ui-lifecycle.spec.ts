import { expect, test, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { configureNativeTransition } from '../../packages/capacitor-native-ui/src/native';
import { enableNativeUI, enableVerticalControlArea, setVerticalControlAreaPlacement } from '../../packages/capacitor-native-ui/src/native';

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
  const first = await enableNativeUI({ controls: { tabs: true }, verticalBarsOnly: true });
  expect(await enableNativeUI({ controls: { tabs: true }, verticalBarsOnly: true })).toBe(first);
  await expect(enableNativeUI({ controls: { toolbar: true } })).rejects.toThrow('different controls');
  await first.destroy();
});

test('a new activation survives the previous runtime finishing its destroy', async () => {
  const options = { controls: { toolbar: true }, verticalBarsOnly: true } as const;
  const first = await enableNativeUI(options);
  const disabling = enableNativeUI({ enabled: false });
  const second = await enableNativeUI(options);
  expect(second).not.toBe(first);
  await disabling;
  // The stale destroy must not clear the newer activation's shared slot.
  await enableNativeUI({ enabled: false });
  expect(second.getStatus().state).toBe('stopped');
});

test('standalone Vertical Bars forwards popover opt-in into the shared runtime', async () => {
  const handle = await enableVerticalControlArea({ controls: { popover: true } });
  await expect(enableNativeUI({ controls: { tabs: true, toolbar: true, popover: true }, verticalBarsOnly: true })).resolves.toBeDefined();
  await expect(enableVerticalControlArea()).rejects.toThrow('different controls');
  await handle.destroy();
});

test('undefined optional controls preserve the same defaults as omitted settings', async () => {
  const handle = await enableNativeUI({ controls: { tabs: undefined, segment: undefined, fab: undefined } });
  try {
    expect(await enableNativeUI()).toBe(handle);
  } finally {
    await handle.destroy();
  }
});

test('iOS without a registered native plugin retains Web controls and transition defaults', async () => {
  const platform = vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
  const available = vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(false);
  try {
    await expect(configureNativeTransition()).resolves.toEqual({ radius: 0 });
    const shell = await enableNativeUI();
    try {
      expect(shell.getStatus()).toMatchObject({ state: 'web', reason: 'Native UI plugin is not registered' });
      expect(available).toHaveBeenCalledWith('NativeUI');
    } finally {
      await shell.destroy();
    }
  } finally {
    available.mockRestore();
    platform.mockRestore();
  }
});

test('layout-specific options participate in runtime configuration identity', async () => {
  const first = await enableNativeUI({ vertical: { buttons: false }, horizontal: { buttons: false } });
  try {
    expect(await enableNativeUI({ vertical: { buttons: false }, horizontal: { buttons: false } })).toBe(first);
    await expect(enableNativeUI({ vertical: { buttons: false }, horizontal: { buttons: true } })).rejects.toThrow('different controls');
    await expect(enableNativeUI({ vertical: { buttons: true }, horizontal: { buttons: false } })).rejects.toThrow('different controls');
  } finally {
    await first.destroy();
  }
});

test('boolean layout shorthands share configuration identity with equivalent objects', async () => {
  const first = await enableNativeUI({ horizontal: false, vertical: true });
  try {
    expect(
      await enableNativeUI({
        horizontal: { buttons: false, button: false, backButton: false },
        vertical: { buttons: true, button: true, backButton: true },
      }),
    ).toBe(first);
    await expect(enableNativeUI({ horizontal: true, vertical: true })).rejects.toThrow('different controls');
  } finally {
    await first.destroy();
  }
});
