# Horizontal toolbar navigation acceptance

This fixture uses a real Ionic `ion-nav`, `ion-button` / `ion-back-button`, the production transition adapter and runtime, and the installed Capacitor native plugin. The page animation is deliberately slow so toolbar retention can be sampled throughout push, pop and a real edge-swipe cancellation. It does not claim pixel parity with UIKit navigation animations.

`NativeToolbarTests.swift` verifies native accessibility controls, insertion/removal of the back button, action ownership after completion/cancellation, and zero sampled Web-source exposures or empty native updates during playback. The fixture also retains the JavaScript counters in its visible status output.

From the repository root, bundle the fixture into an isolated demo app checkout:

```sh
./node_modules/.bin/esbuild demo/native-toolbar-fixture/app.ts --bundle --format=esm --target=safari17 --outfile=demo/ios/App/App/public/app.js --alias:@rdlabo/capacitor-native-ui/integration=./packages/capacitor-native-ui/src/native-integration/index.ts
cp demo/native-toolbar-fixture/index.html demo/ios/App/App/public/index.html
```

Use the demo's local Capacitor config with `NativeUIPlugin` registered, build/install the app (`io.ionic.theme.ios27`) on the selected simulator, and generate the UI test project with `xcodegen generate --spec demo/native-toolbar-fixture/project.yml`. Run its `NativeToolbarTests` scheme on the same simulator. Generated app resources and Xcode projects are not committed.
