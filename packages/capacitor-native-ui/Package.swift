// swift-tools-version: 5.9
import PackageDescription
import Foundation

// SwiftPM is the native dependency manager. A source checkout uses the sibling
// target; installed plugins resolve the same library from an immutable Git ref.
let directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let kitRevision = "ios27-v2.0.3" // kit-revision: set by release/candidate packaging
let workspace = directory.deletingLastPathComponent().deletingLastPathComponent()
let isWorkspace = FileManager.default.fileExists(atPath: workspace.appendingPathComponent("packages/capacitor-native-ui-kit/Package.swift").path)
let kit: Package.Dependency = isWorkspace
    ? .package(path: "../capacitor-native-ui-kit")
    : .package(url: "https://github.com/rdlabo-dev/ionic-theme-ios27.git", revision: kitRevision)
let kitIdentity = isWorkspace ? "capacitor-native-ui-kit" : "ionic-theme-ios27"


let package = Package(
    name: "RdlaboCapacitorNativeUi",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "RdlaboCapacitorNativeUi", targets: ["NativeUIPlugin"])
    ],
    dependencies: [kit, .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")],
    targets: [.target(
        name: "NativeUIPlugin",
        dependencies: [
            .product(name: "CapacitorNativeUIKit", package: kitIdentity),
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
