#!/bin/bash
# Verify npm-distributed Pods without publishing or consulting a kit spec repository.
set -euo pipefail
KIT_PODS_CAPACITOR=${1:?Provide the installed @capacitor/ios package directory}
KIT_PODS_CAPACITOR=$(cd "$KIT_PODS_CAPACITOR" && pwd)
KIT_PODS_TEMP=$(mktemp -d)
trap 'rm -rf "$KIT_PODS_TEMP"' EXIT
for package in capacitor-native-ui-kit capacitor-native-ui; do
  archive=$(npm pack "./packages/$package" --ignore-scripts --json --pack-destination "$KIT_PODS_TEMP" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8"))[0].filename')
  mkdir -p "$KIT_PODS_TEMP/node_modules/@rdlabo/$package"
  tar -xzf "$KIT_PODS_TEMP/$archive" --strip-components=1 -C "$KIT_PODS_TEMP/node_modules/@rdlabo/$package"
done
mkdir -p "$KIT_PODS_TEMP/ios/App"
cat > "$KIT_PODS_TEMP/ios/App/Podfile" <<RUBY
platform :ios, '15.0'
install! 'cocoapods', :integrate_targets => false
use_frameworks!
def capacitor_pods
  pod 'Capacitor', :path => '$KIT_PODS_CAPACITOR'
  pod 'CapacitorCordova', :path => '$KIT_PODS_CAPACITOR'
  pod 'RdlaboCapacitorNativeUi', :path => '../../node_modules/@rdlabo/capacitor-native-ui'
end
target 'App' do
  capacitor_pods
  pod 'CapacitorNativeUIKit', :path => '../../node_modules/@rdlabo/capacitor-native-ui-kit'
end
RUBY
pod install --project-directory="$KIT_PODS_TEMP/ios/App"
xcodebuild -project "$KIT_PODS_TEMP/ios/App/Pods/Pods.xcodeproj" -scheme CapacitorNativeUIKit -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
