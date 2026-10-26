// swift-tools-version: 5.9
import PackageDescription
import Foundation

// SwiftPM is the native dependency manager. A source checkout uses the sibling
// target; installed plugins resolve the same library from an immutable Git ref.
let directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let engineRevision = "0178998db75cd906ed8cdb91868a6fc2a4fe8c72" // engine-revision: set by release/candidate packaging
let workspace = directory.deletingLastPathComponent().deletingLastPathComponent()
let isWorkspace = FileManager.default.fileExists(atPath: workspace.appendingPathComponent("packages/capacitor-native-ui-engine/Package.swift").path)
let engine: Package.Dependency = isWorkspace
    ? .package(path: "../capacitor-native-ui-engine")
    : .package(url: "https://github.com/rdlabo-dev/ionic-theme-ios27.git", revision: engineRevision)
let engineIdentity = isWorkspace ? "capacitor-native-ui-engine" : "ionic-theme-ios27"


let package = Package(
    name: "RdlaboCapacitorNativeUi",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "RdlaboCapacitorNativeUi", targets: ["NativeUIPlugin"])
    ],
    dependencies: [engine, .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")],
    targets: [.target(
        name: "NativeUIPlugin",
        dependencies: [
            .product(name: "CapacitorNativeUIEngine", package: engineIdentity),
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
