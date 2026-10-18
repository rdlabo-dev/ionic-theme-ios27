import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// npm version has already updated the root manifest. Include every workspace
// and both lockfiles in that same commit, before npm creates the release tag.
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const root = read('package.json');
const version = root.version;
assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
const paths = ['packages/capacitor-native-ui', 'packages/theme-ios27'];
const names = ['@rdlabo/capacitor-native-ui', '@rdlabo/ionic-theme-ios27'];
const manifests = paths.map((path) => read(`${path}/package.json`));
const lock = read('package-lock.json');
const demoLock = read('demo/package-lock.json');
assert.equal(root.private, true, 'The workspace root must remain private');
assert.equal(manifests[1].dependencies[names[0]], 'file:../capacitor-native-ui');
for (const [index, path] of paths.entries()) {
  assert.equal(manifests[index].name, names[index]);
  assert.equal(lock.packages[path]?.name, names[index], `Missing root lock entry: ${path}`);
  assert.equal(demoLock.packages[`../${path}`]?.name, names[index], `Missing demo lock entry: ${path}`);
}
assert.equal(lock.packages[''].name, root.name);
lock.version = version;
lock.packages[''].version = version;
for (const [index, path] of paths.entries()) {
  manifests[index].version = version;
  lock.packages[path].version = version;
  demoLock.packages[`../${path}`].version = version;
}
const updates = [
  ...paths.map((path, index) => [`${path}/package.json`, manifests[index]]),
  ['package-lock.json', lock],
  ['demo/package-lock.json', demoLock],
];
for (const [path, data] of updates) writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
execFileSync('git', ['add', '--', 'package.json', ...updates.map(([path]) => path)]);
console.log(`Both workspaces and lockfiles synchronized to ${version}`);
