import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const [revision, path = 'packages/capacitor-native-ui/Package.swift'] = process.argv.slice(2);
assert.match(revision, /^(?:[a-f0-9]{40}|ios27-v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/);
const source = readFileSync(path, 'utf8');
const pattern = /let engineRevision = "[^"]*" \/\/ engine-revision:/g;
assert.equal([...source.matchAll(pattern)].length, 1, 'Expected one SwiftPM revision declaration');
writeFileSync(path, source.replace(pattern, `let engineRevision = "${revision}" // engine-revision:`));
