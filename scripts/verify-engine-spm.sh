#!/bin/bash
set -euo pipefail
# Evaluate the installed plugin outside the monorepo, without sibling npm packages.
# dump-package checks manifest resolution without fetching or executing remote code.
ENGINE_PROBE=$(mktemp -d)
trap 'rm -rf "$ENGINE_PROBE"' EXIT
cp packages/capacitor-native-ui/Package.swift "$ENGINE_PROBE/Package.swift"
cp packages/capacitor-native-ui/package.json "$ENGINE_PROBE/package.json"
mkdir -p "$ENGINE_PROBE/ios/Sources/NativeUIPlugin" "$ENGINE_PROBE/ios/Tests/NativeUIPluginTests"
ENGINE_REQUIREMENT=$(node -p "require('./packages/capacitor-native-ui/package.json').dependencies['@webview-native-ui/engine']")
swift package --package-path "$ENGINE_PROBE" dump-package > "$ENGINE_PROBE/manifest.json"
node --input-type=module - "$ENGINE_PROBE/manifest.json" "$ENGINE_REQUIREMENT" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const [path, requirement] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(path, 'utf8'));
const dependency = manifest.dependencies.find(entry => entry.sourceControl?.[0]?.identity === 'engine').sourceControl[0];
assert.equal(dependency.location.remote[0].urlString, 'https://github.com/webview-native-ui/engine.git');
assert.equal(requirement, '^1.0.0', 'Engine npm dependency must allow compatible 1.x updates');
assert.deepEqual(dependency.requirement.range, [{ lowerBound: '1.0.0', upperBound: '2.0.0' }]);
assert(!manifest.dependencies.some(entry => entry.fileSystem), 'Installed plugin must not require sibling npm Swift sources');
JS
