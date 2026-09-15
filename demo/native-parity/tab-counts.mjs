import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.argv[2]);
const build = JSON.parse(await readFile(resolve(root, 'build.json'), 'utf8'));
const cases = new Map();
for (const name of await readdir(resolve(root, 'metrics'))) {
  const match = name.match(/^(tabs-(count|icons)-(\d))-(native|web|shell)-(light|dark)\.json$/);
  if (!match) continue;
  const data = JSON.parse(await readFile(resolve(root, 'metrics', name), 'utf8'));
  if (data.build?.builtAt !== build.builtAt || data.build?.scriptSha256 !== build.scriptSha256 || data.build?.themeSha256 !== build.themeSha256) continue;
  const down = data.samples.find((s) => s.event === 'pointerdown');
  const rest = data.samples.filter((s) => s.layers && s.t < down?.t).at(-1);
  if (!rest) throw new Error(`${name}: no pre-input resting frame`);
  const [, kind, content, countText, renderer, appearance] = match;
  const count = Number(countText);
  const outerPath = renderer === 'web' ? 'Tabs' : renderer === 'shell' || count === 5 ? 'Tabs/0' : 'Tabs/1';
  const outer = rest.layers.find((l) => l.path === outerPath);
  const cells = rest.layers.filter((l) => renderer === 'web'
    ? l.tag === 'ION-TAB-BUTTON' && !l.class.includes('ion-cloned-element')
    : renderer === 'shell' ? /^Tabs\/0\/0\/0\/[0-4]$/.test(l.path) : new RegExp(`^${outerPath}/0/[0-4]$`).test(l.path));
  const rect = (layer) => layer && [layer.x, layer.y, layer.w, layer.h];
  const key = `${kind}-${appearance}`;
  const entry = cases.get(key) ?? { kind, content, count, appearance, renderers: {} };
  entry.renderers[renderer] = { outer: rect(outer), cells: cells.map(rect), expectedFab: count < 5 };
  cases.set(key, entry);
}
for (const entry of cases.values()) {
  for (const reference of ['shell', 'native']) {
    const a = entry.renderers[reference], b = entry.renderers.web;
    if (!a || !b) continue;
    entry[`${reference}VsWeb`] = {
      outerErrorPt: a.outer.map((v, i) => Math.abs(v - b.outer[i])),
      recordedCells: [a.cells.length, b.cells.length],
      cellErrorsPt: a.cells.map((cell, index) => b.cells[index] ? cell.map((v, i) => Math.abs(v - b.cells[index][i])) : null),
    };
  }
}
const report = {
  note: 'Shell = pinned independent UITabBar + separate FAB. Native = UITabBarController with UISearchTab for counts 1–4; count 5 has no search/FAB. These are distinct UIKit layout policies. Rectangles are x/y/width/height in pt, sampled immediately before first input. No coordinate/time alignment fitted.',
  build,
  cases: [...cases.values()],
};
await writeFile(resolve(root, 'tab-counts.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.cases.length} tab-count cases reported`);
