import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Execute the actual workflow publish steps against a fake registry; never publish to npm.
const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const native = '@rdlabo/capacitor-native-ui';
const theme = '@rdlabo/ionic-theme-ios27';

function runRelease(t, kind, { existing = {}, dependencyMismatch = false, legacy = false, failTheme = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'release-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const version = kind === 'stable' ? '1.2.2' : '1.2.2-beta.pr298.sha0123456789ab';
  const folder = join(directory, kind === 'stable' ? 'npm-release' : 'npm-candidate');
  const names = legacy ? ['@rdlabo/ionic-theme-ios26'] : [native, theme];
  mkdirSync(folder);
  mkdirSync(join(directory, 'package'));
  const registry = {};
  for (const name of names) {
    const manifest = { name, version };
    if (name === theme) manifest.dependencies = { [native]: dependencyMismatch ? '1.2.1' : version };
    writeFileSync(join(directory, 'package/package.json'), JSON.stringify(manifest));
    const archive = join(folder, `${name.replace('@', '').replace('/', '-')}-${version}.tgz`);
    execFileSync('tar', ['-czf', archive, '-C', directory, 'package']);
    registry[`${name}@${version}`] = existing[name] === 'matching'
      ? 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64')
      : existing[name] ?? 'E404';
  }
  writeFileSync(join(directory, 'registry.json'), JSON.stringify(registry));
  const log = join(directory, 'calls.jsonl');
  writeFileSync(join(directory, 'npm'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'view') {
  const value = JSON.parse(fs.readFileSync(process.env.REGISTRY))[args[1]];
  if (value.startsWith('E')) {
    process.stdout.write(JSON.stringify({error: {code: value}}));
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(value));
} else if (args[0] === 'publish' && process.env.FAIL_THEME === 'true' && args[1].includes('ionic-theme-ios27')) {
  process.exit(1);
}
`, { mode: 0o755 });
  const step = kind === 'stable' ? 'Publish packages' : 'Validate and publish candidate';
  const source = workflow.split(`      - name: ${step}\n`)[1].match(/node --input-type=module <<'JS'\n([\s\S]*?)\n          JS/)[1];
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8',
    env: {
      ...process.env, PATH: `${directory}:${process.env.PATH}`, RUNNER_TEMP: directory,
      VERSION: version, EXPECTED_VERSION: version, EXPECTED_NAME: names.at(-1), DIST_TAG: 'beta',
      CALL_LOG: log, REGISTRY: join(directory, 'registry.json'), FAIL_THEME: String(failTheme),
    },
  });
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [];
  return { result, calls, published: calls.filter(call => call[0] === 'publish') };
}

for (const kind of ['stable', 'beta']) {
  test(`${kind}: checks both versions before publishing native then theme`, t => {
    const { result, calls, published } = runRelease(t, kind);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(calls.map(call => call[0]), ['view', 'view', 'publish', 'publish']);
    assert.match(published[0][1], /rdlabo-capacitor-native-ui-/);
    assert.match(published[1][1], /rdlabo-ionic-theme-ios27-/);
    for (const call of published) {
      assert(call.includes('--ignore-scripts'));
      assert(call.includes('--provenance'));
      assert.equal(call.at(-1), kind === 'stable' ? 'latest' : 'beta');
    }
  });
  test(`${kind}: retry completes the theme after a partial release`, t => {
    assert.notEqual(runRelease(t, kind, { failTheme: true }).result.status, 0);
    const { result, published } = runRelease(t, kind, { existing: { [native]: 'matching' } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(published.length, 1);
    assert.match(published[0][1], /rdlabo-ionic-theme-ios27-/);
  });
  test(`${kind}: complete release is idempotent`, t => {
    const { result, published } = runRelease(t, kind, { existing: { [native]: 'matching', [theme]: 'matching' } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(published.length, 0);
  });
  for (const value of ['sha512-different', 'E401', 'E500']) {
    test(`${kind}: ${value} on theme prevents either publication`, t => {
      const { result, published } = runRelease(t, kind, { existing: { [theme]: value } });
      assert.notEqual(result.status, 0);
      assert.equal(published.length, 0);
    });
  }
  test(`${kind}: mismatched native dependency prevents either publication`, t => {
    const { result, published } = runRelease(t, kind, { dependencyMismatch: true });
    assert.notEqual(result.status, 0);
    assert.equal(published.length, 0);
  });
}

test('ios26 beta still publishes its single package', t => {
  const { result, published } = runRelease(t, 'beta', { legacy: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(published.length, 1);
  assert.match(published[0][1], /rdlabo-ionic-theme-ios26-/);
});
