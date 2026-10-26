#!/bin/bash
set -euo pipefail
# Evaluate the installed plugin outside the monorepo, without sibling npm packages.
# dump-package checks manifest resolution without fetching or executing remote code.
KIT_PROBE=$(mktemp -d)
trap 'rm -rf "$KIT_PROBE"' EXIT
cp packages/capacitor-native-ui/Package.swift "$KIT_PROBE/Package.swift"
cp packages/capacitor-native-ui/package.json "$KIT_PROBE/package.json"
mkdir -p "$KIT_PROBE/ios/Sources/NativeUIPlugin" "$KIT_PROBE/ios/Tests/NativeUIPluginTests"
for KIT_REF in ios27-v2.0.3 0123456789abcdef0123456789abcdef01234567; do
  node scripts/set-kit-revision.mjs "$KIT_REF" "$KIT_PROBE/Package.swift"
  swift package --package-path "$KIT_PROBE" dump-package > "$KIT_PROBE/manifest.json"
  node --input-type=module - "$KIT_PROBE/manifest.json" "$KIT_REF" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const [path, revision] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(path, 'utf8'));
const dependency = manifest.dependencies.find(entry => entry.sourceControl?.[0]?.identity === 'ionic-theme-ios27').sourceControl[0];
assert.equal(dependency.location.remote[0].urlString, 'https://github.com/rdlabo-dev/ionic-theme-ios27.git');
assert.deepEqual(dependency.requirement.revision, [revision]);
assert(!manifest.dependencies.some(entry => entry.fileSystem), 'Installed plugin must not require sibling npm Swift sources');
JS
done
