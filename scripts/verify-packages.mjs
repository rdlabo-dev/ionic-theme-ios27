import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Validate the archives consumers install, not the workspace symlinks.
const dir = mkdtempSync(join(tmpdir(), 'ionic-theme-packages-'));
try {
  const packed = JSON.parse(
    execFileSync('npm', ['pack', '--workspaces', '--ignore-scripts', '--json', '--pack-destination', dir], { encoding: 'utf8' }),
  );
  assert.equal(packed.length, 2);
  const nativeName = '@ionic-theme/capacitor-native-ui';
  const manifests = new Map();
  for (const archive of packed) {
    const manifest = JSON.parse(execFileSync('tar', ['-xOf', join(dir, archive.filename), 'package/package.json'], { encoding: 'utf8' }));
    manifests.set(manifest.name, manifest);
    const extracted = join(dir, archive.filename + '-extracted');
    mkdirSync(extracted);
    execFileSync('tar', ['-xzf', join(dir, archive.filename), '-C', extracted]);
    const packageRoot = join(extracted, 'package');
    const dependencyPath = join(dir, 'node_modules', manifest.name);
    mkdirSync(join(dependencyPath, '..'), { recursive: true });
    symlinkSync(packageRoot, dependencyPath, 'dir');
    symlinkSync(join(dir, 'node_modules'), join(packageRoot, 'node_modules'), 'dir');
    const files = new Set(archive.files.map((file) => file.path));
    for (const entry of Object.values(manifest.exports)) {
      for (const target of typeof entry === 'string' ? [entry] : Object.values(entry)) {
        if (!target.includes('*')) assert(files.has(target.replace(/^\.\//, '')), `${manifest.name}: missing ${target}`);
      }
    }
    assert(files.has('README.md'));
    assert(files.has('LICENSE'));
    if (manifest.name === nativeName) {
      assert.equal(manifest.capacitor.ios.src, 'ios');
      assert(files.has('Package.swift'));
      assert(files.has('ios/Sources/IonicNativeUIShellPlugin/IonicNativeUIShellPlugin.swift'));
      assert(!manifest.dependencies?.['@rdlabo/ionic-theme-ios27'], 'Native UI must not depend on the theme');
    } else {
      assert.equal(manifest.name, '@rdlabo/ionic-theme-ios27');
      assert.equal(manifest.capacitor, undefined, 'Only the native package registers a Capacitor plugin');
      assert(!files.has('Package.swift'));
      assert(![...files].some((file) => file.startsWith('ios/')));
      execFileSync('tar', ['-xzf', join(dir, archive.filename), '-C', dir]);
      execFileSync('node_modules/.bin/sass', [
        join(dir, 'package/src/styles/ionic-theme-ios27.scss'),
        join(dir, 'consumer.css'),
        '--no-source-map',
      ]);
      assert(existsSync(join(dir, 'consumer.css')));
    }
  }
  assert.equal(manifests.get('@rdlabo/ionic-theme-ios27').dependencies[nativeName], manifests.get(nativeName).version);
  // Only external dependencies come from the workspace; both packages resolve from archives.
  for (const name of ['@ionic', '@capacitor', '@stencil', '@rdlabo/ionic-theme-utils', 'ionicons', 'typescript']) {
    symlinkSync(resolve('node_modules', name), join(dir, 'node_modules', name), 'dir');
  }
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import * as native from '@ionic-theme/capacitor-native-ui';
    import * as legacy from '@rdlabo/ionic-theme-ios27/native';
    import * as vertical from '@ionic-theme/capacitor-native-ui/vertical-bars';
    import * as oldVertical from '@rdlabo/ionic-theme-ios27/vertical-bars';
    assert.equal(native.enableNativeUIShell, legacy.enableNativeUIShell);
    assert.equal(vertical.enableVerticalControlArea, oldVertical.enableVerticalControlArea);
  `,
    ],
    { cwd: dir, stdio: 'inherit' },
  );
  if (process.argv.includes('--esm')) {
    for (const archive of packed) {
      execFileSync(
        process.execPath,
        [resolve('node_modules/@rdlabo/ionic-theme-utils/scripts/check-esm.mjs'), join(dir, archive.filename + '-extracted/package')],
        { stdio: 'inherit' },
      );
    }
  }
  console.log('Both package archives, public exports, plugin ownership, dependency direction and standalone Sass verified.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
