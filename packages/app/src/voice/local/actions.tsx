import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { uuid } from "@opencode/util/uuid"
import { createSignal, onCleanup, onMount, Show, type Accessor, type Setter } from "solid-js"
import type { ComposerModel } from "@/composer/model"
import type { LocalVoice } from "@/runtime/platform/platform"
import { usePlatform } from "@/runtime/platform/platform"
import { useLanguage } from "@/runtime/i18n/language"
import { announce } from "@/session/announce"
import { useCommand } from "@/shell/commands/command"
import { insert, voiceMode } from "./mode"
import { startRecorder } from "./recorder"
import { transition, type DictationEvent, type DictationState } from "./dictation-machine"
import { DialogVoiceSetup } from "./setup"
import { useLocalVoiceSettings, useWindowsVoiceSettings } from "./settings"
import { DialogWindowsVoiceSettings } from "./windows-settings"

/** On-device voice controls for the composer: Dictate first, then Start Voice Mode. Hidden where unsupported. */
export function LocalVoiceActions(props: { controller: ComposerModel }) {
  const platform = usePlatform()
  const language = useLanguage()
  const windows = useWindowsVoiceSettings()
  const [supported, setSupported] = createSignal(false)
  const dictation = createSignal<DictationState>({ type: "idle" })

  onMount(() => {
    void platform.voice?.status()
      .then((status) => setSupported(status.supported))
      .catch((error: unknown) => announce(language.t("voice.local.failed", { error: String(error) }), "assertive"))
  })

  return (
    <Show
      when={
        supported() &&
        (platform.platform !== "desktop" || platform.os !== "windows" || windows.ready()) &&
        platform.voice
      }
    >
      {(voice) => (
        <>
          <DictateButton voice={voice()} windows={windows} state={dictation} />
          <VoiceModeButton voice={voice()} controller={props.controller} windows={windows} dictation={dictation[0]} />
          <Show when={platform.platform === "desktop" && platform.os === "windows"}>
            <WindowsVoiceSettingsButton voice={voice()} windows={windows} />
          </Show>
        </>
      )}
    </Show>
  )
}

function DictateButton(props: {
  voice: LocalVoice
  windows: ReturnType<typeof useWindowsVoiceSettings>
  state: [Accessor<DictationState>, Setter<DictationState>]
}) {
  const platform = usePlatform()
  const language = useLanguage()
  const setup = useSetup(props.voice, props.windows)
  const [dictation, setDictation] = props.state
  const dispatch = (event: DictationEvent) => setDictation((current) => transition(current, event))
  const session: { queue: Promise<void>; parts: string[]; failed: boolean } = {
    queue: Promise.resolve(),
    parts: [],
    failed: false,
  }
  let button!: HTMLButtonElement

  const start = async () => {
    if (dictation().type !== "idle" || voiceMode.engaged()) return
    const id = uuid()
    dispatch({ type: "start", id })
    session.parts = []
    session.failed = false
    session.queue = Promise.resolve()
    try {
      const allowed = (await platform.requestMicrophone?.()) ?? true
      const current = dictation()
      if (current.type !== "starting" || current.id !== id) return
      if (!allowed) {
        dispatch({ type: "failed", id })
        return announce(
          language.t(
            platform.platform === "desktop" && platform.os === "windows"
              ? "voice.windows.microphone.denied"
              : "voice.local.microphone.denied",
          ),
          "assertive",
        )
      }
      const recorder = await startRecorder((wav) => {
        const current = dictation()
        if ((current.type !== "recording" && current.type !== "stopping") || current.id !== id) return
        session.queue = session.queue
          .then(() => {
            const current = dictation()
            if ((current.type !== "recording" && current.type !== "stopping") || current.id !== id) return ""
            return props.voice.transcribe(
              wav,
              platform.platform === "desktop" && platform.os === "windows" ? props.windows.settings.recognizer : undefined,
            )
          })
          .then((text) => {
            const current = dictation()
            if ((current.type !== "recording" && current.type !== "stopping") || current.id !== id || !text) return
            session.parts.push(text)
            announce(language.t("voice.local.dictate.heard", { text }))
          })
          .catch((error: unknown) => {
            const current = dictation()
            if ((current.type !== "recording" && current.type !== "stopping") || current.id !== id) return
            session.failed = true
            announce(language.t("voice.local.error", { error: String(error) }), "assertive")
          })
      }, 800, platform.platform === "desktop" && platform.os === "windows" ? props.windows.settings.microphone : undefined)
      const next = dictation()
      if (next.type !== "starting" || next.id !== id) {
        recorder.stop()
        return
      }
      dispatch({ type: "started", id, recorder })
    } catch (error) {
      const current = dictation()
      if (current.type !== "starting" || current.id !== id) return
      dispatch({ type: "failed", id })
      throw error
    }
    announce(language.t("voice.local.dictate.started"))
  }

  const stop = async () => {
    const current = dictation()
    if (current.type !== "recording") return
    dispatch({ type: "stop" })
    try {
      current.recorder.stop()
      await session.queue
      const next = dictation()
      if (next.type !== "stopping" || next.id !== current.id) return
      const text = session.parts.join(" ")
      dispatch({ type: "finished", id: current.id })

      if (!text && session.failed) return
      if (!text) return announce(language.t("voice.local.dictate.nothing"))
      insert(button, text)
      announce(language.t("voice.local.dictate.stopped"))
    } catch (error) {
      dispatch({ type: "failed", id: current.id })
      throw error
    }
  }

  onCleanup(() => {
    const current = dictation()
    dispatch({ type: "dispose" })
    if (current.type === "recording") current.recorder.stop()
  })

  return (
    <Button
      ref={button}
      type="button"
      size="small"
      variant="ghost"
      class="me-1"
      data-action="composer-dictate"
      title={language.t("voice.local.dictate.hint")}
      disabled={voiceMode.engaged() || dictation().type === "starting" || dictation().type === "stopping"}
      onClick={() =>
        void (dictation().type === "recording"
          ? stop()
          : platform.platform === "desktop" && platform.os === "windows"
            ? start()
            : setup(start)).catch((error: unknown) =>
          announce(language.t("voice.local.failed", { error: String(error) }), "assertive"),
        )
      }
    >
      {dictation().type === "recording" ? language.t("voice.local.dictate.stop") : language.t("voice.local.dictate")}
    </Button>
  )
}

