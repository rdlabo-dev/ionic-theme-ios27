#!/bin/sh
# Build the demo app, install it on a simulator, and run the XCTest suite
# that audits the /main/index/native-ui-shell page and the shell tab bar
# against UIKit references mounted by the app's -parity mode.
# Usage: sh scripts/verify-ios26-parity.sh [SIM_UDID]
#   SIM_UDID  booted simulator UDID; when empty the script picks a booted iPhone.
# Artifacts land in $VERIFY_ARTIFACTS_DIR (default: a mktemp dir under /tmp).
set -u

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
demo="$root/demo"
artifacts=${VERIFY_ARTIFACTS_DIR:-$(mktemp -d /tmp/ios26-parity.XXXXXX)}
# DerivedData holds multi-GB index caches; keep it outside the uploaded dir.
derived=${VERIFY_DERIVEDDATA_DIR:-$(mktemp -d /tmp/ios26-parity-dd.XXXXXX)}
mkdir -p "$artifacts" "$derived"
printf 'Artifacts: %s\n' "$artifacts"

sim_udid=${1:-}
if [ -z "$sim_udid" ]; then
  sim_udid=$(xcrun simctl list devices booted -j | jq -r '.devices | to_entries[] | .value[] | select(.deviceTypeIdentifier | test("iPhone")) | .udid' | head -n 1)
fi
if [ -z "$sim_udid" ]; then
  echo 'No booted iPhone simulator; pass a UDID or run ci-simulator.sh first.' >&2
  exit 1
fi
printf 'Using simulator %s\n' "$sim_udid"

# --- 1. Web build + Capacitor sync --------------------------------------------
cd "$demo"
npm run build > "$artifacts/ng-build.log" 2>&1 || { tail -50 "$artifacts/ng-build.log"; exit 1; }
npx cap sync ios > "$artifacts/cap-sync.log" 2>&1 || { tail -50 "$artifacts/cap-sync.log"; exit 1; }

# --- 2. Build and install the app ----------------------------------------------
result=0
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination "platform=iOS Simulator,id=$sim_udid" \
  -derivedDataPath "$derived/app" \
  CODE_SIGNING_ALLOWED=NO build > "$artifacts/app-build.log" 2>&1 || result=$?
if [ "$result" -ne 0 ]; then
  tail -50 "$artifacts/app-build.log"
  exit "$result"
fi

xcrun simctl install "$sim_udid" "$derived/app/Build/Products/Debug-iphonesimulator/App.app"

# --- 3. Generate the UI test project and run -----------------------------------
if ! command -v xcodegen >/dev/null 2>&1; then
  echo 'xcodegen is required (brew install xcodegen).' >&2
  exit 1
fi
xcodegen generate --spec ios/NativeGlassPoCTests/project.yml --project ios/NativeGlassPoCTests \
  > "$artifacts/xcodegen.log" 2>&1 || { cat "$artifacts/xcodegen.log"; exit 1; }

xcodebuild -project ios/NativeGlassPoCTests/NativeGlassPoCTests.xcodeproj \
  -scheme NativeGlassPoCTests \
  -destination "platform=iOS Simulator,id=$sim_udid" \
  -derivedDataPath "$derived/test" \
  -resultBundlePath "$artifacts/parity.xcresult" \
  CODE_SIGNING_ALLOWED=NO test > "$artifacts/tests.log" 2>&1 || result=$?

if [ -d "$artifacts/parity.xcresult" ]; then
  xcrun xcresulttool export attachments --path "$artifacts/parity.xcresult" --output-path "$artifacts/attachments" 2>/dev/null || true
fi

printf 'Results and attachments: %s\n' "$artifacts"
exit "$result"
