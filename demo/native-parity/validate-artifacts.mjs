import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// An interaction driver passing is insufficient if its recorder silently failed.
const root = resolve(process.argv[2] ?? '.');
const read = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const build = await read('build.json');
const manifest = await read('attachments/manifest.json');
const expected = new Set();
for (const test of manifest) {
  for (const attachment of test.attachments ?? []) {
    const match = attachment.suggestedHumanReadableName?.match(/^([a-z-]+)-(native|web|shell)-(light|dark)-rest_/);
    if (match) expected.add(`${match[1]}-${match[2]}-${match[3]}`);
  }
}
if (expected.size === 0) throw new Error('No named parity screenshots: no measurements validated');
for (const name of expected) {
  const data = await read(`metrics/${name}.json`);
  for (const key of ['builtAt', 'revision', 'themeSha256', 'scriptSha256', 'ionicCssSha256', 'ionicCore']) {
    if (data.build?.[key] !== build[key]) throw new Error(`${name}: stale ${key}`);
  }
  if (!(data.width > 0 && data.height > 0 && data.scale > 0)) throw new Error(`${name}: invalid viewport`);
  if (!data.samples?.some((sample) => sample.layers?.length)) throw new Error(`${name}: no geometry frames`);
  if (!data.samples.some((sample) => sample.event === 'pointerdown')) throw new Error(`${name}: no input sequence`);
  if (name.startsWith('tabs-motion-web-')) {
    for (const event of ['pointerdown', 'pointerup', 'ionTabButtonClick']) {
      const count = data.samples.filter((sample) => sample.event === event).length;
      if (count !== 7) throw new Error(`${name}: expected 7 ${event} events, received ${count}`);
    }
  }
  console.log(`${name}: current-build geometry and input recorded`);
}
