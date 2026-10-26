// swift-tools-version: 5.9
import PackageDescription
let package = Package(
 name: "CapacitorNativeUIKit", platforms: [.iOS(.v15)],
 products: [.library(name: "CapacitorNativeUIKit", targets: ["CapacitorNativeUIKit"])],
 targets: [
  .target(name: "CapacitorNativeUIKit", path: "packages/capacitor-native-ui-kit/ios/Sources/CapacitorNativeUIKit"),
  .testTarget(name: "CapacitorNativeUIKitTests", dependencies: ["CapacitorNativeUIKit"], path: "packages/capacitor-native-ui-kit/ios/Tests/CapacitorNativeUIKitTests")
 ])
