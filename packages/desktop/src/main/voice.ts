import { app, net } from "electron"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createWriteStream, existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { pipeline } from "node:stream/promises"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { createWindowsVoice } from "./windows-voice"
import { createSherpaVoice } from "./sherpa-voice"
import { voiceCatalog } from "./voice-catalog"
import { createVoicePacks } from "./voice-packs"

// Local voice for dictation and voice mode: Liquid's LFM2.5 Audio model run by the bundled Swift helper
// (packages/desktop/voice). The model is downloaded once, on request, into the app's data folder.

const repo = "mlx-community/LFM2.5-Audio-1.5B-6bit"

const revision = "c875bcf10d0b18bd811ab7755f20d3b356a61890"

// Sizes at the pinned revision, so progress is known up front and a truncated file is caught.
const files = [
  { name: "config.json", size: 3331 },
  { name: "tokenizer.json", size: 4732404 },
  { name: "tokenizer_config.json", size: 91566 },
  { name: "special_tokens_map.json", size: 434 },
  { name: "audio_detokenizer/config.json", size: 1150 },
  { name: "audio_detokenizer/model.safetensors", size: 314137512 },
  { name: "model.safetensors", size: 1410710961 },
]

const total = files.reduce((sum, file) => sum + file.size, 0)

export type Status = {
  supported: boolean
  installed: boolean
  download: { received: number; total: number } | null
  error: string | null
}

const state = {
  download: null as { received: number; controller: AbortController } | null,
  error: null as string | null,
  helper: null as Helper | null,
  next: 0,
}

const modelDir = () => path.join(app.getPath("userData"), "voice", "LFM2.5-Audio-1.5B-6bit")

const helperPath = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, "voice", "accesscode-voice")
    : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../resources/voice/accesscode-voice")

const windowsHelperPath = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, "voice", "accesscode-sapi.exe")
    : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../resources/voice/accesscode-sapi.exe")

const windowsVoice = createWindowsVoice(windowsHelperPath())
let windowsPacks: ReturnType<typeof createVoicePacks> | undefined
let windowsSherpa: ReturnType<typeof createSherpaVoice> | undefined
const activePacks = new Map<string, number>()
const removingPacks = new Set<string>()
const kokoro = "kokoro-int8-en-v1"
const piper = "piper-libritts-en"
const kokoroVoices = [
  "Alloy", "Aoede", "Bella", "Heart", "Jessica", "Kore", "Nicole", "Nova", "River", "Sarah", "Sky",
  "Adam", "Echo", "Eric", "Fenrir", "Liam", "Michael", "Onyx", "Puck", "Santa",
]

function packManager() {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("Windows voice models are available only on Windows x64")
  windowsPacks ??= createVoicePacks(path.join(app.getPath("userData"), "voice", "packs"), voiceCatalog, net.fetch)
  return windowsPacks
}

function sherpaVoice() {
  if (windowsSherpa) return windowsSherpa
  const resources = app.isPackaged
    ? path.join(process.resourcesPath, "voice")
    : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../resources/voice")
  const modulePath = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "sherpa-onnx-node", "sherpa-onnx.js")
    : createRequire(import.meta.url).resolve("sherpa-onnx-node")
  windowsSherpa = createSherpaVoice(path.join(resources, "sherpa-worker.cjs"), {
    executable: process.execPath,
    modulePath,
    modelDir: (id) => path.join(app.getPath("userData"), "voice", "packs", id),
    phonemizer: {
      helperPath: path.join(resources, "misaki-worker.cjs"),
      piperHelperPath: path.join(resources, "piper-worker.cjs"),
      modulePath: app.isPackaged
        ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "onnxruntime-node", "dist", "index.js")
        : createRequire(import.meta.url).resolve("onnxruntime-node"),
    },
  })
  return windowsSherpa
}

export async function packs() {
  if (process.platform !== "win32" || process.arch !== "x64") return []
  return packManager().list()
}

export function installPack(id: string) {
  return packManager().start(id)
}

export function cancelPack(id: string) {
  return packManager().cancel(id)
}

export async function removePack(id: string) {
  if (activePacks.has(id)) throw new Error("Cannot remove a voice model while it is in use")
  removingPacks.add(id)
  try {
    await packManager().remove(id)
  } finally {
    removingPacks.delete(id)
  }
}

export function status(): Status {
  if (process.platform === "win32") {
    const supported = existsSync(windowsHelperPath())
    return { supported, installed: supported, download: null, error: null }
  }
  return {
    supported: process.platform === "darwin" && process.arch === "arm64" && existsSync(helperPath()),
    installed: existsSync(path.join(modelDir(), files[files.length - 1].name)),
    download: state.download ? { received: state.download.received, total } : null,
    error: state.error,
  }
}

export async function voices() {
  if (process.platform !== "win32") return []
  const voices = await windowsVoice.voices()
  if (process.arch !== "x64") return voices
  const installed = await packManager().list()
  return [
    ...voices,
    ...(installed.some((pack) => pack.id === kokoro && pack.installed)
      ? kokoroVoices.map((name, index) => ({ id: `${kokoro}:${index}`, name: `Kokoro ${name} (US English)` }))
      : []),
    ...(installed.some((pack) => pack.id === piper && pack.installed)
      ? Array.from({ length: 904 }, (_, index) => ({ id: `${piper}:${index}`, name: `Piper LibriTTS ${index + 1} (US English)` }))
      : []),
  ]
}

