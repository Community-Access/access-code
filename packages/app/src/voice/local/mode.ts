import { createSignal } from "solid-js"
import { uuid } from "@opencode/util/uuid"
import type { ComposerModel } from "@/composer/model"
import type { useLanguage } from "@/runtime/i18n/language"
import type { LocalVoice, usePlatform } from "@/runtime/platform/platform"
import type { useServerSDK } from "@/runtime/server/client"
import { announce } from "@/session/announce"
import { plainText } from "@/session/timeline/reply-announcement"
import { startRecorder, type Recorder } from "./recorder"
import { transition, type ModeEvent, type ModeState } from "./mode-machine"

// Voice Mode is one spoken conversation per window: each pause in speech sends what was said, and the finished reply
// is spoken back with the chosen Liquid Audio voice. The microphone stays open while it speaks, so talking over the
// reply pauses it, and the reply stops for good once the new words are understood.
//
// It lives outside the composer because sending the first message of a new chat replaces the composer; the current
// composer binds itself while mounted. The timeline hands it each finished reply instead of reading it aloud.

type Options = {
  voice: LocalVoice
  platform: ReturnType<typeof usePlatform>
  language: ReturnType<typeof useLanguage>
  settings: () => {
    voice: string
    speed: number
    recognizer?: string
    volume?: number
    microphone?: string
    interruption?: "steer" | "cancel"
  }
}

const [mode, setMode] = createSignal<ModeState<Options, Recorder>>({ type: "idle" })
const dispatch = (event: ModeEvent<Options, Recorder>) => setMode((current) => transition(current, event))
const active = () => mode().type === "active"
const activeAttempt = (id: string) => {
  const current = mode()
  return current.type === "active" && current.id === id
}
const startingAttempt = (id: string) => {
  const current = mode()
  return current.type === "starting" && current.id === id
}

const state = {
  queue: Promise.resolve(),
  composer: undefined as Composer | undefined,
  // Words heard but not sent yet, kept while the user is still talking so a paused sentence goes as one message.
  pending: [] as string[],
  talking: false,
  waiting: [] as Array<(composer: Composer) => void>,
}

type Composer = { controller: ComposerModel; anchor: HTMLElement }

const speaker = {
  run: 0,
  ids: [] as string[],
  held: false,
  audio: undefined as HTMLAudioElement | undefined,
  finish: undefined as (() => void) | undefined,
}

export const voiceMode = {
  active,
  engaged: () => mode().type !== "idle",

  async start(options: Options) {
    if (mode().type !== "idle") return
    const run = uuid()
    dispatch({ type: "start", id: run, options })
    state.queue = Promise.resolve()
    state.pending = []
    try {
      const allowed = (await options.platform.requestMicrophone?.()) ?? true
      if (!startingAttempt(run)) return
      if (!allowed) {
        dispatch({ type: "failed", id: run })
        return announce(
          options.language.t(
            options.platform.platform === "desktop" && options.platform.os === "windows"
              ? "voice.windows.microphone.denied"
              : "voice.local.microphone.denied",
          ),
          "assertive",
        )
      }
      const recorder = await startRecorder((wav) => {
        if (!activeAttempt(run)) return
        state.talking = false
        state.queue = state.queue
          .then(() => (activeAttempt(run) ? options.voice.transcribe(wav, options.settings().recognizer) : ""))
          .then((text) => heard(text, run))
          .catch((error: unknown) => {
            if (!activeAttempt(run)) return
            resume()
            announce(options.language.t("voice.local.error", { error: String(error) }), "assertive")
          })
      }, 1500, options.settings().microphone)
      recorder.onSpeech(() => {
        if (!activeAttempt(run)) return
        state.talking = true
        if (speaker.ids.length === 0) return
        speaker.held = true
        speaker.audio?.pause()
      })
      if (!startingAttempt(run)) {
        recorder.stop()
        return
      }
      dispatch({ type: "started", id: run, recorder })
    } catch (error) {
      if (!startingAttempt(run)) return
      dispatch({ type: "failed", id: run })
      throw error
    }
    void options.platform.setVoiceCallActive?.(true)
    announce(options.language.t("voice.local.mode.started"))
  },

  end() {
    const current = mode()

    if (current.type === "idle") return
    dispatch({ type: "end" })
    try {
      if (current.type === "active") current.recorder.stop()
    } finally {
      state.pending = []
      state.talking = false
      stopSpeaking(current.options)
      void current.options.platform.setVoiceCallActive?.(false)
      announce(current.options.language.t("voice.local.mode.stopped"))
    }
  },

  stopSpeaking: () => stopSpeaking(),

  /** The mounted composer receives what the user says. `anchor` is any element inside its form. */
  bind(controller: ComposerModel, anchor: HTMLElement) {
    const composer = { controller, anchor }
    state.composer = composer
    state.waiting.splice(0).forEach((resolve) => resolve(composer))

    return () => {
      if (state.composer === composer) state.composer = undefined
    }
  },

  reply(markdown: string) {
    if (active()) void speak(markdown)
  },
}