/** Starts and ends Voice Mode (see mode.ts) and gives it this composer while mounted. */
function VoiceModeButton(props: {
  voice: LocalVoice
  controller: ComposerModel
  windows: ReturnType<typeof useWindowsVoiceSettings>
  dictation: Accessor<DictationState>
}) {
  const platform = usePlatform()
  const language = useLanguage()
  const command = useCommand()
  const setup = useSetup(props.voice, props.windows)
  const local = useLocalVoiceSettings()
  let button!: HTMLButtonElement

  const toggle = () => {
    if (props.dictation().type !== "idle") return
    return voiceMode.engaged()
      ? voiceMode.end()
      : setup(() => {
          if (props.dictation().type !== "idle") return
          return voiceMode.start({
            voice: props.voice,
            platform,
            language,
            settings: () =>
              platform.platform === "desktop" && platform.os === "windows" ? props.windows.settings : local.settings,
          })
        })
  }

  const runToggle = async () => {
    try {
      await toggle()
    } catch (error) {
      announce(language.t("voice.local.failed", { error: String(error) }), "assertive")
    }
  }

  command.register("voice-mode", () => [
    {
      id: "voice.mode.toggle",
      title: voiceMode.engaged() ? language.t("voice.local.mode.stop") : language.t("voice.local.mode"),
      category: language.t("command.category.session"),
      keybind: "mod+alt+v",
      disabled: props.dictation().type !== "idle",
      onSelect: () => void runToggle(),
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
      disabled={props.dictation().type !== "idle"}
      onClick={() => void runToggle()}
    >
      {voiceMode.engaged() ? language.t("voice.local.mode.stop") : language.t("voice.local.mode")}
    </Button>
  )
}

/** Runs `then` once the voice model is installed, showing the first-run setup screen when it is not. */
function useSetup(voice: LocalVoice, windows: ReturnType<typeof useWindowsVoiceSettings>) {
  const dialog = useDialog()
  const platform = usePlatform()
  const local = useLocalVoiceSettings()
  const language = useLanguage()

  return async (then: () => Promise<void> | void) => {
    const ready = async () => {
      try {
        await then()
      } catch (error) {
        announce(language.t("voice.local.failed", { error: String(error) }), "assertive")
      }
    }
    if (platform.platform === "desktop" && platform.os === "windows") {
      if (windows.settings.voice) return then()
      dialog.show(() => (
        <DialogWindowsVoiceSettings
          voice={voice}
          local={windows}
          onReady={() => void ready()}
        />
      ))
      return
    }
    const status = await voice.status()

    if (status.installed) return then()
    dialog.show(() => (
      <DialogVoiceSetup
        voice={voice}
        current={local.settings.voice}
        onVoice={(name) => local.setSettings("voice", name)}
        onReady={() => void ready()}
      />
    ))
  }
}

function WindowsVoiceSettingsButton(props: { voice: LocalVoice; windows: ReturnType<typeof useWindowsVoiceSettings> }) {
  const dialog = useDialog()
  const language = useLanguage()

  return (
    <Button
      type="button"
      size="small"
      variant="ghost"
      onClick={() => dialog.show(() => <DialogWindowsVoiceSettings voice={props.voice} local={props.windows} />)}
    >
      {language.t("voice.windows.settings.open")}
    </Button>
  )
}
