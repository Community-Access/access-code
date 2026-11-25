import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { watch } from "node:fs"
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { createSherpaVoice } from "./sherpa-voice"

const require = createRequire(import.meta.url)
const helper = path.resolve(import.meta.dir, "../../voice-windows/sherpa-worker.cjs")
const fixtures = process.env.OPENCODE_SHERPA_TEST_MODELS
const moonshine = process.env.OPENCODE_SHERPA_MOONSHINE_FIXTURES
const kokoro = process.env.OPENCODE_SHERPA_KOKORO_FIXTURES
const piper = process.env.OPENCODE_SHERPA_PIPER_FIXTURES

describe.skipIf(process.platform !== "win32" || process.arch !== "x64")("Sherpa Electron node-mode voice", () => {
  let root: string
  let executable: string
  let modulePath: string

  beforeAll(async () => {
    root = await mkdtemp(path.resolve(import.meta.dir, "../../.sherpa-test-"))
    executable = require("electron")
    modulePath = require.resolve("sherpa-onnx-node")
  })
  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test("reports worker stderr and rejects invalid recorder audio before native inference", async () => {
    const voice = createSherpaVoice(helper, { executable, modulePath, modelDir: (id) => path.join(root, id) })
    await expect(voice.transcribe(new Uint8Array(), "whisper-tiny-en")).rejects.toThrow("Missing model file")
    await mkdir(path.join(root, "whisper-tiny-en"))
    await Promise.all(
      ["encoder.int8.onnx", "decoder.int8.onnx", "tokens.txt"].map((name) =>
        writeFile(path.join(root, "whisper-tiny-en", name), "fixture"),
      ),
    )
    await expect(voice.transcribe(new Uint8Array(44), "whisper-tiny-en")).rejects.toThrow("Invalid recorder WAV")
    await mkdir(path.join(root, "moonshine-tiny-en"))
    await writeFile(path.join(root, "moonshine-tiny-en", "tokens.txt"), "fixture")
    await expect(voice.transcribe(new Uint8Array(44), "moonshine-tiny-en")).rejects.toThrow("Invalid recorder WAV")
    await expect(voice.transcribe(new Uint8Array(), "../unsupported")).rejects.toThrow("Unsupported recognition pack")
    await mkdir(path.join(root, "kokoro-int8-en-v0_19"))
    await Promise.all(
      ["model.int8.onnx", "voices.bin", "tokens.txt"].map((name) =>
        writeFile(path.join(root, "kokoro-int8-en-v0_19", name), "fixture"),
      ),
    )
    await expect(voice.speak("missing-lexicon", "Hello.", "kokoro-int8-en-v0_19:0")).rejects.toThrow(
      "archived espeak-ng-data is no longer supported",
    )
    expect((await readdir(root)).filter((name) => name.startsWith(".sherpa-job-"))).toEqual([])
  })

  test("cancels before launch and after a child opens its output, then releases the request ID", async () => {
    const worker = path.join(root, "holding-worker.cjs")
    const model = path.join(root, "kokoro-int8-en-v0_19")
    await mkdir(model, { recursive: true })
    await writeFile(
      worker,
      `const fs = require("node:fs"); const path = require("node:path");
      const chunks = []; process.stdin.on("data", (chunk) => chunks.push(chunk));
      process.stdin.on("end", () => {
        const r = JSON.parse(Buffer.concat(chunks));
        fs.openSync(r.output, "w");
        fs.writeFileSync(path.join(r.model, "started"), "");
        setInterval(() => {}, 1000);
      });`,
    )
    const voice = createSherpaVoice(worker, { executable, modulePath, modelDir: () => model })
    const early = voice.speak("early", "Hello.", "kokoro-int8-en-v0_19:0")
    voice.cancel("early")
    expect(await early).toBeNull()
    const started = Promise.withResolvers<void>()
    const watcher = watch(model, (_, filename) => {
      if (filename === "started") started.resolve()
    })
    try {
      const running = voice.speak("active", "Hello.", "kokoro-int8-en-v0_19:0")
      await expect(voice.speak("active", "Duplicate.", "kokoro-int8-en-v0_19:0")).rejects.toThrow("already active")
      await started.promise
      expect((await readdir(root)).filter((name) => name.startsWith(".sherpa-job-"))).toHaveLength(1)
      voice.cancel("active")
      expect(await running).toBeNull()
      expect((await readdir(root)).filter((name) => name.startsWith(".sherpa-job-"))).toEqual([])
      const reused = voice.speak("active", "Hello.", "kokoro-int8-en-v0_19:0")
      voice.cancel("active")
      expect(await reused).toBeNull()
    } finally {
      watcher.close()
      voice.cancel("active")
    }
  })

  // Real model fixtures are opt-in and not shipped with the test suite.
  test.skipIf(!moonshine)(
    "recognizes an English sample with Moonshine through Electron",
    async () => {
      const voice = createSherpaVoice(helper, {
        executable,
        modulePath,
        modelDir: (id) => path.join(moonshine!, id),
      })
      const audio = await readFile(path.join(moonshine!, "recorder.wav"))
      expect((await voice.transcribe(audio, "moonshine-tiny-en")).toLowerCase()).toBe("this is a simple voice test.")
    },
    120_000,
  )

  test.skipIf(!piper)(
    "phonemizes contractions and unknown words and synthesizes Piper speakers through isolated workers",
    async () => {
      const phonemizer = path.resolve(import.meta.dir, "../../voice-windows/piper-worker.cjs")
      const runtime = require.resolve("onnxruntime-node")
      const model = path.join(piper!, "piper-libritts-en")
      const result = spawnSync(executable, [phonemizer, runtime], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        input: JSON.stringify({ model, text: "I can't stop frobnication. It's 20,000. Button. API. O'Connor." }),
        encoding: "utf8",
        windowsHide: true,
      })
      expect(result.stderr).toBe("")
      expect(result.status).toBe(0)
      const pronunciation = JSON.parse(result.stdout).map((part: number[]) => String.fromCodePoint(...part)).join(" ")
      expect(pronunciation).toContain("kænˈɑːt")
      expect(pronunciation).toContain("ɪts")
      expect(pronunciation).toContain("fɹ")
      expect(pronunciation).toContain("bˈʌʔən")
      expect(pronunciation).toContain("ˈeɪ pˈiː ˈaɪ")
      expect(pronunciation).toContain("ˈoʊ ɐpˈɔstɹəfi")

      const voice = createSherpaVoice(helper, {
        executable,
        modulePath,
        modelDir: (id) => path.join(piper!, id),
        phonemizer: {
          helperPath: path.resolve(import.meta.dir, "../../voice-windows/misaki-worker.cjs"),
          piperHelperPath: phonemizer,
          modulePath: runtime,
        },
      })
      const cancelled = voice.speak("piper-cancel", "Hello.", "piper-libritts-en:0")
      voice.cancel("piper-cancel")
      expect(await cancelled).toBeNull()
      const [first, second] = await Promise.all([
        voice.speak("piper-one", "Hello world.", "piper-libritts-en:0"),
        voice.speak("piper-two", "Hello world.", "piper-libritts-en:1"),
      ])
      if (!first || !second) throw new Error("Piper sample unexpectedly cancelled")
      expect(Buffer.from(first).toString("ascii", 0, 4)).toBe("RIFF")
      expect(Buffer.from(first).readUInt32LE(24)).toBe(22050)
      expect(first.length).toBeGreaterThan(44)
      expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false)
      await expect(voice.speak("piper-unsupported", "Hello 🌍", "piper-libritts-en:0")).rejects.toThrow("Unsupported character")
      await expect(voice.speak("piper-phoneme", "accouchement", "piper-libritts-en:0")).rejects.toThrow("Unsupported Piper phoneme")
      await expect(voice.speak("piper-invalid", "Hello.", "piper-libritts-en:904")).rejects.toThrow("speaker index")
      const short = await voice.speak("piper-short", "Hello ".repeat(45), "piper-libritts-en:0")
      const long = await voice.speak("piper-long", "Hello ".repeat(90), "piper-libritts-en:0")
      if (!short || !long) throw new Error("Piper long sample unexpectedly cancelled")
      expect(long.length).toBeGreaterThan(short.length * 1.7)
    },
    120_000,
  )

  test.skipIf(!kokoro)(
    "synthesizes an unknown word and numbers through packaged, isolated native workers",
    async () => {
      const builder = createRequire(require.resolve("electron-builder"))
      const appBuilder = createRequire(builder.resolve("app-builder-lib"))
      const asar = appBuilder("@electron/asar")
      const app = path.join(root, "kokoro-app")
      const resources = path.join(root, "kokoro-resources")
      const runtime = require.resolve("onnxruntime-node")
      const common = createRequire(runtime).resolve("onnxruntime-common")
      await mkdir(path.join(app, "node_modules"), { recursive: true })
      await mkdir(path.join(resources, "voice"), { recursive: true })
      await cp(path.dirname(modulePath), path.join(app, "node_modules", "sherpa-onnx-node"), { recursive: true })
      const native = createRequire(modulePath).resolve("sherpa-onnx-win-x64")
      await cp(path.dirname(native), path.join(app, "node_modules", "sherpa-onnx-win-x64"), { recursive: true })
      await cp(path.dirname(path.dirname(runtime)), path.join(app, "node_modules", "onnxruntime-node"), { recursive: true })
      await cp(path.dirname(path.dirname(path.dirname(common))), path.join(app, "node_modules", "onnxruntime-common"), { recursive: true })
      for (const file of ["sherpa-worker.cjs", "misaki-worker.cjs", "english-text.cjs"])
        await copyFile(path.resolve(import.meta.dir, "../../voice-windows", file), path.join(resources, "voice", file))
      await asar.createPackageWithOptions(app, path.join(resources, "app.asar"), { unpackDir: "node_modules" })
      const phonemizer = spawnSync(
        executable,
        [
          path.join(resources, "voice", "misaki-worker.cjs"),
          path.join(resources, "app.asar.unpacked", "node_modules", "onnxruntime-node", "dist", "index.js"),
        ],
        {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          input: JSON.stringify({ model: path.join(kokoro!, "kokoro-int8-en-v1"), text: "Hello -2." }),
          encoding: "utf8",
          windowsHide: true,
        },
      )
      expect(phonemizer.status).toBe(0)
      expect(JSON.parse(phonemizer.stdout).map((part: number[]) => String.fromCodePoint(...part))).toEqual([
        "həlˈO mˈInəs tˈu .",
      ])
      const voice = createSherpaVoice(path.join(resources, "voice", "sherpa-worker.cjs"), {
        executable,
        modulePath: path.join(resources, "app.asar", "node_modules", "sherpa-onnx-node", "sherpa-onnx.js"),
        modelDir: (id) => path.join(kokoro!, id),
        phonemizer: {
          helperPath: path.join(resources, "voice", "misaki-worker.cjs"),
          modulePath: path.join(resources, "app.asar", "node_modules", "onnxruntime-node", "dist", "index.js"),
        },
      })
      const cancelled = voice.speak("cancelled-kokoro", "Hello.", "kokoro-int8-en-v1:3")
      voice.cancel("cancelled-kokoro")
      expect(await cancelled).toBeNull()
      const audio = await voice.speak("kokoro", "Frobnication is minus 12.50.", "kokoro-int8-en-v1:3")
      if (!audio) throw new Error("Sample unexpectedly cancelled")
      const wav = Buffer.from(audio)
      expect(wav.toString("ascii", 0, 4)).toBe("RIFF")
      expect(wav.readUInt32LE(24)).toBe(24000)
      expect(wav.length).toBeGreaterThan(44)
      const symbol = await voice.speak("symbol", "$", "kokoro-int8-en-v1:3")
      expect(symbol?.length).toBeGreaterThan(44)
      const half = await voice.speak("half", "Hello ".repeat(50).trim(), "kokoro-int8-en-v1:3")
      const long = await voice.speak("long", "Hello ".repeat(100).trim(), "kokoro-int8-en-v1:3")
      if (!half || !long) throw new Error("Long sample unexpectedly cancelled")
      expect(long.length).toBeGreaterThan(half.length * 1.7)
      await expect(voice.speak("unsupported", "Hello 🌍", "kokoro-int8-en-v1:3")).rejects.toThrow(
        "Unsupported character",
      )
    },
    120_000,
  )

  // Model fixtures are opt-in and never shipped. This cold CPU inference needs a larger CI budget.
  test.skipIf(!fixtures)(
    "synthesizes Kokoro and recognizes the sample through packaged, unpacked addon paths",
    async () => {
      const builder = createRequire(require.resolve("electron-builder"))
      const appBuilder = createRequire(builder.resolve("app-builder-lib"))
      const asar = appBuilder("@electron/asar")
      const app = path.join(root, "app")
      const resources = path.join(root, "resources")
      await mkdir(path.join(app, "node_modules"), { recursive: true })
      await mkdir(path.join(resources, "voice"), { recursive: true })
      await cp(path.dirname(modulePath), path.join(app, "node_modules", "sherpa-onnx-node"), { recursive: true })
      const native = createRequire(modulePath).resolve("sherpa-onnx-win-x64")
      await cp(path.dirname(native), path.join(app, "node_modules", "sherpa-onnx-win-x64"), { recursive: true })
      await copyFile(helper, path.join(resources, "voice", "sherpa-worker.cjs"))
      await asar.createPackageWithOptions(app, path.join(resources, "app.asar"), { unpackDir: "node_modules" })
      const voice = createSherpaVoice(path.join(resources, "voice", "sherpa-worker.cjs"), {
        executable,
        modulePath: path.join(resources, "app.asar", "node_modules", "sherpa-onnx-node", "sherpa-onnx.js"),
        modelDir: (id) => path.join(fixtures!, id),
      })
      const audio = await voice.speak("sample", "This is a simple voice test.", "kokoro-int8-en-v0_19:0")
      if (!audio) throw new Error("Sample unexpectedly cancelled")
      const wav = Buffer.from(audio)
      expect(wav.toString("ascii", 0, 4)).toBe("RIFF")
      expect(wav.readUInt32LE(24)).toBe(24000)
      expect(wav.length).toBeGreaterThan(44)
      const samples = Math.floor((((wav.length - 44) / 2) * 16000) / 24000)
      const recorder = Buffer.alloc(44 + samples * 2)
      wav.copy(recorder, 0, 0, 44)
      recorder.writeUInt32LE(recorder.length - 8, 4)
      recorder.writeUInt32LE(16000, 24)
      recorder.writeUInt32LE(32000, 28)
      recorder.writeUInt32LE(samples * 2, 40)
      Array.from({ length: samples }).forEach((_, index) =>
        recorder.writeInt16LE(wav.readInt16LE(44 + Math.floor((index * 24000) / 16000) * 2), 44 + index * 2),
      )
      const text = await voice.transcribe(recorder, "whisper-tiny-en")
      expect(text.toLowerCase()).toBe("this is a simple voice test.")
      console.log(`Electron packaged Kokoro: ${wav.length} bytes, 24000 Hz; Whisper: ${JSON.stringify(text)}`)
    },
    120_000,
  )
})
