# Native UI Shell demo and verification

The demo enables `enableNativeUIShell()` once at startup and includes a `native-ui-shell` page for exercising fixed controls. See the [Native UI Shell guide](../docs/native-ui-shell.md) for setup and supported markup.

## Local verification

Run the Web contract and transition tests from `demo`:

```sh
npx playwright test e2e/native-ui-shell.spec.ts e2e/native-ui-shell-transition.spec.ts e2e/native-ui-shell-edge.spec.ts
```

For native tests, install root/demo dependencies and XcodeGen, and boot an iOS 26+ Simulator. From the repository root:

```sh
xcrun simctl list devices booted
sh scripts/verify-native-ui-shell.sh SIMULATOR_UDID
```

This builds the demo through SPM, packs the npm package, creates an independent SPM consumer, installs both apps, and runs XCUITest. Artifacts and screenshots remain in the printed `/tmp/ionic-native-ui-shell-verification.*` directory. The demo includes the Capacitor 8.5 UIScene migration. For an existing Capacitor app, upgrading dependencies and running sync alone does not migrate the app lifecycle: run `npx cap migrate` and review the [Capacitor 8.5 migration guide](https://capacitorjs.com/docs/updating/8-5) before building with SDK 27. To choose Xcode 27, set command-local `DEVELOPER_DIR` when running the script.

The standalone XCUITest project also contains packaged-consumer tests. When manually running only the demo, exclude `NativeUIShellTests/NativeUIShellTests/testPackagedNativePlugin`, `NativeUIShellTests/NativeUIShellTests/testPackagedFabStartsExpanded` and `NativeUIShellTests/NativeUIShellTests/testTabPlacementAndSelection` with `-skip-testing`; the verification script installs their fixture automatically.

For searchable-tab integration, use a booted Simulator with the Japanese Kana and software keyboards enabled:

```sh
sh scripts/verify-native-search.sh SIMULATOR_UDID
```

This builds a separate SPM consumer from the npm package and copies the real demo into its WebView. A test-only DOM panel checks values, events and projection ownership. Its files are not added to the demo's normal user interface. Results stay under the printed `/tmp/ionic-native-search-verification.*` directory.

For Web/native placement comparisons, repeated Push/back navigation and keyboard edge cases, run `sh scripts/verify-native-search.sh SIMULATOR_UDID edge`. See the [fixture instructions](native-edge-fixture/README.md) for the iPad-specific cases. Generated logs, screenshots and recordings are local test artifacts; they are not repository fixtures.
