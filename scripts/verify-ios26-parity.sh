#!/bin/sh
# Mechanical runner for demo/native-parity/probe (project.yml + build.mjs).
# Requires an already-booted Simulator UDID. Does not install packages, boot or
# shut down simulators, mutate git, edit packages, call the network, or destroy data.
set -eu

udid=${1:?Usage: sh scripts/verify-ios26-parity.sh SIMULATOR_UDID [xcodebuild test flags...]}
shift

repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
probe="$repo/demo/native-parity/probe"
artifacts=$(mktemp -d /tmp/ios26-native-parity.XXXXXX)
printf '%s\n' "$artifacts"

git -C "$repo" rev-parse HEAD >"$artifacts/git-revision.txt"
git -C "$repo" diff -- \
  ':(exclude)*.pem' \
  ':(exclude)*.p12' \
  ':(exclude)*.mobileprovision' \
  ':(exclude)*credential*' \
  ':(exclude)*credentials*' \
  ':(exclude)*.env' \
  ':(exclude)*.env.*' \
  ':(exclude)*secret*' \
  ':(exclude)*secrets*' \
  >"$artifacts/git-diff.patch"
xcodebuild -version >"$artifacts/xcodebuild-version.txt"
xcrun simctl list runtimes >"$artifacts/simctl-runtimes.txt"
xcrun simctl list devices >"$artifacts/simctl-devices.txt"

cd "$repo"
# Capture tracked AND new implementation files using a narrow source allowlist.
# git diff alone omits the new engines/probes; exclude build output and secrets.
tar -czf "$artifacts/source.tar.gz" \
  --exclude='*.pem' --exclude='*.p12' --exclude='*.mobileprovision' \
  --exclude='*.env*' --exclude='*credential*' --exclude='*secret*' \
  --exclude='www' --exclude='*.xcodeproj' --exclude='__pycache__' \
  src demo/native-parity scripts package.json package-lock.json \
  demo/package.json demo/package-lock.json
node demo/native-parity/build.mjs
cp "$probe/www/build.json" "$probe/www/theme.css" "$probe/www/entry.js" "$probe/www/entry.css" "$artifacts/"
xcodegen generate --spec "$probe/project.yml" --project "$probe"

result=0
xcodebuild \
  -project "$probe/NativeParityProbe.xcodeproj" \
  -scheme NativeParityProbe \
  -destination "platform=iOS Simulator,id=$udid" \
  -derivedDataPath "$artifacts/DerivedData" \
  -resultBundlePath "$artifacts/NativeParityProbe.xcresult" \
  "$@" \
  CODE_SIGNING_ALLOWED=NO \
  test >"$artifacts/xcodebuild-test.log" 2>&1 || result=$?

if [ -e "$artifacts/NativeParityProbe.xcresult" ]; then
  xcrun xcresulttool export attachments \
    --path "$artifacts/NativeParityProbe.xcresult" \
    --output-path "$artifacts/attachments" || true
fi

container=
container=$(xcrun simctl get_app_container "$udid" dev.rdlabo.ios26.parity data 2>/dev/null) || container=
if [ -n "$container" ] && [ -d "$container/Documents" ]; then
  for f in "$container/Documents"/*.json; do
    if [ -f "$f" ]; then
      mkdir -p "$artifacts/metrics"
      cp "$f" "$artifacts/metrics/"
    fi
  done
fi

if [ "$result" -eq 0 ]; then
  node "$repo/demo/native-parity/validate-artifacts.mjs" "$artifacts" || result=$?
fi

exit "$result"
