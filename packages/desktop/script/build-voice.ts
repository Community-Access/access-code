#!/usr/bin/env bun
import { $ } from "bun"
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

// Builds the local voice helper (voice/) into resources/voice with the MLX Metal shader bundle it loads at runtime.
// Only Apple silicon Macs run it; other targets skip it and the app hides voice features there.
const dir = path.resolve(import.meta.dir, "..")

const output = path.join(dir, "resources/voice")

if (process.platform !== "darwin" || process.arch !== "arm64") {
  console.log("Voice helper skipped: it only builds on Apple silicon Macs.")
  process.exit(0)
}

const derived = await mkdtemp(path.join(tmpdir(), "accesscode-voice-"))

await $`xcodebuild -scheme accesscode-voice -destination platform=macOS,arch=arm64 -configuration Release -quiet -derivedDataPath ${derived} build`.cwd(
  path.join(dir, "voice"),
)

const products = path.join(derived, "Build/Products/Release")

await rm(output, { recursive: true, force: true })

await mkdir(output, { recursive: true })

await cp(path.join(products, "accesscode-voice"), path.join(output, "accesscode-voice"))

// SwiftPM resource bundles sit next to the executable; MLX needs its compiled Metal library from one of them.
const bundles = (await readdir(products)).filter((name) => name.endsWith(".bundle"))

await Promise.all(
  bundles.map((name) => cp(path.join(products, name), path.join(output, name), { recursive: true })),
)

await rm(derived, { recursive: true, force: true })

console.log(`Voice helper built into ${output} with ${bundles.length} resource bundles.`)
