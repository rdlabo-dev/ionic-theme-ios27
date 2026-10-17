import assert from 'node:assert/strict';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, mkdirSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Validate the archives consumers install, not the workspace symlinks.
const dir = mkdtempSync(join(tmpdir(), 'ionic-theme-packages-'));
const candidateVersion = process.argv.includes('--candidate') ? '0.0.0-beta.pack-verification' : undefined;
const sourceFiles = [
  'package.json',
  'package-lock.json',
  'demo/package-lock.json',
  'packages/theme-ios27/package.json',
  'packages/capacitor-native-ui/package.json',
];
const originals = sourceFiles.map((file) => readFileSync(file, 'utf8'));
try {
  const packed = JSON.parse(
    execFileSync(
      process.execPath,
      ['scripts/pack-packages.mjs', '--pack-destination', dir, ...(candidateVersion ? ['--version', candidateVersion] : [])],
      { encoding: 'utf8' },
    ),
  );
  assert.equal(packed.length, 2);
  sourceFiles.forEach((file, index) => assert.equal(readFileSync(file, 'utf8'), originals[index], `${file} changed while packing`));
  const nativeName = '@ionic-theme/capacitor-native-ui';
  const manifests = new Map();
  for (const archive of packed) {
    const manifest = JSON.parse(execFileSync('tar', ['-xOf', join(dir, archive.filename), 'package/package.json'], { encoding: 'utf8' }));
    manifests.set(manifest.name, manifest);
    if (candidateVersion) assert.equal(manifest.version, candidateVersion);
    const extracted = join(dir, archive.filename + '-extracted');
    mkdirSync(extracted);
    execFileSync('tar', ['-xzf', join(dir, archive.filename), '-C', extracted]);
    const packageRoot = join(extracted, 'package');
    const dependencyPath = join(dir, 'node_modules', manifest.name);
    mkdirSync(join(dependencyPath, '..'), { recursive: true });
    symlinkSync(packageRoot, dependencyPath, 'dir');
    symlinkSync(join(dir, 'node_modules'), join(packageRoot, 'node_modules'), 'dir');
    const files = new Set(archive.files.map((file) => file.path));

    // Hoisted workspace dependencies must not hide undeclared runtime imports.
    const dependencies = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]);
    for (const file of files) {
      if (!file.startsWith('dist/') || !file.endsWith('.js')) continue;
      const source = ts.createSourceFile(
        file,
        readFileSync(join(packageRoot, file), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      );
      const visit = (node) => {
        const specifier =
          ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
            ? node.moduleSpecifier
            : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
              ? node.arguments[0]
              : undefined;
        if (specifier && ts.isStringLiteral(specifier) && !specifier.text.startsWith('.')) {
          const name = specifier.text
            .split('/')
            .slice(0, specifier.text.startsWith('@') ? 2 : 1)
            .join('/');
          assert(dependencies.has(name), `${manifest.name}: undeclared dependency ${name} in ${file}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    for (const entry of Object.values(manifest.exports)) {
      for (const target of typeof entry === 'string' ? [entry] : Object.values(entry)) {
        if (!target.includes('*')) assert(files.has(target.replace(/^\.\//, '')), `${manifest.name}: missing ${target}`);
      }
    }
    assert(files.has('README.md'));
    assert(files.has('LICENSE'));
    if (manifest.name === nativeName) {
      assert.equal(manifest.capacitor.ios.src, 'ios');
      assert.equal(manifest.capacitor.android.src, 'android');
      assert(files.has('Package.swift'));
      assert(files.has('android/build.gradle'));
      assert(files.has('android/proguard-rules.pro'));
      assert(files.has('IonicThemeCapacitorNativeUi.podspec'));
      assert(files.has('ios/Sources/IonicNativeUIShellPlugin/IonicNativeUIShellPlugin.swift'));
      assert(files.has('android/src/main/java/dev/rdlabo/capacitor/nativeui/IonicNativeUIShellPlugin.java'));
      assert(!manifest.dependencies?.['@rdlabo/ionic-theme-ios27'], 'Native UI must not depend on the theme');
    } else {
      assert.equal(manifest.name, '@rdlabo/ionic-theme-ios27');
      assert.equal(manifest.capacitor, undefined, 'Only the native package registers a Capacitor plugin');
      assert(!files.has('Package.swift'));
      for (const entry of ['native', 'vertical-bars']) {
        assert.equal(manifest.exports['./' + entry], undefined, 'Removed theme entry must not be exported');
        assert(![...files].some((file) => file.startsWith('src/' + entry) || file.startsWith('dist/' + entry)));
      }
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
    import * as vertical from '@ionic-theme/capacitor-native-ui/vertical-bars';
    assert.equal(typeof native.enableNativeUIShell, 'function');
    assert.equal(typeof vertical.enableVerticalControlArea, 'function');
    for (const entry of ['native', 'vertical-bars']) {
      await assert.rejects(import('@rdlabo/ionic-theme-ios27/' + entry), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    }
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
