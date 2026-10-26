#!/bin/sh
# JDK 21 and Android SDK 36. Optional first argument selects a running emulator.
set -eu
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
engine="$repo/packages/capacitor-native-ui-engine/android"
plugin="$repo/packages/capacitor-native-ui/android"
npm --prefix "$repo" run build --workspace @rdlabo/capacitor-native-ui-engine
"$engine/gradlew" -p "$engine" lintRelease assembleRelease publishReleasePublicationToVerificationRepository
"$engine/gradlew" -p "$plugin" "-PnativeUIEngineRepository=$engine/build/maven" :testDebugUnitTest :assembleRelease
if [ "${1:-}" ]; then
  export ANDROID_SERIAL="$1"
  "$engine/gradlew" -p "$engine" :connectedDebugAndroidTest
  "$engine/gradlew" -p "$plugin" "-PnativeUIEngineRepository=$engine/build/maven" -PnativeUIEngineIntegrationTest :connectedDebugAndroidTest
fi
