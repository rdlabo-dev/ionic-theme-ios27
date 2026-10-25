import { afterEach, expect, test, vi } from 'vitest';
import { relayStyles } from '../../packages/capacitor-native-ui/src/native/overlays/styles';

const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((stop) => stop());
  vi.restoreAllMocks();
});
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('source-only snapshot styles never enter or invalidate the native popover, while application styles still do', async () => {
  const source = document.implementation.createHTMLDocument();
  Object.defineProperty(source, 'adoptedStyleSheets', { value: [] });
  const overlay = document.createElement('ion-popover');
  source.body.append(overlay);
  cleanup.push(() => overlay.remove());
  const local = document.createElement('style');
  local.setAttribute('data-overlay-relay-local', '');
  local.setAttribute('data-native-ui-snapshot', '');
  local.textContent = '[data-native-ui-snapshot]::before { background:red; }';
  source.head.append(local);
  cleanup.push(() => local.remove());
  const destination = document.implementation.createHTMLDocument();
  const changed = vi.fn();
  const relay = relayStyles(source, destination, overlay, changed);
  cleanup.push(relay.stop);
  await relay.ready;
  expect(destination.querySelector('style[data-native-ui-snapshot]')).toBeNull();
  local.textContent = '[data-native-ui-snapshot]::before { background:blue; }';
  await tick();
  local.firstChild!.textContent = '[data-native-ui-snapshot]::before { background:green; }';
  local.setAttribute('data-native-ui-snapshot', 'next-image');
  await tick();
  local.remove();
  await tick();
  source.head.append(local);
  await tick();
  expect(changed).not.toHaveBeenCalled();
  expect(destination.querySelector('style[data-native-ui-snapshot]')).toBeNull();

  const application = document.createElement('style');
  application.setAttribute('data-test-application-theme', '');
  application.textContent = 'ion-popover { color:red; }';
  cleanup.push(() => application.remove());
  // A mixed batch must still relay the application change.
  local.remove();
  source.head.append(application);
  await tick();
  expect(changed).toHaveBeenCalledOnce();
  expect(destination.querySelector('style[data-test-application-theme]')?.textContent).toBe(application.textContent);
  application.textContent = 'ion-popover { color:blue; }';
  await tick();
  expect(changed).toHaveBeenCalledTimes(2);
  expect(destination.querySelector('style[data-test-application-theme]')?.textContent).toBe(application.textContent);
});

test('reapplying unchanged ancestor attributes does not dismiss a native popover', async () => {
  const source = document.implementation.createHTMLDocument();
  Object.defineProperty(source, 'adoptedStyleSheets', { value: [] });
  source.documentElement.className = 'ios native-ui-prehide';
  const overlay = source.createElement('ion-popover');
  source.body.append(overlay);
  const destination = document.implementation.createHTMLDocument();
  const changed = vi.fn();
  const relay = relayStyles(source, destination, overlay, changed);
  cleanup.push(relay.stop);
  await relay.ready;
  source.documentElement.classList.add('native-ui-prehide');
  source.documentElement.setAttribute('class', 'ios native-ui-prehide');
  await tick();
  expect(changed).not.toHaveBeenCalled();
  source.documentElement.classList.add('ion-palette-dark');
  await tick();
  expect(changed).toHaveBeenCalledOnce();
  expect(destination.documentElement.classList.contains('ion-palette-dark')).toBe(true);
});
