// swift-tools-version: 5.9
import PackageDescription
let package = Package(
 name: "CapacitorNativeUIEngine", platforms: [.iOS(.v15)],
 products: [.library(name: "CapacitorNativeUIEngine", targets: ["CapacitorNativeUIEngine"])],
 targets: [
  .target(name: "CapacitorNativeUIEngine", path: "packages/capacitor-native-ui-engine/ios/Sources/CapacitorNativeUIEngine", resources: [.process("Resources")]),
  .testTarget(name: "CapacitorNativeUIEngineTests", dependencies: ["CapacitorNativeUIEngine"], path: "packages/capacitor-native-ui-engine/ios/Tests/CapacitorNativeUIEngineTests")
 ])
