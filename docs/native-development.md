# Native UI development

Contributor reference for the native runtime and its test suites. For application setup, use the [Native UI guide](../packages/capacitor-native-ui/docs/setup.md).

## Source layout

Each TypeScript module in [`src/native/components`](../packages/capacitor-native-ui/src/native/components) declares its Ionic tag and DOM reader. `components/index.ts` combines those exports into discovery selectors and the component type. Shared DOM measurements, item data and SVG rendering live in `src/native/shared`; `runtime.ts` owns synchronization, visibility handoffs and lifecycle events.

On iOS, [`Components`](../packages/capacitor-native-ui/ios/Sources/IonicNativeUIShellPlugin/Components) owns UIKit control creation, updates and component names. `ShellButton` shares the native button implementation used by ordinary, back and menu buttons. `Shared` owns the host view, typed snapshots, geometry, colors and image cache. Capacitor decodes each complete snapshot once using `Decodable`; renderers consume typed models and compare content with `Equatable`. Invalid batches are rejected before visible controls are changed. `IonicNativeUIShellPlugin.swift` coordinates Capacitor calls, revisions and native view lifetimes.

## Demo and verification

The demo includes a `native-ui-shell` page for exercising fixed controls. From the repository root, build the library and run the browser tests:

```sh
npm ci
npm run build
cd demo
npm ci
npx --no-install playwright install chromium
npx --no-install playwright test e2e/native-ui-shell.spec.ts e2e/native-ui-shell-edge.spec.ts
```

For native interaction and placement tests, use Xcode 26 or later, XcodeGen and a booted iOS 26+ Simulator. From the repository root, run `sh scripts/verify-native-ui-shell.sh SIMULATOR_UDID`. This also builds an independent Swift Package Manager consumer from the npm package. Run `sh scripts/verify-native-search.sh SIMULATOR_UDID` for searchable-tab integration, or add `edge` to that command for placement, navigation and keyboard edge cases. The scripts print the location of their local test artifacts.
