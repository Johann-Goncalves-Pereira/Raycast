// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "HumanizedType",
    platforms: [
        .macOS(.v13),
    ],
    products: [
        .library(name: "HumanizedTypeCore", targets: ["HumanizedTypeCore"]),
        .executable(name: "humanized-type", targets: ["HumanizedType"]),
    ],
    targets: [
        .target(
            name: "HumanizedTypeCore",
            path: "Sources/HumanizedTypeCore"
        ),
        .executableTarget(
            name: "HumanizedType",
            dependencies: ["HumanizedTypeCore"],
            path: "Sources/HumanizedType"
        ),
        .testTarget(
            name: "HumanizedTypeCoreTests",
            dependencies: ["HumanizedTypeCore"],
            path: "Tests/HumanizedTypeCoreTests"
        ),
    ]
)
