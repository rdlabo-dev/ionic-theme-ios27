import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
const runtime = readFileSync('ios/Sources/CapacitorNativeUIEngine/Resources/native-ui-engine.js', 'utf8');

test('the bundled native runtime matches the TypeScript source', () => {
  const expected = buildSync({
    entryPoints: ['src/native-bootstrap.ts'],
    bundle: true,
    alias: { '@capacitor/core': new URL('../src/native-capacitor.ts', import.meta.url).pathname },
    format: 'iife',
    globalName: 'CapacitorNativeUIEngineRuntime',
    minify: true,
    target: ['safari15', 'chrome100'],
    write: false,
  }).outputFiles[0].text;
  expect(runtime).toBe(expected);
});

test('injected runtime retains the existing Capacitor object and disposes a pending startup', async ({ page }) => {
  await page.setContent('<div id="slot" style="width:120px;height:40px"></div>');
  await page.evaluate(() => {
    const w = window as any;
    w.events = {};
    w.messages = [];
    w.removals = 0;
    w.originalCapacitor = {
      registerPlugin: () => {
        throw new Error('Must not register or wrap a plugin');
      },
      convertFileSrc: () => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"/>'),
      addListener: (_plugin: string, name: string, fn: Function) => {
        w.events[name] = fn;
        return {
          remove: () => {
            w.removals++;
            delete w.events[name];
          },
        };
      },
    };
    w.Capacitor = w.originalCapacitor;
    w.channel = {
      postMessage: (raw: string) => {
        w.messages.push(JSON.parse(raw));
      },
    };
  });
  await page.addScriptTag({ content: runtime });
  await page.evaluate(() => {
    const w = window as any;
    w.start = w.CapacitorNativeUIEngineRuntime.start({
      id: 'channel',
      plugin: 'Fixture',
      projectionSelector: '#slot',
      receiveListeners: { update: ['updated'] },
    }).catch(() => {});
  });
  await expect.poll(() => page.evaluate(() => (window as any).messages.length)).toBe(1);
  await page.evaluate(async () => {
    const w = window as any;
    await w.CapacitorNativeUIEngineRuntime.stop('channel');
    await w.start;
    w.CapacitorNativeUIEngineRuntime.receive('channel', w.messages[0].key, { destination: 'native' });
  });
  expect(await page.evaluate(() => (window as any).Capacitor === (window as any).originalCapacitor)).toBe(true);
  expect(await page.evaluate(() => Object.keys((window as any).events))).toEqual([]);
  expect(await page.evaluate(() => (window as any).messages.length)).toBe(1);
  await expect(page.locator('#slot')).not.toHaveAttribute('data-native-ui-snapshot');
});