// Starts the download and returns at once; callers poll status() for progress.
export function download() {
  if (process.platform === "win32") throw new Error("Windows system speech does not require a model download")
  if (state.download || status().installed) return
  const controller = new AbortController()
  state.download = { received: 0, controller }
  state.error = null
  void fetchModel(controller.signal)
    .catch((error) => {
      state.error = controller.signal.aborted ? null : String(error instanceof Error ? error.message : error)
    })
    .finally(() => {
      state.download = null
    })
}

export function cancelDownload() {
  state.download?.controller.abort()
}

export async function remove() {
  if (process.platform === "win32") throw new Error("Windows system speech is managed by Windows")
  state.helper?.child.kill()
  state.helper = null
  await rm(modelDir(), { recursive: true, force: true })
}

export async function transcribe(wav: Uint8Array, recognizer?: string) {
  if (process.platform === "win32") {
    if (!recognizer || recognizer === "sapi") return windowsVoice.transcribe(wav)
    if (recognizer !== "whisper-tiny-en" && recognizer !== "moonshine-tiny-en")
      throw new Error(`Unknown recognition model: ${recognizer}`)
    if (removingPacks.has(recognizer)) throw new Error("The selected recognition model is being removed")
    activePacks.set(recognizer, (activePacks.get(recognizer) ?? 0) + 1)
    try {
      const pack = (await packManager().list()).find((item) => item.id === recognizer)
      if (!pack?.installed) throw new Error("The selected recognition model is not installed")
      return await sherpaVoice().transcribe(wav, recognizer)
    } finally {
      const count = activePacks.get(recognizer) ?? 1
      if (count === 1) activePacks.delete(recognizer)
      if (count > 1) activePacks.set(recognizer, count - 1)
    }
  }
  const helper = await ready()
  const input = path.join(helper.temp, `input-${state.next++}.wav`)
  await writeFile(input, wav)
  const result = await helper.request({ type: "transcribe", input }).finally(() => rm(input, { force: true }))

  return typeof result.text === "string" ? result.text : ""
}

// Resolves to null when the request was cancelled, so a talked-over sentence never plays.
export async function speak(id: string, text: string, voice: string) {
  if (process.platform === "win32") {
    const pack = voice.startsWith(`${kokoro}:`) ? kokoro : voice.startsWith(`${piper}:`) ? piper : undefined
    if (!pack) return windowsVoice.speak(id, text, voice)
    if (removingPacks.has(pack)) throw new Error("The selected speech model is being removed")
    activePacks.set(pack, (activePacks.get(pack) ?? 0) + 1)
    try {
      return await sherpaVoice().speak(id, text, voice)
    } finally {
      const count = activePacks.get(pack) ?? 1
      if (count === 1) activePacks.delete(pack)
      if (count > 1) activePacks.set(pack, count - 1)
    }
  }
  const helper = await ready()
  const output = path.join(helper.temp, `speech-${state.next++}.wav`)
  const result = await helper.request({ type: "speak", text, voice, output }, id)

  if (result.cancelled) return null
  const audio = await readFile(output)
  await rm(output, { force: true })

  return new Uint8Array(audio)
}

export function cancel(id: string) {
  if (process.platform === "win32") {
    windowsVoice.cancel(id)
    windowsSherpa?.cancel(id)
    return
  }
  state.helper?.send({ type: "cancel", id })
}

async function fetchModel(signal: AbortSignal) {
  const partial = `${modelDir()}.partial`
  await rm(partial, { recursive: true, force: true })

  for (const file of files) {
    const target = path.join(partial, file.name)
    await mkdir(path.dirname(target), { recursive: true })
    const response = await fetch(`https://huggingface.co/${repo}/resolve/${revision}/${file.name}`, { signal })

    if (!response.ok || !response.body) throw new Error(`Download failed with status ${response.status}`)
    const body = response.body
    await pipeline(
      async function* () {
        for await (const chunk of body) {
          if (state.download) state.download.received += chunk.length
          yield chunk
        }
      },
      createWriteStream(target),
      { signal },
    )

    if ((await stat(target)).size !== file.size) throw new Error(`The download of ${file.name} was incomplete`)
  }

  await rm(modelDir(), { recursive: true, force: true })
  await rename(partial, modelDir())
}

type Helper = {
  child: ChildProcessWithoutNullStreams
  temp: string
  send(message: Record<string, unknown>): void
  request(message: Record<string, unknown>, id?: string): Promise<Record<string, unknown>>
}

async function ready() {
  if (!status().installed) throw new Error("The voice model is not downloaded")

  if (state.helper && state.helper.child.exitCode === null) return state.helper
  const helper = await startHelper()
  state.helper = helper
  await helper.request({ type: "load", model: modelDir() })

  return helper
}

async function startHelper(): Promise<Helper> {
  const child = spawn(helperPath(), [], { stdio: "pipe" })
  const temp = await mkdtemp(path.join(tmpdir(), "accesscode-voice-"))
  const pending = new Map<string, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>()

  createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line)
    const waiter = typeof message.id === "string" ? pending.get(message.id) : undefined

    if (!waiter) return
    pending.delete(message.id)

    if (message.ok || message.cancelled) return waiter.resolve(message)
    waiter.reject(new Error(String(message.error)))
  })
  child.stderr.resume()
  child.on("exit", () => {
    pending.forEach((waiter) => waiter.reject(new Error("The voice helper stopped")))
    pending.clear()
    void rm(temp, { recursive: true, force: true })
  })

  const send = (message: Record<string, unknown>) => {
    child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  return {
    child,
    temp,
    send,
    request: (message: Record<string, unknown>, id = `request-${state.next++}`) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        send({ ...message, id })
      }),
  }
}
