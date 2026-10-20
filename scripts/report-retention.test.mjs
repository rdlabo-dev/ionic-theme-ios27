import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../.github/workflows/e2e-pull_request.yml', import.meta.url), 'utf8');
const source = workflow.split('      - name: Prune closed PR reports and check current head\n')[1]
  .split('          script: |\n')[1].split('\n      - name:')[0];

function check(t, { action = 'synchronize', open = true, head = 'current', apiFailure = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'report-retention-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'gh-pages'));
  for (const name of ['pr-1', 'pr-2', 'pr-3', 'assets']) mkdirSync(join(directory, 'gh-pages', name));
  writeFileSync(join(directory, 'gh-pages/.nojekyll'), '');
  const pulls = [{ number: 2, head: { sha: 'other' } }, ...(open ? [{ number: 3, head: { sha: head } }] : [])];
  const result = spawnSync(process.execPath, ['-e', `
    const github = { rest: { pulls: { list: {} } }, paginate: async () => {
      if (${apiFailure}) throw new Error('API unavailable');
      return ${JSON.stringify(pulls)};
    } };
    const context = { repo: {}, payload: { action: ${JSON.stringify(action)}, pull_request: { number: 3, head: { sha: 'current' } } } };
    const core = { info() {}, setOutput(name, value) { console.log(JSON.stringify({ [name]: value })); } };
    (async () => { ${source} })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd: directory, encoding: 'utf8' });
  return { result, files: readdirSync(join(directory, 'gh-pages')), output: result.status === 0 ? JSON.parse(result.stdout) : undefined };
}

test('prunes all closed reports while retaining open reports and site files', t => {
  const { result, files, output } = check(t);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(files.sort(), ['.nojekyll', 'assets', 'pr-2', 'pr-3']);
  assert.equal(output.publish, true);
});

test('close event removes the current report without downloading an artifact', t => {
  const { files, output } = check(t, { action: 'closed', open: false });
  assert.deepEqual(files.sort(), ['.nojekyll', 'assets', 'pr-2']);
  assert.equal(output.publish, false);
});

test('stale head cannot overwrite the newer open PR report', t => {
  const { files, output } = check(t, { head: 'newer' });
  assert(files.includes('pr-3'));
  assert.equal(output.publish, false);
});

test('API failure leaves reports untouched', t => {
  const { result, files } = check(t, { apiFailure: true });
  assert.notEqual(result.status, 0);
  assert.deepEqual(files.sort(), ['.nojekyll', 'assets', 'pr-1', 'pr-2', 'pr-3']);
});
