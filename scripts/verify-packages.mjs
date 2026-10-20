import assert from 'node:assert/strict';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, mkdirSync, symlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Validate the archives consumers install, not the workspace symlinks.
const dir = mkdtempSync(join(tmpdir(), 'ionic-theme-packages-'));
const sourceFiles = [
  'package.json',
  'package-lock.json',
  'demo/package-lock.json',
  'packages/theme-ios27/package.json',
  'packages/capacitor-native-ui/package.json',
];
const originals = sourceFiles.map((file) => readFileSync(file, 'utf8'));
try {
  const packed = Object.values(JSON.parse(
    execFileSync('npm', ['pack', '--workspaces', '--ignore-scripts', '--json', '--pack-destination', dir], { encoding: 'utf8' }),
  ));
  assert.equal(packed.length, 2);
  sourceFiles.forEach((file, index) => assert.equal(readFileSync(file, 'utf8'), originals[index], `${file} changed while packing`));
  const nativeName = '@rdlabo/capacitor-native-ui';
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
      assert(readFileSync(join(packageRoot, 'Package.swift'), 'utf8').includes('name: "RdlaboCapacitorNativeUi"'), 'Capacitor-generated SPM product must exist');
      assert(files.has('android/build.gradle'));
      assert(files.has('android/proguard-rules.pro'));
      assert(files.has('RdlaboCapacitorNativeUi.podspec'));
      assert(files.has('ios/Sources/NativeUIPlugin/NativeUIPlugin.swift'));
      assert(files.has('android/src/main/java/dev/rdlabo/capacitor/nativeui/NativeUIPlugin.kt'));
      // The published JavaScript and native binaries must register the same bridge.
      for (const [file, registration] of [
        ['src/native/activation.ts', "registerPlugin<NativeUIPlugin>('NativeUI')"],
        ['ios/Sources/NativeUIPlugin/NativeUIPlugin.swift', 'jsName = "NativeUI"'],
        ['android/src/main/java/dev/rdlabo/capacitor/nativeui/NativeUIPlugin.kt', '@CapacitorPlugin(name = "NativeUI")'],
      ]) assert(readFileSync(join(packageRoot, file), 'utf8').includes(registration), `Bridge registration mismatch: ${file}`);

      assert(!manifest.dependencies?.['@rdlabo/ionic-theme-ios27'], 'Native UI must not depend on the theme');
      assert(!files.has('dist/native-integration/transition.js'), 'Ionic transition adapter belongs to the theme');
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
  // Verify the core entry with neither Ionic nor the Ionic utilities installed.
  assert.equal(manifests.get(nativeName).peerDependenciesMeta['@ionic/core'].optional, true);
  assert(manifests.get(nativeName).dependencies['@rdlabo/ionic-theme-utils'], 'Native UI must install its own Ionic utilities');
  assert.equal(manifests.get(nativeName).peerDependencies['@rdlabo/ionic-theme-utils'], undefined);
  symlinkSync(resolve('node_modules/@capacitor'), join(dir, 'node_modules/@capacitor'), 'dir');
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { enableNativeUI } from '@rdlabo/capacitor-native-ui/core';
    assert.equal(typeof enableNativeUI, 'function');
    await assert.rejects(import('@ionic/core'), { code: 'ERR_MODULE_NOT_FOUND' });
    await assert.rejects(import('@rdlabo/ionic-theme-utils'), { code: 'ERR_MODULE_NOT_FOUND' });
  `], { cwd: dir, stdio: 'inherit' });
  const consumer = join(dir, 'consumer.ts');
  writeFileSync(consumer, `
    import { enableNativeUI } from '@rdlabo/capacitor-native-ui/core';
    async function start(root: HTMLElement) {
      const shell = await enableNativeUI({ root, controls: { tabs: false }, verticalBars: { enabled: true, only: true } });
      await shell.disableVerticalControlArea();
      await shell.enableVerticalControlArea();
      await shell.destroy();
    }
    // @ts-expect-error Availability is automatic; enabled is boolean only.
    enableNativeUI({ verticalBars: { enabled: 'auto' } });
  `);
  execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2022', '--lib', 'es2022,dom', consumer], {cwd: dir, stdio: 'inherit'});
  // Only external dependencies come from the workspace; both packages resolve from archives.
  for (const name of ['@ionic', '@stencil', '@rdlabo/ionic-theme-utils', 'ionicons', 'typescript']) {
    symlinkSync(resolve('node_modules', name), join(dir, 'node_modules', name), 'dir');
  }
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import * as native from '@rdlabo/capacitor-native-ui';
    import * as vertical from '@rdlabo/capacitor-native-ui/vertical-bars';
    assert.equal(typeof native.enableNativeUI, 'function');
    assert.equal(typeof vertical.enableVerticalControlArea, 'function');
    assert.equal(vertical.withNativeUITransition, undefined);
    const integration = await import('@rdlabo/capacitor-native-ui/integration');
    assert.equal(integration.connectNativeUITransition, undefined);
    assert.equal(typeof integration.suspendNativeUI, 'function');
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
  // Theme-only consumers retain the transitive integration package, without Capacitor.
  assert.equal(manifests.get(nativeName).peerDependenciesMeta['@capacitor/core'].optional, true);
  rmSync(join(dir, 'node_modules/@capacitor'));
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { iosTransitionAnimation, withNativeUITransition, setVerticalBarsLayout, applyFoldStateClasses } from '@rdlabo/ionic-theme-ios27';
    assert.equal(typeof iosTransitionAnimation, 'function');
    assert.equal(typeof setVerticalBarsLayout, 'function');
    assert.equal(typeof applyFoldStateClasses, 'function');
    setVerticalBarsLayout({ edge: null });
    const animation = { play() {} };
    assert.equal(withNativeUITransition(() => animation)({}), animation);
    await assert.rejects(import('@capacitor/core'), { code: 'ERR_MODULE_NOT_FOUND' });
  `], { cwd: dir, stdio: 'inherit' });
  writeFileSync(consumer, `
    import { iosTransitionAnimation, withNativeUITransition, setVerticalBarsLayout, applyFoldStateClasses } from '@rdlabo/ionic-theme-ios27';
    withNativeUITransition(iosTransitionAnimation);
  `);
  execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2022', '--lib', 'es2022,dom', consumer], { cwd: dir, stdio: 'inherit' });
  console.log('Both package archives, public exports, plugin ownership, dependency direction and standalone Sass verified.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
