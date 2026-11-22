import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { Schema } from "effect"

const Text = Schema.fromJsonString(Schema.String)
const Phonemes = Schema.fromJsonString(Schema.Array(Schema.Array(Schema.Number)))

/**
 * Native inference runs only in an Electron-as-Node child, never in the main process.
 * Recognition IDs select model packs; synthesis voices are "<pack-id>:<speaker-index>".
 */
export function createSherpaVoice(
  helperPath: string,
  options: {
    executable: string
    modulePath: string
    modelDir: (id: string) => string
    phonemizer?: { helperPath: string; modulePath: string }
  },
) {
  const pending = new Map<string, AbortController>()
  const unpacked = (file: string) => file.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2")

  const run = (request: object, signal?: AbortSignal, worker = helperPath, module = options.modulePath) =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(options.executable, [unpacked(worker), unpacked(module)], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: "pipe",
        windowsHide: true,
        shell: false,
        signal,
      })
      const output: Buffer[] = []
      const errors: Buffer[] = []
      let failure: Error | undefined
      child.stdout.on("data", (chunk: Buffer) => output.push(chunk))
      child.stderr.on("data", (chunk: Buffer) => errors.push(chunk))
      child.on("error", (error) => {
        failure ??= error
      })
      child.stdin.on("error", (error) => {
        failure ??= error
      })
      // Abort emits "error" before native code releases its file handles. Only close permits cleanup.
      child.on("close", (code) => {
        if (signal?.aborted) return reject(new Error("Speech cancelled"))
        const stderr = Buffer.concat(errors).toString("utf8").trim()
        if (code !== 0 || failure)
          return reject(new Error(stderr || failure?.message || `Sherpa worker exited with ${code}`))
        resolve(Buffer.concat(output).toString("utf8"))
      })
      child.stdin.end(JSON.stringify(request))
    })

  const transcribe = async (audio: Uint8Array, id: string) => {
    if (id !== "whisper-tiny-en" && id !== "moonshine-tiny-en")
      throw new Error(`Unsupported recognition pack: ${id}`)
    const model = options.modelDir(id)
    const directory = await mkdtemp(path.join(path.dirname(model), ".sherpa-job-"))
    try {
      const input = path.join(directory, "input.wav")
      await writeFile(input, audio)
      return Schema.decodeUnknownSync(Text)(await run({ type: "transcribe", model, input, recognizer: id }))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

  const speak = async (id: string, text: string, voice: string) => {
    if (pending.has(id)) throw new Error("A speech request with this ID is already active")
    const controller = new AbortController()
    pending.set(id, controller)
    let directory: string | undefined
    try {
      const match = /^(kokoro-int8-en-v0_19|kokoro-int8-en-v1):(\d+)$/.exec(voice)
      if (!match) throw new Error('Sherpa voice must be "<pack-id>:<speaker-index>"')
      const model = options.modelDir(match[1])
      // Keep scratch files beside the user-owned packs, not in the installed application's resources.
      directory = await mkdtemp(path.join(path.dirname(model), ".sherpa-job-"))
      if (controller.signal.aborted) return null
      const output = path.join(directory, "output.wav")
      const phonemizer = options.phonemizer
      if (match[1] === "kokoro-int8-en-v1" && !phonemizer) throw new Error("Kokoro phonemizer is unavailable")
      const phonemes =
        match[1] === "kokoro-int8-en-v1" && phonemizer
          ? Schema.decodeUnknownSync(Phonemes)(
              await run({ model, text }, controller.signal, phonemizer.helperPath, phonemizer.modulePath),
            )
          : undefined
      if (controller.signal.aborted) return null
      await run({ type: "speak", model, output, text, speaker: Number(match[2]), phonemes }, controller.signal)
      if (controller.signal.aborted) return null
      const audio = new Uint8Array(await readFile(output))
      return controller.signal.aborted ? null : audio
    } catch (error) {
      if (controller.signal.aborted) return null
      throw error
    } finally {
      pending.delete(id)
      if (directory) await rm(directory, { recursive: true, force: true })
    }
  }

  return { transcribe, speak, cancel: (id: string) => pending.get(id)?.abort() }
}
