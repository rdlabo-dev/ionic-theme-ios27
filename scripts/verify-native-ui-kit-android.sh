#!/bin/sh
# JDK 21 and Android SDK 36. Optional first argument selects a running emulator.
set -eu
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
kit="$repo/packages/capacitor-native-ui-kit/android"
plugin="$repo/packages/capacitor-native-ui/android"
npm --prefix "$repo" run build --workspace @rdlabo/capacitor-native-ui-kit
"$kit/gradlew" -p "$kit" lintRelease assembleRelease publishReleasePublicationToVerificationRepository
"$kit/gradlew" -p "$plugin" "-PnativeUIKitRepository=$kit/build/maven" :testDebugUnitTest :assembleRelease
if [ "${1:-}" ]; then
  export ANDROID_SERIAL="$1"
  "$kit/gradlew" -p "$kit" :connectedDebugAndroidTest
  "$kit/gradlew" -p "$plugin" "-PnativeUIKitRepository=$kit/build/maven" -PnativeUIKitIntegrationTest :connectedDebugAndroidTest
fi
