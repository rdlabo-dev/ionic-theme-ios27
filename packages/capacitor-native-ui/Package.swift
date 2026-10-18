// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "IonicThemeCapacitorNativeUi",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "RdlaboCapacitorNativeUi", targets: ["IonicNativeUIShellPlugin"]),
        // Preserve manually linked projects from before the npm package rename.
        .library(name: "IonicThemeCapacitorNativeUi", targets: ["IonicNativeUIShellPlugin"])
    ],
    dependencies: [.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")],
    targets: [.target(
        name: "IonicNativeUIShellPlugin",
        dependencies: [
            .product(name: "Capacitor", package: "capacitor-swift-pm"),
            .product(name: "Cordova", package: "capacitor-swift-pm")
        ],
        path: "ios/Sources/IonicNativeUIShellPlugin"
    ), .testTarget(
        name: "IonicNativeUIShellPluginTests",
        dependencies: ["IonicNativeUIShellPlugin"],
        path: "ios/Tests/IonicNativeUIShellPluginTests"
    )]
)
