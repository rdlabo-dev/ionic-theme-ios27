#!/bin/sh
# Create, configure, and boot an iOS Simulator for CI runs.
# Usage: sh scripts/ci-simulator.sh DEVICE_NAME RUNTIME_NAME [kana]
#   DEVICE_NAME  e.g. "iPhone 17"  (xcrun simctl list devicetypes)
#   RUNTIME_NAME e.g. "iOS 27.0"   (xcrun simctl list runtimes)
#   kana         enable the Japanese Kana keyboard for the search suite
# Prints the booted device UDID on the last stdout line and exports SIM_UDID
# to GITHUB_ENV when running under GitHub Actions.
set -eu

device=${1:?Usage: ci-simulator.sh DEVICE_NAME RUNTIME_NAME [kana]}
runtime=${2:?Usage: ci-simulator.sh DEVICE_NAME RUNTIME_NAME [kana]}
extra=${3:-}

device_type=$(xcrun simctl list devicetypes -j | jq -r --arg name "$device" \
  '.devicetypes[] | select(.name == $name) | .identifier' | head -n 1)
runtime_id=$(xcrun simctl list runtimes -j | jq -r --arg name "$runtime" \
  '.runtimes[] | select(.name == $name and .isAvailable) | .identifier' | head -n 1)

if [ -z "$device_type" ] || [ -z "$runtime_id" ]; then
  printf 'Could not resolve device "%s" or runtime "%s".\n' "$device" "$runtime" >&2
  xcrun simctl list devicetypes >&2
  xcrun simctl list runtimes >&2
  exit 1
fi

udid=$(xcrun simctl create "ci-$runtime-$device" "$device_type" "$runtime_id")
printf 'Created simulator %s (%s / %s)\n' "$udid" "$device" "$runtime"

# The simulator reads this host default at boot; keep the software keyboard.
defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false

xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b

if [ "$extra" = "kana" ]; then
  # First boot resets preferences, so write inside the booted sim and reboot
  # to let the text input service pick up the Kana keyboard.
  xcrun simctl spawn "$udid" defaults write com.apple.Preferences AppleKeyboards -array "en_US@sw=QWERTY" "ja_JP@sw=Kana"
  xcrun simctl spawn "$udid" defaults write com.apple.Preferences AppleKeyboardsVisible -array "en_US@sw=QWERTY" "ja_JP@sw=Kana"
  xcrun simctl shutdown "$udid"
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" -b
  printf 'Enabled Kana keyboard preferences.\n'
fi

if [ "${GITHUB_ENV:-}" ]; then
  printf 'SIM_UDID=%s\n' "$udid" >> "$GITHUB_ENV"
fi
printf '%s\n' "$udid"
