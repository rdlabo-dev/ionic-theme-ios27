// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "RdlaboCapacitorNativeUi",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "RdlaboCapacitorNativeUi", targets: ["NativeUIPlugin"])
    ],
    dependencies: [.package(url: "https://github.com/webview-native-ui/engine.git", exact: "0.0.5"), .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")],
    targets: [.target(
        name: "NativeUIPlugin",
        dependencies: [
            .product(name: "WebViewNativeUIEngine", package: "engine"),
            .product(name: "Capacitor", package: "capacitor-swift-pm"),
            .product(name: "Cordova", package: "capacitor-swift-pm")
        ],
        path: "ios/Sources/NativeUIPlugin"
    ), .testTarget(
        name: "NativeUIPluginTests",
        dependencies: ["NativeUIPlugin"],
        path: "ios/Tests/NativeUIPluginTests"
    )]
)
