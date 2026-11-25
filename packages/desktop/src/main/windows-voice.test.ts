import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import path from "node:path"
import { createWindowsVoice } from "./windows-voice"

const helper = path.resolve(import.meta.dir, "../../resources/voice/accesscode-sapi.exe")
const voice = createWindowsVoice(helper)

describe.skipIf(process.platform !== "win32" || !existsSync(helper))("Windows speech helper", () => {
  test(
    "lists installed voices, synthesizes audio and transcribes it",
    async () => {
      const voices = await voice.voices()
      expect(voices.length).toBeGreaterThan(0)
      const wav = await voice.speak("sample", "This is a simple voice test.", voices[0].id)
      if (!wav) throw new Error("Speech was unexpectedly cancelled")
      expect(wav.length).toBeGreaterThan(44)
      expect(await voice.transcribe(wav)).not.toBe("")
    },
    30_000,
  )

  test("cancels a request before the helper starts", async () => {
    const request = voice.speak("cancelled", "This should not be spoken.", "unused")
    voice.cancel("cancelled")
    expect(await request).toBeNull()
  })

  test("reports an unavailable voice", async () => {
    await expect(voice.speak("missing", "Hello.", "missing-voice")).rejects.toThrow("Opening voice")
  })
})
