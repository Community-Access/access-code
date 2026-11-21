import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { createSignal, onMount, Show } from "solid-js"
import type { LocalVoice } from "@/runtime/platform/platform"
import { usePlatform } from "@/runtime/platform/platform"
import { useLanguage } from "@/runtime/i18n/language"
import { announce } from "@/session/announce"
import { startRecorder, type Recorder } from "./recorder"
import { DialogVoiceSetup } from "./setup"
import { useLocalVoiceSettings } from "./settings"

/** On-device voice controls for the composer: Dictate first, then Start Voice Mode. Hidden where unsupported. */
export function LocalVoiceActions() {
  const platform = usePlatform()
  const [supported, setSupported] = createSignal(false)

  onMount(() => {
    void platform.voice?.status().then((status) => setSupported(status.supported))
  })

  return (
    <Show when={supported() && platform.voice}>{(voice) => <DictateButton voice={voice()} />}</Show>
  )
}

function DictateButton(props: { voice: LocalVoice }) {
  const platform = usePlatform()
  const language = useLanguage()
  const dialog = useDialog()
  const local = useLocalVoiceSettings()
  const [listening, setListening] = createSignal(false)
  const session: { recorder?: Recorder; queue: Promise<void>; parts: string[] } = { queue: Promise.resolve(), parts: [] }
  let button!: HTMLButtonElement

  const start = async () => {
    const allowed = (await platform.requestMicrophone?.()) ?? true

    if (!allowed) return announce(language.t("voice.local.microphone.denied"), "assertive")
    session.parts = []
    session.queue = Promise.resolve()
    session.recorder = await startRecorder((wav) => {
      session.queue = session.queue
        .then(() => props.voice.transcribe(wav))
        .then((text) => {
          if (!text) return
          session.parts.push(text)
          announce(language.t("voice.local.dictate.heard", { text }))
        })
        .catch((error: unknown) => announce(language.t("voice.local.failed", { error: String(error) }), "assertive"))
    })
    setListening(true)
    announce(language.t("voice.local.dictate.started"))
  }

  const stop = async () => {
    session.recorder?.stop()
    session.recorder = undefined
    setListening(false)
    await session.queue
    const text = session.parts.join(" ")

    if (!text) return announce(language.t("voice.local.dictate.nothing"))
    insert(button, text)
    announce(language.t("voice.local.dictate.stopped"))
  }

  const toggle = async () => {
    if (listening()) return stop()
    const status = await props.voice.status()

    if (status.installed) return start()
    dialog.show(() => (
      <DialogVoiceSetup
        voice={props.voice}
        current={local.settings.voice}
        onVoice={(voice) => local.setSettings("voice", voice)}
        onReady={() => void start()}
      />
    ))
  }

  return (
    <Button
      ref={button}
      type="button"
      size="small"
      variant="ghost"
      class="me-1"
      data-action="composer-dictate"
      title={language.t("voice.local.dictate.hint")}
      onClick={() => void toggle()}
    >
      {listening() ? language.t("voice.local.dictate.stop") : language.t("voice.local.dictate")}
    </Button>
  )
}

// Types the text into the composer as if it were typed, so drafts, history, and undo all see it.
function insert(from: HTMLElement, text: string) {
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
