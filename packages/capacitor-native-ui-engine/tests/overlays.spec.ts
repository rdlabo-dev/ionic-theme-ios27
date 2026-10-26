import { expect, test } from '@playwright/test';
import { buildSync } from 'esbuild';
const bundle = (name: string) =>
  buildSync({
    stdin: { contents: "export * from './src/ionic'; export * from './src/overlays';", resolveDir: process.cwd() },
    bundle: true,
    format: 'iife',
    globalName: name,
    write: false,
  }).outputFiles[0].text;

test('separate bundles share one opt-in monitor and subscriber teardown does not stop other plugins', async ({ page }) => {
  await page.setContent('<div id="slot"></div><ion-modal></ion-modal>');
  await page.addScriptTag({ content: bundle('first') });
  await page.addScriptTag({ content: bundle('second') });
  const result = await page.evaluate(() => {
    const w = window as any;
    const one = w.first.getOverlayCoordinator(document);
    const two = w.second.getOverlayCoordinator(document);
    const modal = document.querySelector('ion-modal')!;
    const emit = (type: string) => modal.dispatchEvent(new CustomEvent(type, { bubbles: true }));
    emit('ionModalWillPresent');
    const inert = one.active.size === 0;
    let events = 0;
    const remove = one.subscribe(() => events++);
    w.first.enableSupportIonicOverlays();
    w.second.enableSupportIonicOverlays();
    events = 0;
    emit('ionModalWillPresent');
    const once = events;
    remove();
    emit('ionModalDidDismiss');
    return { shared: one === two, inert, once, dismissed: two.active.size === 0 };
  });
  expect(result).toEqual({ shared: true, inert: true, once: 1, dismissed: true });
});

test('DOM ownership, nested overlays, sheet backdrops and native windows determine coverage', async ({ page }) => {
  await page.setContent(
    '<div id="page"></div><ion-modal style="z-index:10"><native-ad id="inside"></native-ad></ion-modal><ion-alert style="z-index:20"></ion-alert>',
  );
  await page.addScriptTag({ content: bundle('engine') });
  const result = await page.evaluate(() => {
    const engine = (window as any).engine;
    const state = engine.enableSupportIonicOverlays();
    const modal = document.querySelector('ion-modal')!;
    const alert = document.querySelector('ion-alert')!;
    const page = document.querySelector('#page')!;
    const inside = document.querySelector('#inside')!;
    const emit = (element: Element, type: string, detail?: unknown) =>
      element.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
    emit(modal, 'ionModalWillPresent');
    const first = [state.isCovered(page), state.isCovered(inside)];
    emit(alert, 'ionAlertWillPresent');
    const nested = [state.isCovered(page), state.isCovered(inside)];
    state.setNative(alert, true);
    const native = state.isCovered(inside);
    state.setNative(alert, false);
    const fallback = state.isCovered(inside);
    emit(alert, 'ionAlertDidDismiss');
    emit(modal, 'ionBreakpointDidChange', { breakpoint: 0.2 });
    Object.assign(modal, { backdropBreakpoint: 0.3 });
    const uncoveredSheet = state.isCovered(page);
    emit(modal, 'ionBreakpointDidChange', { breakpoint: 0.8 });
    const coveredSheet = state.isCovered(page);
    emit(modal, 'ionBreakpointDidChange', { breakpoint: 0 });
    emit(modal, 'ionModalWillDismiss');
    const closing = state.isCovered(page);
    emit(modal, 'ionModalDidDismiss');
    return { first, nested, native, fallback, uncoveredSheet, coveredSheet, closing, closed: state.isCovered(page) };
  });
  expect(result).toEqual({
    first: [true, false],
    nested: [true, true],
    native: false,
    fallback: true,
    uncoveredSheet: false,
    coveredSheet: true,
    closing: true,
    closed: false,
  });
});

test('late enable, custom definitions and exclusions remain shared across default initialization', async ({ page }) => {
  await page.setContent('<native-ad></native-ad><ion-loading></ion-loading><app-dialog></app-dialog>');
  await page.addScriptTag({ content: bundle('engine') });
  const result = await page.evaluate(async () => {
    const w = window as any;
    const loading = document.querySelector('ion-loading')!;
    Object.assign(loading, { presented: true });
    const target = document.querySelector('native-ad')!;
    const state = w.engine.enableSupportIonicOverlays();
    const late = state.isCovered(target);
    w.engine.enableSupportIonicOverlays({
      exclude: 'ion-loading',
      additional: [{ selector: 'app-dialog', events: { willPresent: 'appOpen', didDismiss: 'appClose' } }],
    });
    w.engine.enableSupportIonicOverlays();
    const excluded = state.isCovered(target);
    const dialog = document.querySelector('app-dialog')!;
    dialog.dispatchEvent(new CustomEvent('appOpen', { bubbles: true }));
    const custom = state.isCovered(target);
    dialog.remove();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    return { late, excluded, custom, removed: state.isCovered(target) };
  });
  expect(result).toEqual({ late: true, excluded: false, custom: true, removed: false });
});

test('custom routes are deduplicated and removed when configuration changes', async ({ page }) => {
  await page.setContent('<native-ad></native-ad><app-dialog></app-dialog>');
  await page.addScriptTag({ content: bundle('engine') });
  const result = await page.evaluate(() => {
    const w = window as any;
    const rule = { selector: 'app-dialog', events: { willPresent: 'openDialog', didDismiss: 'closeDialog' } };
    const state = w.engine.enableSupportIonicOverlays({ additional: [rule, rule] });
    let notifications = 0;
    state.subscribe(() => notifications++);
    const dialog = document.querySelector('app-dialog')!;
    const target = document.querySelector('native-ad')!;
    dialog.dispatchEvent(new CustomEvent('openDialog', { bubbles: true }));
    const once = notifications;
    const covered = state.isCovered(target);
    w.engine.enableSupportIonicOverlays({ additional: [] });
    notifications = 0;
    dialog.dispatchEvent(new CustomEvent('openDialog', { bubbles: true }));
    return { once, covered, removed: !state.isCovered(target), removedNotifications: notifications };
  });
  expect(result).toEqual({ once: 1, covered: true, removed: true, removedNotifications: 0 });
});
