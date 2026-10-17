import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: { version: { type: 'string' }, 'pack-destination': { type: 'string', default: '.' } } });
const destination = resolve(values['pack-destination']);
const version = values.version ?? JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version), 'Invalid package version');
const staging = mkdtempSync(join(tmpdir(), 'native-ui-pack-'));
try {
  mkdirSync(destination, { recursive: true });
  const packages = JSON.parse(
    execFileSync('npm', ['pack', '--workspaces', '--ignore-scripts', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' }),
  );
  const locations = new Map(
    packages.map((pkg) => [
      pkg.name,
      join(root, pkg.name === '@ionic-theme/capacitor-native-ui' ? 'packages/capacitor-native-ui' : 'packages/theme-ios27'),
    ]),
  );
  const archives = [];
  for (const pkg of packages) {
    const source = locations.get(pkg.name);
    const target = join(staging, pkg.name.replaceAll('/', '-'));
    for (const { path } of pkg.files) {
      mkdirSync(dirname(join(target, path)), { recursive: true });
      copyFileSync(join(source, path), join(target, path));
    }
    const manifestPath = join(target, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.version = version;
    for (const [name, specifier] of Object.entries(manifest.dependencies ?? {})) {
      if (!specifier.startsWith('file:')) continue;
      assert.equal(resolve(source, specifier.slice(5)), locations.get(name), `Unknown local dependency: ${name}`);
      manifest.dependencies[name] = version;
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    archives.push(
      ...JSON.parse(
        execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', destination], { cwd: target, encoding: 'utf8' }),
      ),
    );
  }
  console.log(JSON.stringify(archives, null, 2));
} finally {
  rmSync(staging, { recursive: true, force: true });
}
