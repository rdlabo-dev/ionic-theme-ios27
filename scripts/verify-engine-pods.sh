#!/bin/bash
# Verify npm-distributed Pods without publishing or consulting an engine spec repository.
set -euo pipefail
ENGINE_PODS_CAPACITOR=${1:?Provide the installed @capacitor/ios package directory}
ENGINE_PODS_CAPACITOR=$(cd "$ENGINE_PODS_CAPACITOR" && pwd)
ENGINE_PODS_TEMP=$(mktemp -d)
trap 'rm -rf "$ENGINE_PODS_TEMP"' EXIT
for package in capacitor-native-ui-engine capacitor-native-ui; do
  archive=$(npm pack "./packages/$package" --ignore-scripts --json --pack-destination "$ENGINE_PODS_TEMP" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8"))[0].filename')
  mkdir -p "$ENGINE_PODS_TEMP/node_modules/@rdlabo/$package"
  tar -xzf "$ENGINE_PODS_TEMP/$archive" --strip-components=1 -C "$ENGINE_PODS_TEMP/node_modules/@rdlabo/$package"
done
mkdir -p "$ENGINE_PODS_TEMP/ios/App"
cat > "$ENGINE_PODS_TEMP/ios/App/Podfile" <<RUBY
platform :ios, '15.0'
install! 'cocoapods', :integrate_targets => false
use_frameworks!
def capacitor_pods
  pod 'Capacitor', :path => '$ENGINE_PODS_CAPACITOR'
  pod 'CapacitorCordova', :path => '$ENGINE_PODS_CAPACITOR'
  pod 'RdlaboCapacitorNativeUi', :path => '../../node_modules/@rdlabo/capacitor-native-ui'
end
target 'App' do
  capacitor_pods
  pod 'CapacitorNativeUIEngine', :path => '../../node_modules/@rdlabo/capacitor-native-ui-engine'
end
RUBY
pod install --project-directory="$ENGINE_PODS_TEMP/ios/App"
xcodebuild -project "$ENGINE_PODS_TEMP/ios/App/Pods/Pods.xcodeproj" -scheme CapacitorNativeUIEngine -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
