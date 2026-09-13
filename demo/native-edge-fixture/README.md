# Native UI Shell edge comparisons

These XCTest cases compare native projection with the same Ionic demo running in Web mode. The runner installs the packed package in a temporary Capacitor consumer, injects this fixture's probe, and exports screenshots from the test result. The probe is only included in that temporary app.

Prerequisites: Xcode 26 or later with the matching simulator runtime, XcodeGen, root/demo dependencies installed with `npm ci`, and a booted simulator. Enable the simulator's software keyboard and disconnect its hardware keyboard.

Run the four iPhone cases (the iPad-only width case is skipped) on an iPhone simulator from the repository root:

```sh
sh scripts/verify-native-search.sh IPHONE_SIMULATOR_UDID edge
```

Set `DEVELOPER_DIR` when using a different Xcode installation. Omitting `edge` preserves the runner's existing search suite.

The cases cover:

- `button` → upper-right Push → `action-sheet` → Back, repeated three times, including cancelled edge swipes. Both the sample's collapsing headers and a fixed-header variant are compared.
- Start, center, and end tab bars in LTR and RTL, comparing the DOM frame with UIKit's actual item frames.
- Header/back behavior while a Web input opens and closes the software keyboard.

For iPad, run the tab, dynamic-width, and keyboard cases. Reuse the artifact directory printed by the iPhone run; the navigation cases assume the iPhone demo layout. Install the same fixture app, then select the three tests:

```sh
artifacts=/tmp/ionic-native-edge-verification.REPLACE_ME
ipad=IPAD_SIMULATOR_UDID
xcrun simctl install "$ipad" "$artifacts/build/Build/Products/Debug-iphonesimulator/App.app"
xcodebuild -project "$artifacts/tests/NativeUIShellEdgeTests.xcodeproj" \
  -scheme NativeUIShellEdgeTests \
  -destination "platform=iOS Simulator,id=$ipad" \
  -derivedDataPath "$artifacts/ipad-test-build" \
  -resultBundlePath "$artifacts/ipad-tests.xcresult" \
  -only-testing:NativeUIShellEdgeTests/NativeUIShellEdgeTests/testTabPositionsWebComparison \
  -only-testing:NativeUIShellEdgeTests/NativeUIShellEdgeTests/testDynamicTabWidthRetirement \
  -only-testing:NativeUIShellEdgeTests/NativeUIShellEdgeTests/testWebKeyboardKeepsHeaderControls \
  CODE_SIGNING_ALLOWED=NO test
xcrun xcresulttool export attachments --path "$artifacts/ipad-tests.xcresult" \
  --output-path "$artifacts/ipad-screenshots"
```

The iPad tab case expects Web fallback when UIKit cannot match this demo's bar width, and checks that other eligible controls remain native. Use a new result bundle path when repeating a run.
