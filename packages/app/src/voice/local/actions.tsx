import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { createSignal, onCleanup, onMount, Show } from "solid-js"
import type { ComposerModel } from "@/composer/model"
import type { LocalVoice } from "@/runtime/platform/platform"
import { usePlatform } from "@/runtime/platform/platform"
import { useLanguage } from "@/runtime/i18n/language"
import { announce } from "@/session/announce"
import { useCommand } from "@/shell/commands/command"
import { insert, voiceMode } from "./mode"
import { startRecorder, type Recorder } from "./recorder"
import { DialogVoiceSetup } from "./setup"
import { useLocalVoiceSettings } from "./settings"

/** On-device voice controls for the composer: Dictate first, then Start Voice Mode. Hidden where unsupported. */
export function LocalVoiceActions(props: { controller: ComposerModel }) {
  const platform = usePlatform()
  const [supported, setSupported] = createSignal(false)

  onMount(() => {
    void platform.voice?.status().then((status) => setSupported(status.supported))
  })

  return (
    <Show when={supported() && platform.voice}>
      {(voice) => (
        <>
          <DictateButton voice={voice()} />
          <VoiceModeButton voice={voice()} controller={props.controller} />
        </>
      )}
    </Show>
  )
}

function DictateButton(props: { voice: LocalVoice }) {
  const platform = usePlatform()
  const language = useLanguage()
  const setup = useSetup(props.voice)
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

  onCleanup(() => session.recorder?.stop())

  return (
    <Button
      ref={button}
      type="button"
      size="small"
      variant="ghost"
      class="me-1"
      data-action="composer-dictate"
      title={language.t("voice.local.dictate.hint")}
      disabled={voiceMode.active()}
      onClick={() => void (listening() ? stop() : setup(start))}
    >
      {listening() ? language.t("voice.local.dictate.stop") : language.t("voice.local.dictate")}
    </Button>
  )
}

/** Starts and ends Voice Mode (see mode.ts) and gives it this composer while mounted. */
function VoiceModeButton(props: { voice: LocalVoice; controller: ComposerModel }) {
  const platform = usePlatform()
  const language = useLanguage()
  const command = useCommand()
  const setup = useSetup(props.voice)
  const local = useLocalVoiceSettings()
  let button!: HTMLButtonElement

  const toggle = () =>
    voiceMode.active()
      ? voiceMode.end()
      : setup(() => voiceMode.start({ voice: props.voice, platform, language, settings: () => local.settings }))

  command.register("voice-mode", () => [
    {
      id: "voice.mode.toggle",
      title: voiceMode.active() ? language.t("voice.local.mode.stop") : language.t("voice.local.mode"),
      category: language.t("command.category.session"),
      keybind: "mod+alt+v",
      onSelect: () => void toggle(),
    },
    {
      id: "voice.mode.stopSpeaking",
      title: language.t("voice.local.mode.stopSpeaking"),
      category: language.t("command.category.session"),
      keybind: "mod+alt+s",
      disabled: !voiceMode.active(),
      onSelect: voiceMode.stopSpeaking,
    },
  ])

  onMount(() => onCleanup(voiceMode.bind(props.controller, button)))

  return (
    <Button
      ref={button}
      type="button"
      size="small"
      variant="ghost"
      class="me-1"
      data-action="composer-voice-mode"
      title={language.t("voice.local.mode.hint")}
      onClick={() => void toggle()}
    >
      {voiceMode.active() ? language.t("voice.local.mode.stop") : language.t("voice.local.mode")}
    </Button>
  )
}

/** Runs `then` once the voice model is installed, showing the first-run setup screen when it is not. */
function useSetup(voice: LocalVoice) {
  const dialog = useDialog()
  const local = useLocalVoiceSettings()

  return async (then: () => Promise<void> | void) => {
    const status = await voice.status()

    if (status.installed) return then()
    dialog.show(() => (
      <DialogVoiceSetup
        voice={voice}
        current={local.settings.voice}
        onVoice={(name) => local.setSettings("voice", name)}
        onReady={() => void then()}
      />
    ))
  }
}
