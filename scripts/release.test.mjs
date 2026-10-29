import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Execute the actual workflow publish steps against a fake registry; never publish to npm.
const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const engine = '@webview-native-ui/engine';
const native = '@rdlabo/capacitor-native-ui';
const theme = '@rdlabo/ionic-theme-ios27';

function runBetaRelease(t, { existing = {}, dependencyMismatch = false, kitDependencyMismatch = false, legacy = false, failTheme = false, missingMaven = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'release-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const version = '1.2.2-beta.pr298.sha0123456789ab';
  const folder = join(directory, 'npm-candidate');
  const names = legacy ? ['@rdlabo/ionic-theme-ios26'] : [native, theme];
  mkdirSync(folder);
  mkdirSync(join(directory, 'package'));
  const registry = {};
  for (const name of names) {
    const manifest = { name, version };
    if (name === native) manifest.dependencies = { [engine]: kitDependencyMismatch ? '^2.0.0' : '^1.0.0' };
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
  writeFileSync(join(directory, 'curl'), '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$MAVEN_LOG"\n[ "$MISSING_MAVEN" != true ]\n', { mode: 0o755 });
  const step = 'Validate and publish candidate';
  const source = workflow.split(`      - name: ${step}\n`)[1].match(/node --input-type=module <<'JS'\n([\s\S]*?)\n          JS/)[1];
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8',
    env: {
      ...process.env, PATH: `${directory}:${process.env.PATH}`, RUNNER_TEMP: directory,
      VERSION: version, EXPECTED_VERSION: version, EXPECTED_NAME: names.at(-1), DIST_TAG: 'beta',
      MAVEN_LOG: join(directory, 'maven.log'), CALL_LOG: log, REGISTRY: join(directory, 'registry.json'), FAIL_THEME: String(failTheme), MISSING_MAVEN: String(missingMaven),
    },
  });
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [];
  return { result, calls, published: calls.filter(call => call[0] === 'publish'), maven: existsSync(join(directory, 'maven.log')) ? readFileSync(join(directory, 'maven.log'), 'utf8') : '' };
}

test(`beta: checks all versions before publishing native, then theme`, t => {
  const { result, calls, published } = runBetaRelease(t);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls.map(call => call[0]), ['view', 'view', 'publish', 'publish']);
  assert.match(published[0][1], /rdlabo-capacitor-native-ui-/);
  assert.match(published[1][1], /rdlabo-ionic-theme-ios27-/);
  for (const call of published) {
    assert(call.includes('--ignore-scripts'));
    assert(call.includes('--provenance'));
    assert.equal(call.at(-1), 'beta');
  }
});
test(`beta: retry completes the theme after a partial release`, t => {
  assert.notEqual(runBetaRelease(t, { failTheme: true }).result.status, 0);
  const { result, published } = runBetaRelease(t, { existing: { [native]: 'matching' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(published.length, 1);
  assert.match(published[0][1], /rdlabo-ionic-theme-ios27-/);
});
test(`beta: complete release is idempotent`, t => {
  const { result, published } = runBetaRelease(t, { existing: { [native]: 'matching', [theme]: 'matching' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(published.length, 0);
});
for (const value of ['sha512-different', 'E401', 'E500']) {
  test(`beta: ${value} on theme prevents either publication`, t => {
    const { result, published } = runBetaRelease(t, { existing: { [theme]: value } });
    assert.notEqual(result.status, 0);
    assert.equal(published.length, 0);
  });
}
test(`beta: mismatched native dependency prevents either publication`, t => {
  const { result, published } = runBetaRelease(t, { dependencyMismatch: true });
  assert.notEqual(result.status, 0);
  assert.equal(published.length, 0);
});

test('ios26 beta still publishes its single package', t => {
  const { result, published } = runBetaRelease(t, { legacy: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(published.length, 1);
  assert.match(published[0][1], /rdlabo-ionic-theme-ios26-/);
});

for (const version of ['2.0.0', '2.0.0-0']) {
  test(`versioned release: publishes workspaces in dependency order (${version})`, t => {
    const { result, published } = runWorkspaceRelease(t, version);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(published.map(call => call[call.indexOf('--workspace') + 1]), ['packages/capacitor-native-ui', 'packages/theme-ios27']);
    for (const call of published) {
      assert(call.includes('--provenance'));
      assert(!call.includes('--ignore-scripts'), 'Capacitor prepublishOnly must run');
      assert.equal(call.at(-1), version.includes('-') ? 'next' : 'latest');
    }
  });
}

test('versioned release: dependency mismatch prevents either publication', t => {
  const { result, published } = runWorkspaceRelease(t, '2.0.0', true);
  assert.notEqual(result.status, 0);
  assert.equal(published.length, 0);
});

function runWorkspaceRelease(t, version, mismatch = false) {
  const directory = mkdtempSync(join(tmpdir(), 'workspace-release-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const workspaces = ['packages/capacitor-native-ui', 'packages/theme-ios27'];
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ version, workspaces }));
  for (const [index, workspace] of workspaces.entries()) {
    mkdirSync(join(directory, workspace), { recursive: true });
    writeFileSync(join(directory, workspace, 'package.json'), JSON.stringify({
      name: [native, theme][index], version,
      dependencies: index === 0 ? { [engine]: '^1.0.0' } : { [native]: mismatch ? '1.2.1' : version },
    }));
  }
  const log = join(directory, 'calls.jsonl');
  writeFileSync(join(directory, 'npm'), `#!/usr/bin/env node
require('node:fs').appendFileSync(process.env.CALL_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
`, { mode: 0o755 });
  const source = workflow.split('      - name: Publish packages\n')[1].match(/node --input-type=module <<'JS'\n([\s\S]*?)\n          JS/)[1];
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: directory, encoding: 'utf8',
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, VERSION: version, CALL_LOG: log },
  });
  const published = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [];
  return { result, published };
}

test('beta: incompatible Engine major prevents all publication', t => {
  const { result, published } = runBetaRelease(t, { kitDependencyMismatch: true });
  assert.notEqual(result.status, 0);
  assert.equal(published.length, 0);
});

test('beta: missing Maven dependency prevents npm publication', t => {
  const { result, published } = runBetaRelease(t, { missingMaven: true });
  assert.notEqual(result.status, 0);
  assert.equal(published.length, 0);
});

test('beta: verifies the minimum compatible Engine version in Maven', t => {
  const { result, maven } = runBetaRelease(t);
  assert.equal(result.status, 0, result.stderr);
  assert.match(maven, /webview-native-ui\/engine\/1\.0\.0\/engine-1\.0\.0\.pom/);
  assert.match(maven, /engine-1\.0\.0\.aar/);
  assert(!maven.includes('beta.pr'));
});