async function heard(heardText: string, run: string) {
  const current = mode()
  if (current.type !== "active" || current.id !== run) return
  const options = current.options

  if (heardText) state.pending.push(heardText)

  if (state.pending.length === 0) return resume()
  stopSpeaking()

  // The user started talking again while this was being understood, so the next utterance sends them together.
  if (state.talking) return
  const composer = await nextComposer()

  if (!activeAttempt(run)) return
  if (!composer) {
    announce(options.language.t("voice.local.mode.composerUnavailable"), "assertive")
    return
  }
  if (options.settings().interruption === "cancel") {
    if (!composer.controller.interruptVoice) throw new Error("Session interruption is unavailable")
    await composer.controller.interruptVoice()
  }
  if (!activeAttempt(run)) return
  if (state.composer !== composer) {
    announce(options.language.t("voice.local.mode.composerUnavailable"), "assertive")
    return
  }
  const text = state.pending.splice(0).join(" ")
  announce(options.language.t("voice.local.mode.heard", { text }))

  // An empty message box is filled directly, so screen reader focus stays where the user is reading. A draft
  // keeps its own parts, and the words are typed after it.
  if (composer.controller.value().trim() || composer.controller.parts().length > 1) insert(composer.anchor, text)
  else composer.controller.onInput(text, [{ type: "text", content: text, start: 0, end: text.length }], text.length)
  composer.controller.submit()
}

// Sending the first message of a new chat swaps in the chat's own composer, so words heard in that moment wait
// briefly for it rather than being dropped.
function nextComposer() {
  if (state.composer) return Promise.resolve(state.composer)

  return new Promise<Composer | undefined>((resolve) => {
    state.waiting.push(resolve)
    setTimeout(() => {
      state.waiting = state.waiting.filter((waiter) => waiter !== resolve)
      resolve(undefined)
    }, 5000)
  })
}

function stopSpeaking(previous?: Options) {
  speaker.run++
  const current = mode()
  const options = previous ?? (current.type === "idle" ? undefined : current.options)
  speaker.ids.forEach((id) =>
    void options?.voice
      .cancel(id)
      .catch((error: unknown) =>
        announce(options.language.t("voice.local.error", { error: String(error) }), "assertive"),
      ),
  )
  speaker.ids = []
  speaker.held = false
  speaker.audio?.pause()
  speaker.finish?.()
}

function resume() {
  speaker.held = false
  const audio = speaker.audio
  if (!audio) return
  void audio.play().catch((error: unknown) => {
    if (speaker.audio !== audio) return
    playbackFailed(String(error))
  })
}

function playbackFailed(error: string) {
  const current = mode()
  if (current.type !== "active") return
  stopSpeaking()
  announce(current.options.language.t("voice.local.error", { error }), "assertive")
}

