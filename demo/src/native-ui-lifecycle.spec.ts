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
  const first = await enableNativeUI({ controls: 'verticalOnly' });
  expect(await enableNativeUI({ controls: 'verticalOnly' })).toBe(first);
  await expect(enableNativeUI({ controls: false })).rejects.toThrow('different controls');
  await first.destroy();
});

test('a new activation survives the previous runtime finishing its destroy', async () => {
  const options = { controls: 'verticalOnly' } as const;
  const first = await enableNativeUI(options);
  const destroying = first.destroy();
  const second = await enableNativeUI(options);
  expect(second).not.toBe(first);
  await destroying;
  // The stale destroy must not clear the newer activation's shared slot.
  await first.destroy();
  expect(await enableNativeUI(options)).toBe(second);
  await second.destroy();
  expect(second.getStatus().state).toBe('stopped');
});

test('standalone Vertical Bars forwards popover opt-in into the shared runtime', async () => {
  const handle = await enableVerticalControlArea({ ionic: { verticalBars: { popover: true } } });
  await expect(enableNativeUI({ controls: 'verticalOnly', ionic: { verticalBars: { popover: true } } })).resolves.toBeDefined();
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
  const first = await enableNativeUI({ controls: { buttonGroup: false } });
  try {
    expect(await enableNativeUI({ controls: { buttonGroup: false } })).toBe(first);
    await expect(enableNativeUI({ controls: { buttonGroup: 'horizontalOnly' } })).rejects.toThrow('different controls');
    await expect(enableNativeUI({ controls: { buttonGroup: 'verticalOnly' } })).rejects.toThrow('different controls');
  } finally {
    await first.destroy();
  }
});

test('scalar controls share configuration identity with equivalent objects', async () => {
  const first = await enableNativeUI({ controls: 'verticalOnly' });
  try {
    expect(
      await enableNativeUI({
        controls: {
          buttonGroup: 'verticalOnly',
          button: 'verticalOnly',
          backButton: 'verticalOnly',
          tabs: 'verticalOnly',
          segment: 'verticalOnly',
          fab: 'verticalOnly',
        },
      }),
    ).toBe(first);
    await expect(enableNativeUI({ controls: true })).rejects.toThrow('different controls');
  } finally {
    await first.destroy();
  }
});
