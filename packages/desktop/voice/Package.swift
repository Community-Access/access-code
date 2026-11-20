// swift-tools-version: 5.10
import PackageDescription

// AccessCode's local voice helper. It runs Liquid's LFM2.5 Audio model with MLX for dictation and voice mode.
// Build with xcodebuild (not swift build) so MLX's Metal shaders are compiled: see script/build-voice.ts.
let package = Package(
  name: "accesscode-voice",
  platforms: [.macOS(.v14)],
  dependencies: [
    .package(url: "https://github.com/Neywa-Labs/mlx-audio-swift.git", revision: "018dad89b9df1986f3cab3bc06a280a29f507698"),
  ],
  targets: [
    .executableTarget(
      name: "accesscode-voice",
      dependencies: [
        .product(name: "MLXAudioCore", package: "mlx-audio-swift"),
        .product(name: "MLXAudioSTS", package: "mlx-audio-swift"),
      ]
    ),
  ]
)
