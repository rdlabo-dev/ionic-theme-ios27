#!/bin/sh
# Prerequisites: npm ci at root and demo, Xcode 27.1+, XcodeGen.
# The demo includes the Capacitor 8.5 UIScene migration required by SDK 27.
# Requires an already booted iPhone Duo / iOS 27.1+ Simulator for native rail tests.
# All generated fixtures stay in /tmp unless VERIFY_ARTIFACTS_DIR is supplied.
set -eu

simulator=${1:?Usage: sh scripts/verify-native-ui.sh SIMULATOR_UDID}
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
if [ "${VERIFY_ARTIFACTS_DIR:-}" ]; then
  artifacts=$VERIFY_ARTIFACTS_DIR
  mkdir -p "$artifacts"
else
  artifacts=$(mktemp -d /tmp/ionic-native-ui-verification.XXXXXX)
fi
printf 'Native UI verification artifacts: %s\n' "$artifacts"

cd "$repo/packages/capacitor-native-ui"
xcodebuild -scheme RdlaboCapacitorNativeUi \
  -destination "platform=iOS Simulator,id=$simulator" -derivedDataPath "$artifacts/unit-test-build" \
  -resultBundlePath "$artifacts/unit-tests.xcresult" CODE_SIGNING_ALLOWED=NO test > "$artifacts/unit-tests.log" 2>&1
cd "$repo"
npm run build
npm pack --workspaces --ignore-scripts --json --pack-destination "$artifacts" > "$artifacts/pack.json"
native_archive=$(node -e 'process.stdout.write(Object.values(require(process.argv[1])).find(p => p.name === "@rdlabo/capacitor-native-ui").filename)' "$artifacts/pack.json")
theme_archive=$(node -e 'process.stdout.write(Object.values(require(process.argv[1])).find(p => p.name === "@rdlabo/ionic-theme-ios27").filename)' "$artifacts/pack.json")

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
npm install --ignore-scripts "$artifacts/$native_archive" "$artifacts/$theme_archive" @capacitor/core@8.5.2 @capacitor/ios@8.5.2 @capacitor/cli@8.5.2 @ionic/core@8.8.19
"$repo/demo/node_modules/.bin/esbuild" app.js --bundle --format=esm --outdir=www
npx cap add ios --packagemanager SPM
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination "platform=iOS Simulator,id=$simulator" \
  -derivedDataPath "$artifacts/spm-build" CODE_SIGNING_ALLOWED=NO build > "$artifacts/spm-build.log" 2>&1
xcrun simctl install "$simulator" "$artifacts/spm-build/Build/Products/Debug-iphonesimulator/App.app"

mkdir -p "$artifacts/tests"
cp "$repo/demo/ios/NativeUITests/"* "$artifacts/tests/"
xcodegen generate --spec "$artifacts/tests/project.yml" --project "$artifacts/tests"
result=0
xcodebuild -project "$artifacts/tests/NativeUITests.xcodeproj" -scheme NativeUITests \
  -destination "platform=iOS Simulator,id=$simulator" -derivedDataPath "$artifacts/test-build" \
  -resultBundlePath "$artifacts/tests.xcresult" CODE_SIGNING_ALLOWED=NO test > "$artifacts/tests.log" 2>&1 || result=$?
xcrun xcresulttool export attachments --path "$artifacts/tests.xcresult" --output-path "$artifacts/screenshots"
printf 'Results and screenshots: %s\n' "$artifacts"
exit "$result"
