import { expect, test, vi } from 'vitest';
import type { NativeUIShellHandle } from '../../src/native';
import { bindMetricsLifecycle } from '../../src/native/lifecycle';
import { enableNativeUIShell, setVerticalControlAreaPlacement } from '../../src/native';

const runtime = (destroy = vi.fn(async () => {})): NativeUIShellHandle => ({
  getStatus: () => ({ state: 'native', projected: 1, updates: 1 }),
  suspend: async () => ({ resume: async () => {} }),
  destroy,
});

test('listener registration failure destroys the initialized runtime', async () => {
  const destroy = vi.fn(async () => {});
  const failure = new Error('listener registration failed');

  await expect(bindMetricsLifecycle(runtime(destroy), async () => Promise.reject(failure), vi.fn())).rejects.toBe(failure);
  expect(destroy).toHaveBeenCalledOnce();
});

test('listener removal failure still destroys and deactivates once', async () => {
  const destroy = vi.fn(async () => {});
  const deactivate = vi.fn();
  const failure = new Error('listener removal failed');
  const handle = await bindMetricsLifecycle(runtime(destroy), async () => ({ remove: async () => Promise.reject(failure) }), deactivate);

  await expect(handle.destroy()).rejects.toBe(failure);
  await expect(handle.destroy()).rejects.toBe(failure);
  expect(destroy).toHaveBeenCalledOnce();
  expect(deactivate).toHaveBeenCalledOnce();
});

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
