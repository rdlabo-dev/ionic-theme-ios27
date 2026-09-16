#!/bin/sh
# Prerequisites: npm ci at root and demo, Xcode 26+, XcodeGen.
# The demo includes the Capacitor 8.5 UIScene migration required by SDK 27.
# Requires an already booted iOS 26+ Simulator. All generated fixtures stay in /tmp.
set -eu

simulator=${1:?Usage: sh scripts/verify-native-ui-shell.sh SIMULATOR_UDID}
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
if [ "${VERIFY_ARTIFACTS_DIR:-}" ]; then
  artifacts=$VERIFY_ARTIFACTS_DIR
  mkdir -p "$artifacts"
else
  artifacts=$(mktemp -d /tmp/ionic-native-ui-shell-verification.XXXXXX)
fi
printf 'Native UI Shell verification artifacts: %s\n' "$artifacts"

cd "$repo"
npm run build
npm pack --ignore-scripts --json --pack-destination "$artifacts" > "$artifacts/pack.json"
archive=$(node -e 'process.stdout.write(require(process.argv[1])[0].filename)' "$artifacts/pack.json")

cd "$repo/demo"
npm run build -- --configuration=production
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination "platform=iOS Simulator,id=$simulator" \
  -derivedDataPath "$artifacts/demo-build" CODE_SIGNING_ALLOWED=NO build > "$artifacts/demo-build.log" 2>&1
xcrun simctl install "$simulator" "$artifacts/demo-build/Build/Products/Debug-iphonesimulator/App.app"

mkdir -p "$artifacts/consumer/www"
cp "$repo/demo/native-package-fixture/app.js" "$repo/demo/native-package-fixture/capacitor.config.json" "$artifacts/consumer/"
cp "$repo/demo/native-package-fixture/index.html" "$artifacts/consumer/www/"
cd "$artifacts/consumer"
# --ignore-scripts would skip the git dependency's prepare script, leaving
# @rdlabo/ionic-theme-utils without its dist build.
npm install "$artifacts/$archive" @capacitor/core@8.5.2 @capacitor/ios@8.5.2 @capacitor/cli@8.5.2 @ionic/core@8.8.19
# Some npm versions skip `prepare` for transitive git dependencies; build the
# utils dist explicitly when it was not produced.
if [ ! -f node_modules/@rdlabo/ionic-theme-utils/dist/index.js ]; then
  (cd node_modules/@rdlabo/ionic-theme-utils && npm install --no-save --no-audit --no-fund typescript && npm run build)
fi
"$repo/demo/node_modules/.bin/esbuild" app.js --bundle --format=esm --outdir=www
npx cap add ios --packagemanager SPM
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination "platform=iOS Simulator,id=$simulator" \
  -derivedDataPath "$artifacts/spm-build" CODE_SIGNING_ALLOWED=NO build > "$artifacts/spm-build.log" 2>&1
xcrun simctl install "$simulator" "$artifacts/spm-build/Build/Products/Debug-iphonesimulator/App.app"

mkdir -p "$artifacts/tests"
cp "$repo/demo/ios/NativeUIShellTests/"* "$artifacts/tests/"
xcodegen generate --spec "$artifacts/tests/project.yml" --project "$artifacts/tests"
result=0
xcodebuild -project "$artifacts/tests/NativeUIShellTests.xcodeproj" -scheme NativeUIShellTests \
  -destination "platform=iOS Simulator,id=$simulator" -derivedDataPath "$artifacts/test-build" \
  -resultBundlePath "$artifacts/tests.xcresult" CODE_SIGNING_ALLOWED=NO test > "$artifacts/tests.log" 2>&1 || result=$?
xcrun xcresulttool export attachments --path "$artifacts/tests.xcresult" --output-path "$artifacts/screenshots"
printf 'Results and screenshots: %s\n' "$artifacts"
exit "$result"
