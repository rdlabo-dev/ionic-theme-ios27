#!/bin/sh
# Xcode 26+, npm ci (root/demo), XcodeGen, booted Simulator with Japanese Kana and software keyboards enabled.
set -eu
simulator=${1:?Usage: sh scripts/verify-native-search.sh SIMULATOR_UDID [search|edge]}
scenario=${2:-search}
case "$scenario" in
  search) suite=NativeUIShellSearchTests ;;
  edge) suite=NativeUIShellEdgeTests ;;
  *) printf 'Unknown scenario: %s (expected search or edge)\n' "$scenario" >&2; exit 2 ;;
esac
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
fixture="$repo/demo/native-$scenario-fixture"
artifacts=$(mktemp -d "/tmp/ionic-native-$scenario-verification.XXXXXX")
printf 'Native %s verification artifacts: %s\n' "$scenario" "$artifacts"
cd "$repo"
npm run build
npm pack --ignore-scripts --json --pack-destination "$artifacts" > "$artifacts/pack.json"
archive=$(node -e 'process.stdout.write(require(process.argv[1])[0].filename)' "$artifacts/pack.json")
cd "$repo/demo"
npm run build -- --configuration=production
mkdir -p "$artifacts/consumer/www"
cp -R www/. "$artifacts/consumer/www/"
cp native-package-fixture/capacitor.config.json "$artifacts/consumer/"
cp "$fixture/probe.js" "$artifacts/consumer/www/$scenario-probe.js"
node --input-type=module - "$artifacts/consumer/www/index.html" "$scenario-probe.js" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const file = process.argv[2];
writeFileSync(file, readFileSync(file, 'utf8').replace('</body>', `<script src="${process.argv[3]}"></script></body>`));
JS
cd "$artifacts/consumer"
npm install --ignore-scripts "$artifacts/$archive" @capacitor/core@8.5.2 @capacitor/ios@8.5.2 @capacitor/cli@8.5.2 @ionic/core@8.8.19
npx cap add ios --packagemanager SPM
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination "platform=iOS Simulator,id=$simulator" \
  -derivedDataPath "$artifacts/build" CODE_SIGNING_ALLOWED=NO build > "$artifacts/build.log" 2>&1
xcrun simctl install "$simulator" "$artifacts/build/Build/Products/Debug-iphonesimulator/App.app"
mkdir -p "$artifacts/tests"
cp "$fixture/$suite.swift" "$fixture/project.yml" "$artifacts/tests/"
xcodegen generate --spec "$artifacts/tests/project.yml" --project "$artifacts/tests"
result=0
xcodebuild -project "$artifacts/tests/$suite.xcodeproj" -scheme "$suite" \
  -destination "platform=iOS Simulator,id=$simulator" -derivedDataPath "$artifacts/test-build" \
  -resultBundlePath "$artifacts/tests.xcresult" CODE_SIGNING_ALLOWED=NO test > "$artifacts/tests.log" 2>&1 || result=$?
xcrun xcresulttool export attachments --path "$artifacts/tests.xcresult" --output-path "$artifacts/screenshots"
printf 'Results and screenshots: %s\n' "$artifacts"
exit "$result"