async function speak(markdown: string) {
  const current = mode()

  if (current.type !== "active") return
  const options = current.options
  stopSpeaking()
  const run = speaker.run
  const serial = { current: Promise.resolve() }
  const clips = sentences(markdown).map((text, index) => {
    const id = `voice-mode-${run}-${index}`
    speaker.ids.push(id)

    const render = () => {
      if (run !== speaker.run) return Promise.resolve(null)
      return options.voice.speak(id, text, options.settings().voice).catch((error: unknown) => {
        if (run === speaker.run) {
          stopSpeaking()
          announce(options.language.t("voice.local.error", { error: String(error) }), "assertive")
        }
        return null
      })
    }
    if (options.platform.platform !== "desktop" || options.platform.os !== "windows") return render()
    const clip = serial.current.then(render)
    serial.current = clip.then(() => undefined)
    return clip
  })

  for (const clip of clips) {
    const wav = await clip

    if (run !== speaker.run) return

    if (wav) await play(wav, options.settings().speed, options.settings().volume ?? 1)

    if (run !== speaker.run) return
  }
  speaker.ids = []
}

function play(wav: ArrayBuffer, speed: number, volume: number) {
  return new Promise<void>((resolve) => {
    const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }))
    const audio = new Audio(url)
    audio.playbackRate = speed
    audio.volume = volume
    speaker.audio = audio
    speaker.finish = () => {
      audio.onended = null
      audio.onerror = null
      speaker.audio = undefined
      speaker.finish = undefined
      URL.revokeObjectURL(url)
      resolve()
    }
    audio.onended = speaker.finish
    audio.onerror = () => {
      const current = mode()
      if (current.type !== "active" || speaker.audio !== audio) return
      playbackFailed(current.options.language.t("voice.local.playback.failed"))
    }

    // A clip that arrives while the user is talking waits until their words are understood.
    if (!speaker.held)
      void audio.play().catch((error: unknown) => {
        if (speaker.audio !== audio) return
        playbackFailed(String(error))
      })
  })
}

// Model-facing guidance, not UI copy, so it stays English like other instructions the model reads.
const guidance = [
  "The user is talking with you through AccessCode Voice Mode.",
  "Their messages are recognized speech, so a word may be misheard: read for the intent behind it, and if a request is unclear or seems cut off, ask a short question instead of guessing.",
  "Your reply is read aloud. Answer in a few short, plain sentences, as you would say them. No headings, tables, or lists unless asked, and ask at most one question at a time.",
  "Do the work with tools as usual, then say briefly what you did. Put code in files, not in the reply.",
].join(" ")

const instructed = new Set<string>()

/** Keeps the Voice Mode guidance on the shown session while Voice Mode is on, and takes it off afterwards. */
export function syncVoiceGuidance(
  api: ReturnType<typeof useServerSDK>["api"],
  sessionID: string | undefined,
  on: boolean,
) {
  // Turning Voice Mode off clears every session it was on, including ones the user switched away from.
  if (!on) {
    instructed.forEach((id) =>
      void api.experimental.session.instructions.entry.remove({ sessionID: id, key: "voice-mode" }).catch(() => undefined),
    )
    instructed.clear()

    return
  }

  if (sessionID && !instructed.has(sessionID)) {
    instructed.add(sessionID)
    void api.experimental.session.instructions.entry
      .put({ sessionID, key: "voice-mode", value: guidance })
      .catch(() => instructed.delete(sessionID))
  }
}

/** The reply as short spoken sentences: code blocks are skipped and each line and sentence is spoken on its own. */
export function sentences(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, "\n")
    .split(/\n+/)
    .map(plainText)
    // A sentence ends at punctuation followed by a space, so names like main.ts stay whole.
    .flatMap((line) => line.split(/(?<=[.!?]["')\]]*)\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => /\w/.test(sentence))
}

/** Types the text into the composer as if it were typed, so drafts, history, and undo all see it. */
export function insert(from: HTMLElement, text: string) {
  const editor = from.closest("form")?.querySelector<HTMLElement>('[data-component="composer-editor"]')

  if (!editor) return
  editor.focus()
  const selection = window.getSelection()

  if (selection && !editor.contains(selection.anchorNode)) {
    selection.selectAllChildren(editor)
    selection.collapseToEnd()
  }

  const before = editor.textContent ?? ""
  const spacer = before && !/\s$/.test(before) ? " " : ""
  document.execCommand("insertText", false, spacer + text)
}
