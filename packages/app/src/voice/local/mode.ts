import { createSignal } from "solid-js"
import type { ComposerModel } from "@/composer/model"
import type { useLanguage } from "@/runtime/i18n/language"
import type { LocalVoice, usePlatform } from "@/runtime/platform/platform"
import type { useServerSDK } from "@/runtime/server/client"
import { announce } from "@/session/announce"
import { plainText } from "@/session/timeline/reply-announcement"
import { startRecorder, type Recorder } from "./recorder"

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
  settings: () => { voice: string; speed: number }
}

const [active, setActive] = createSignal(false)

const state = {
  options: undefined as Options | undefined,
  recorder: undefined as Recorder | undefined,
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

  async start(options: Options) {
    if (active()) return
    const allowed = (await options.platform.requestMicrophone?.()) ?? true

    if (!allowed) return announce(options.language.t("voice.local.microphone.denied"), "assertive")
    state.options = options
    state.queue = Promise.resolve()
    state.pending = []
    state.recorder = await startRecorder((wav) => {
      state.talking = false
      state.queue = state.queue
        .then(() => options.voice.transcribe(wav))
        .then(heard)
        .catch((error: unknown) => {
          resume()
          announce(options.language.t("voice.local.failed", { error: String(error) }), "assertive")
        })
    }, 1500)
    state.recorder.onSpeech(() => {
      state.talking = true
      if (speaker.ids.length === 0) return
      speaker.held = true
      speaker.audio?.pause()
    })
    setActive(true)
    void options.platform.setVoiceCallActive?.(true)
    announce(options.language.t("voice.local.mode.started"))
  },

  end() {
    const options = state.options

    if (!active() || !options) return
    setActive(false)
    state.recorder?.stop()
    state.recorder = undefined
    state.pending = []
    state.talking = false
    stopSpeaking()
    void options.platform.setVoiceCallActive?.(false)
    announce(options.language.t("voice.local.mode.stopped"))
  },

  stopSpeaking,

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

async function heard(heardText: string) {
  const options = state.options

  if (heardText) state.pending.push(heardText)

  if (!options || state.pending.length === 0) return resume()
  stopSpeaking()

  // The user started talking again while this was being understood, so the next utterance sends them together.
  if (state.talking) return
  const text = state.pending.splice(0).join(" ")
  const composer = await nextComposer()

  if (!composer || !active()) return
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

function stopSpeaking() {
  speaker.run++
  speaker.ids.forEach((id) => void state.options?.voice.cancel(id))
  speaker.ids = []
  speaker.held = false
  speaker.audio?.pause()
  speaker.finish?.()
}

function resume() {
  speaker.held = false
  void speaker.audio?.play().catch(speaker.finish)
}

async function speak(markdown: string) {
  const options = state.options

  if (!options) return
  stopSpeaking()
  const run = speaker.run
  // Every sentence is queued at once: the helper makes them in order while earlier ones play.
  const clips = sentences(markdown).map((text, index) => {
    const id = `voice-mode-${run}-${index}`
    speaker.ids.push(id)

    return options.voice.speak(id, text, options.settings().voice).catch(() => null)
  })

  for (const clip of clips) {
    const wav = await clip

    if (run !== speaker.run) return

    if (wav) await play(wav, options.settings().speed)

    if (run !== speaker.run) return
  }
  speaker.ids = []
}

function play(wav: ArrayBuffer, speed: number) {
  return new Promise<void>((resolve) => {
    const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }))
    const audio = new Audio(url)
    audio.playbackRate = speed
    speaker.audio = audio
    speaker.finish = () => {
      speaker.audio = undefined
      speaker.finish = undefined
      URL.revokeObjectURL(url)
      resolve()
    }
    audio.onended = speaker.finish
    audio.onerror = speaker.finish

    // A clip that arrives while the user is talking waits until their words are understood.
    if (!speaker.held) void audio.play().catch(speaker.finish)
  })
}

// Model-facing guidance, not UI copy, so it stays English like other instructions the model reads.
const guidance = [
  "The user is talking with you through AccessCode Voice Mode.",
  "Their messages are speech recognized on their Mac, so a word may be misheard: read for the intent behind it, and if a request is unclear or seems cut off, ask a short question instead of guessing.",
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
