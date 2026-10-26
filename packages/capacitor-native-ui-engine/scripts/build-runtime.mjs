import { build } from 'esbuild';
await build({
  entryPoints: [new URL('../src/native-bootstrap.ts', import.meta.url).pathname],
  outfile: new URL('../ios/Sources/CapacitorNativeUIEngine/Resources/native-ui-engine.js', import.meta.url).pathname,
  bundle: true,
  alias: { '@capacitor/core': new URL('../src/native-capacitor.ts', import.meta.url).pathname },
  format: 'iife',
  globalName: 'CapacitorNativeUIEngineRuntime',
  minify: true,
  target: ['safari15', 'chrome100'],
});
