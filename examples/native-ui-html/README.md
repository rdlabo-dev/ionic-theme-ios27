# Native UI without Ionic

A plain HTML example with ordinary buttons and an application-owned rail. Home/details navigation changes `hidden`; there is no router or history fallback. Standard native controls use the same Swift renderers as Ionic sources, without registering custom SwiftUI extensions.

From the repository root, build the native package, then install and run this example:

```sh
npm run build -w @rdlabo/capacitor-native-ui
cd examples/native-ui-html
npm install
npm start
```

Open `http://localhost:4300`. Toggle the rail, add items, open details, go back, and stop the runtime. In a browser, ordinary controls remain the original Web controls; rail controls use Web proxies which forward clicks to those originals. The example owns all CSS and spacing.

For native rendering, use these built assets (`dist`) in a Capacitor 8 iOS project with `@rdlabo/capacitor-native-ui` as a direct dependency and run `npx cap sync ios`. Native rail availability is detected from iOS device traits; the example never forces unsupported native placement. No Ionic dependency or theme stylesheet is needed.

## Native UI acceptance test

Use bundle ID `dev.rdlabo.nativeui.html` for the example's Capacitor app, install it into an iOS 26+ simulator, then run:

```sh
xcodegen generate --spec ios-tests/project.yml
xcodebuild -project ios-tests/NativeHTMLTests.xcodeproj -scheme NativeHTMLTests \
  -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_ID' test
```

The test requires native Add and Back buttons, verifies their original HTML handlers, and verifies Web restoration after stopping. Browser and bridge tests also cover rail ownership and live enable/disable.
