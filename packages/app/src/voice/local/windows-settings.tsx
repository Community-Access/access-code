import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { uuid } from "@opencode/util/uuid"
import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { LocalVoice } from "@/runtime/platform/platform"
import { usePlatform } from "@/runtime/platform/platform"
import { useLanguage } from "@/runtime/i18n/language"
import { useWindowsVoiceSettings } from "./settings"

type Preview =
  | { type: "idle" }
  | { type: "generating"; id: string }
  | { type: "ready"; url: string }
  | { type: "error"; error: string }

type MicrophoneTest =
  | { type: "idle" }
  | { type: "starting"; id: string }
  | { type: "recording"; id: string; recorder: MediaRecorder; stream: MediaStream }
  | { type: "stopping"; id: string; recorder: MediaRecorder; stream: MediaStream }
  | { type: "ready"; url: string }
  | { type: "error"; error: string }

export function DialogWindowsVoiceSettings(props: {
  voice: LocalVoice
  local: ReturnType<typeof useWindowsVoiceSettings>
  onReady?: () => void
}) {
  const platform = usePlatform()
  const language = useLanguage()
  const dialog = useDialog()
  const local = props.local
  const [voices, setVoices] = createSignal<Array<{ id: string; name: string }>>([])
  const [devices, setDevices] = createSignal<MediaDeviceInfo[]>([])
  const [error, setError] = createSignal("")
  const [preview, setPreview] = createSignal<Preview>({ type: "idle" })
  const [microphoneTest, setMicrophoneTest] = createSignal<MicrophoneTest>({ type: "idle" })
  let previewPlayer: HTMLAudioElement | undefined
  const readyPreview = () => {
    const state = preview()
    return state.type === "ready" ? state : undefined
  }
  const previewError = () => {
    const state = preview()
    return state.type === "error" ? state.error : undefined
  }
  const readyMicrophone = () => {
    const state = microphoneTest()
    return state.type === "ready" ? state : undefined
  }
  const microphoneError = () => {
    const state = microphoneTest()
    return state.type === "error" ? state.error : undefined
  }

  const resetPreview = () => {
    const current = preview()
    setPreview({ type: "idle" })
    if (current.type === "generating")
      void props.voice.cancel(current.id).catch((reason: unknown) => setError(String(reason)))
    if (current.type === "ready") {
      previewPlayer?.pause()
      previewPlayer = undefined
      URL.revokeObjectURL(current.url)
    }
  }

  const resetMicrophone = () => {
    const current = microphoneTest()
    setMicrophoneTest({ type: "idle" })
    if (current.type === "recording" || current.type === "stopping") {
      if (current.recorder.state !== "inactive") current.recorder.stop()
      current.stream.getTracks().forEach((track) => track.stop())
    }
    if (current.type === "ready") URL.revokeObjectURL(current.url)
  }

  const refreshDevices = async () => {
    const inputs = await navigator.mediaDevices.enumerateDevices()
    setDevices(inputs.filter((device) => device.kind === "audioinput"))
  }

  const allowDevices = async () => {
    try {
      if (!((await platform.requestMicrophone?.()) ?? true)) throw new Error(language.t("voice.windows.microphone.denied"))
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      await refreshDevices()
      setError("")
    } catch (reason) {
      setError(String(reason))
    }
  }

  const previewVoice = async () => {
    resetPreview()
    const id = uuid()
    setPreview({ type: "generating", id })
    try {
      const wav = await props.voice.speak(id, language.t("voice.windows.preview.sample"), local.settings.voice)
      const current = preview()
      if (current.type !== "generating" || current.id !== id) return
      if (!wav) return setPreview({ type: "error", error: language.t("voice.windows.preview.cancelled") })
      setPreview({ type: "ready", url: URL.createObjectURL(new Blob([wav], { type: "audio/wav" })) })
    } catch (reason) {
      const current = preview()
      if (current.type === "generating" && current.id === id) setPreview({ type: "error", error: String(reason) })
    }
  }

  const startMicrophone = async () => {
    resetMicrophone()
    const id = uuid()
    setMicrophoneTest({ type: "starting", id })
    let stream: MediaStream | undefined
    try {
      if (!((await platform.requestMicrophone?.()) ?? true)) throw new Error(language.t("voice.windows.microphone.denied"))
      stream = await navigator.mediaDevices.getUserMedia({
        audio: local.settings.microphone ? { deviceId: { exact: local.settings.microphone } } : true,
      })
      const current = microphoneTest()
      if (current.type !== "starting" || current.id !== id) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const recorder = new MediaRecorder(stream)
      const recording = stream
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      recorder.onstop = () => {
        recording.getTracks().forEach((track) => track.stop())
        const state = microphoneTest()
        if ((state.type !== "recording" && state.type !== "stopping") || state.id !== id) return
        if (!chunks.length) return setMicrophoneTest({ type: "error", error: language.t("voice.windows.microphone.empty") })
        setMicrophoneTest({ type: "ready", url: URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType })) })
      }
      recorder.onerror = () => {
        recording.getTracks().forEach((track) => track.stop())
        const state = microphoneTest()
        if ((state.type === "recording" || state.type === "stopping") && state.id === id)
          setMicrophoneTest({ type: "error", error: language.t("voice.windows.microphone.failed") })
      }
      setMicrophoneTest({ type: "recording", id, recorder, stream })
      recorder.start()
      void refreshDevices().catch((reason: unknown) => setError(String(reason)))
    } catch (reason) {
      stream?.getTracks().forEach((track) => track.stop())
      const current = microphoneTest()
      if ((current.type === "starting" || current.type === "recording") && current.id === id)
        setMicrophoneTest({ type: "error", error: String(reason) })
    }
  }

  onMount(() => {
    void props.voice.voices().then(setVoices).catch((reason: unknown) => setError(String(reason)))
    void refreshDevices().catch((reason: unknown) => setError(String(reason)))
  })

  onCleanup(() => {
    resetPreview()
    resetMicrophone()
  })

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitle>{language.t("voice.windows.settings.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div class="flex flex-col gap-4 text-14-regular">
          <p>{language.t("voice.windows.settings.about")}</p>
          <label class="flex flex-col gap-1">
            {language.t("voice.windows.voice")}
            <select
              value={local.settings.voice}
              onChange={(event) => {
                resetPreview()
                local.setSettings("voice", event.currentTarget.value)
              }}
            >
              <option value="">{language.t("voice.windows.voice.choose")}</option>
              <Show when={local.settings.voice && !voices().some((voice) => voice.id === local.settings.voice)}>
                <option value={local.settings.voice}>{language.t("voice.windows.voice.unavailable")}</option>
              </Show>
              <For each={voices()}>{(voice) => <option value={voice.id}>{voice.name}</option>}</For>
            </select>
          </label>
          <Button
            disabled={!voices().some((voice) => voice.id === local.settings.voice) || preview().type === "generating"}
            onClick={() => void previewVoice()}
          >
            {language.t("voice.windows.preview")}
          </Button>
          <Show when={preview().type === "generating"}>
            <p role="status">{language.t("voice.windows.preview.generating")}</p>
          </Show>
          <Show when={readyPreview()} keyed>
            {(current) => (
              <audio
                ref={(element) => {
                  previewPlayer = element
                  element.volume = local.settings.volume
                  element.playbackRate = local.settings.speed
                }}
                controls
                src={current.url}
                aria-label={language.t("voice.windows.preview.audio")}
              />
            )}
          </Show>
          <Show when={previewError()}>
            {(message) => <p role="alert">{message()}</p>}
          </Show>
          <label class="flex flex-col gap-1">
            {language.t("voice.windows.microphone")}
            <select
              value={local.settings.microphone}
              disabled={microphoneTest().type === "recording" || microphoneTest().type === "starting" || microphoneTest().type === "stopping"}
              onChange={(event) => local.setSettings("microphone", event.currentTarget.value)}
            >
              <option value="">{language.t("voice.windows.microphone.default")}</option>
              <Show when={local.settings.microphone && !devices().some((device) => device.deviceId === local.settings.microphone)}>
                <option value={local.settings.microphone}>{language.t("voice.windows.microphone.unavailable")}</option>
              </Show>
              <For each={devices()}>
                {(device, index) => (
                  <option value={device.deviceId}>
                    {device.label || language.t("voice.windows.microphone.number", { number: index() + 1 })}
                  </option>
                )}
              </For>
            </select>
          </label>
          <div class="flex flex-wrap gap-2">
            <Button
              disabled={microphoneTest().type === "recording" || microphoneTest().type === "starting" || microphoneTest().type === "stopping"}
              onClick={() => void allowDevices()}
            >
              {language.t("voice.windows.microphone.refresh")}
            </Button>
            <Button
              disabled={microphoneTest().type === "starting" || microphoneTest().type === "stopping"}
              onClick={() => {
                const current = microphoneTest()
                if (current.type === "recording") {
                  setMicrophoneTest({ ...current, type: "stopping" })
                  return current.recorder.stop()
                }
                void startMicrophone()
              }}
            >
              {microphoneTest().type === "recording"
                ? language.t("voice.windows.microphone.stop")
                : language.t("voice.windows.microphone.test")}
            </Button>
          </div>
          <Show when={microphoneTest().type === "recording"}>
            <p role="status">{language.t("voice.windows.microphone.recording")}</p>
          </Show>
          <Show when={readyMicrophone()} keyed>
            {(current) => <audio controls src={current.url} aria-label={language.t("voice.windows.microphone.audio")} />}
          </Show>
          <Show when={microphoneError()}>
            {(message) => <p role="alert">{message()}</p>}
          </Show>
          <label class="flex flex-col gap-1">
            {language.t("voice.windows.volume", { percent: Math.round(local.settings.volume * 100) })}
            <input type="range" min="0" max="1" step="0.05" value={local.settings.volume}
              onInput={(event) => {
                const volume = Number(event.currentTarget.value)
                local.setSettings("volume", volume)
                if (previewPlayer) previewPlayer.volume = volume
              }} />
          </label>
          <label class="flex flex-col gap-1">
            {language.t("voice.windows.speed", { speed: local.settings.speed })}
            <input type="range" min="0.5" max="2" step="0.1" value={local.settings.speed}
              onInput={(event) => {
                const speed = Number(event.currentTarget.value)
                local.setSettings("speed", speed)
                if (previewPlayer) previewPlayer.playbackRate = speed
              }} />
          </label>
          <fieldset class="flex flex-col gap-1">
            <legend>{language.t("voice.windows.interruption")}</legend>
            <label>
              <input type="radio" name="voice-interruption" checked={local.settings.interruption === "steer"}
                onChange={() => local.setSettings("interruption", "steer")} />
              {language.t("voice.windows.interruption.steer")}
            </label>
            <label>
              <input type="radio" name="voice-interruption" checked={local.settings.interruption === "cancel"}
                onChange={() => local.setSettings("interruption", "cancel")} />
              {language.t("voice.windows.interruption.cancel")}
            </label>
          </fieldset>
          <Show when={error()}>{(message) => <p role="alert">{message()}</p>}</Show>
          <div class="flex justify-end gap-2">
            <Button onClick={() => dialog.close()}>{language.t("voice.windows.settings.close")}</Button>
            <Show when={props.onReady}>
              <Button
                disabled={!voices().some((voice) => voice.id === local.settings.voice)}
                onClick={() => {
                  dialog.close()
                  props.onReady?.()
                }}
              >
                {language.t("voice.local.setup.continue")}
              </Button>
            </Show>
          </div>
        </div>
      </DialogBody>
    </Dialog>
  )
}
