import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Schema } from "effect"

const Voices = Schema.fromJsonString(Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })))
const Text = Schema.fromJsonString(Schema.String)

export function createWindowsVoice(helper: string) {
  const pending = new Map<string, AbortController>()

  const run = (args: string[], input?: string, signal?: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(helper, args, { stdio: "pipe", windowsHide: true, signal })
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
      child.on("close", (code) => {
        if (failure) return reject(failure)
        if (code !== 0)
          return reject(new Error(Buffer.concat(errors).toString("utf8").trim() || `Speech helper exited with ${code}`))
        resolve(Buffer.concat(output).toString("utf8"))
      })
      child.stdin.end(input)
    })

  const voices = async () => Schema.decodeUnknownSync(Voices)(await run(["voices"]))

  const transcribe = async (audio: Uint8Array) => {
    const directory = await mkdtemp(path.join(tmpdir(), "accesscode-speech-"))
    const input = path.join(directory, "input.wav")
    try {
      await writeFile(input, audio)
      return Schema.decodeUnknownSync(Text)(await run(["transcribe", input]))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

  const speak = async (id: string, text: string, voice: string) => {
    if (pending.has(id)) throw new Error("A speech request with this ID is already active")
    const controller = new AbortController()
    pending.set(id, controller)
    const directory = await mkdtemp(path.join(tmpdir(), "accesscode-speech-")).catch((error: unknown) => {
      pending.delete(id)
      throw error
    })
    try {
      if (controller.signal.aborted) return null
      const output = path.join(directory, "output.wav")
      await run(["speak", voice, output], text, controller.signal)
      if (controller.signal.aborted) return null
      const audio = new Uint8Array(await readFile(output))
      if (controller.signal.aborted) return null
      return audio
    } catch (error) {
      if (controller.signal.aborted) return null
      throw error
    } finally {
      pending.delete(id)
      await rm(directory, { recursive: true, force: true })
    }
  }

  return {
    voices,
    transcribe,
    speak,
    cancel: (id: string) => pending.get(id)?.abort(),
  }
}
