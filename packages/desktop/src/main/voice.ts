import { app } from "electron"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createWriteStream, existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pipeline } from "node:stream/promises"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { createWindowsVoice } from "./windows-voice"

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
  return windowsVoice.voices()
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

export async function transcribe(wav: Uint8Array) {
  if (process.platform === "win32") return windowsVoice.transcribe(wav)
  const helper = await ready()
  const input = path.join(helper.temp, `input-${state.next++}.wav`)
  await writeFile(input, wav)
  const result = await helper.request({ type: "transcribe", input }).finally(() => rm(input, { force: true }))

  return typeof result.text === "string" ? result.text : ""
}

// Resolves to null when the request was cancelled, so a talked-over sentence never plays.
export async function speak(id: string, text: string, voice: string) {
  if (process.platform === "win32") return windowsVoice.speak(id, text, voice)
  const helper = await ready()
  const output = path.join(helper.temp, `speech-${state.next++}.wav`)
  const result = await helper.request({ type: "speak", text, voice, output }, id)

  if (result.cancelled) return null
  const audio = await readFile(output)
  await rm(output, { force: true })

  return new Uint8Array(audio)
}

export function cancel(id: string) {
  if (process.platform === "win32") return windowsVoice.cancel(id)
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
