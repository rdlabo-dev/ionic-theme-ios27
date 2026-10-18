import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

const files = [
  'package.json',
  'package-lock.json',
  'demo/package-lock.json',
  'packages/capacitor-native-ui/package.json',
  'packages/theme-ios27/package.json',
];
const fixture = (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'native-ui-release-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const path of [...files, '.npmrc', 'scripts/sync-release-version.mjs']) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    copyFileSync(new URL(`../${path}`, import.meta.url), join(cwd, path));
  }
  const read = (path) => JSON.parse(readFileSync(join(cwd, path), 'utf8'));
  const run = (command, args) =>
    execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_cache: join(cwd, '.npm-cache'),
        GIT_AUTHOR_NAME: 'Release test',
        GIT_AUTHOR_EMAIL: 'test@example.invalid',
        GIT_COMMITTER_NAME: 'Release test',
        GIT_COMMITTER_EMAIL: 'test@example.invalid',
      },
    });
  run('git', ['init', '--quiet']);
  run('git', ['config', 'commit.gpgsign', 'false']);
  run('git', ['config', 'tag.gpgsign', 'false']);
  run('git', ['add', '.']);
  run('git', ['commit', '--quiet', '-m', 'Fixture']);
  return { cwd, read, run };
};

for (const version of ['2.0.0', '2.0.0-rc.1']) {
  test(`npm version includes both workspaces and lockfiles in the ${version} tag`, (t) => {
    const { read, run } = fixture(t);
    const demoVersion = read('demo/package-lock.json').version;
    run('npm', ['version', version]);
    const tagged = (path) => JSON.parse(run('git', ['show', `ios27-v${version}:${path}`]));
    for (const path of ['package.json', 'packages/capacitor-native-ui/package.json', 'packages/theme-ios27/package.json']) {
      assert.equal(tagged(path).version, version);
    }
    const lock = tagged('package-lock.json');
    assert.equal(lock.version, version);
    assert.equal(lock.packages[''].version, version);
    const demo = tagged('demo/package-lock.json');
    assert.equal(demo.version, demoVersion);
    for (const path of ['packages/capacitor-native-ui', 'packages/theme-ios27']) {
      assert.equal(lock.packages[path].version, version);
      assert.equal(demo.packages[`../${path}`].version, version);
    }
    assert.equal(tagged('packages/theme-ios27/package.json').dependencies['@rdlabo/capacitor-native-ui'], 'file:../capacitor-native-ui');
    assert.equal(run('git', ['diff', 'HEAD', '--', ...files]), '');
  });
}

test('a missing workspace lock entry fails before synchronization writes any files', (t) => {
  const { cwd, read } = fixture(t);
  const lock = read('demo/package-lock.json');
  delete lock.packages['../packages/theme-ios27'];
  writeFileSync(join(cwd, 'demo/package-lock.json'), JSON.stringify(lock));
  const before = files.map((path) => readFileSync(join(cwd, path), 'utf8'));
  const result = spawnSync(process.execPath, ['scripts/sync-release-version.mjs'], { cwd, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing demo lock entry/);
  files.forEach((path, i) => assert.equal(readFileSync(join(cwd, path), 'utf8'), before[i]));
});
