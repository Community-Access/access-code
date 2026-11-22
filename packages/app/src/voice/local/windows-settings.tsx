import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { uuid } from "@opencode/util/uuid"
import { createEffect, createMemo, createSignal, For, Index, onCleanup, onMount, Show } from "solid-js"
import type { LocalVoice } from "@/runtime/platform/platform"
import { usePlatform } from "@/runtime/platform/platform"
import { useLanguage } from "@/runtime/i18n/language"
import { useWindowsVoiceSettings } from "./settings"
import { initial, transition, view, type Event, type Pack } from "./windows-packs-machine"

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
  const [packsState, setPacksState] = createSignal(initial())
  const packsView = createMemo(() => view(packsState()))
  const voices = () => packsView().voices
  const dispatch = (event: Event) => {
    const current = packsState()
    const next = transition(current, event)
    if (next !== current) setPacksState(next)
    return next !== current
  }
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const bounded = <T,>(promise: Promise<T>) => {
    const deadline = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        timers.delete(timer)
        reject(new Error(language.t("voice.windows.packs.timeout")))
      }, 30_000)
      timers.add(timer)
      promise
        .finally(() => {
          clearTimeout(timer)
          timers.delete(timer)
        })
        .catch(() => {})
    })
    return Promise.race([promise, deadline])
  }
  const [devices, setDevices] = createSignal<MediaDeviceInfo[]>([])
  const [error, setError] = createSignal("")
  const [preview, setPreview] = createSignal<Preview>({ type: "idle" })
  const [microphoneTest, setMicrophoneTest] = createSignal<MicrophoneTest>({ type: "idle" })
  let previewPlayer: HTMLAudioElement | undefined
  let voiceSelect: HTMLSelectElement | undefined
  let recognizerSelect: HTMLSelectElement | undefined
  let voicesLoaded = false
  createEffect(() => {
    voices()
    if (voiceSelect) voiceSelect.value = local.settings.voice
  })
  createEffect(() => {
    packsView().packs
    if (recognizerSelect) recognizerSelect.value = local.settings.recognizer
  })
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
      void props.voice.cancel(current.id).catch((reason: unknown) => {
        if (packsView().open) setError(String(reason))
      })
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
    if (packsView().open) setDevices(inputs.filter((device) => device.kind === "audioinput"))
  }

  const allowDevices = async () => {
    try {
      if (!((await platform.requestMicrophone?.()) ?? true))
        throw new Error(language.t("voice.windows.microphone.denied"))
      if (!packsView().open) return
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      await refreshDevices()
      if (packsView().open) setError("")
    } catch (reason) {
      if (packsView().open) setError(String(reason))
    }
  }

  const previewVoice = async () => {
    resetPreview()
    const id = uuid()
    setPreview({ type: "generating", id })
    try {
      const wav = await props.voice.speak(id, language.t("voice.windows.preview.sample"), local.settings.voice)
      const current = preview()
      if (!packsView().open || current.type !== "generating" || current.id !== id) return
      if (!wav) return setPreview({ type: "error", error: language.t("voice.windows.preview.cancelled") })
      setPreview({ type: "ready", url: URL.createObjectURL(new Blob([wav], { type: "audio/wav" })) })
    } catch (reason) {
      const current = preview()
      if (packsView().open && current.type === "generating" && current.id === id)
        setPreview({ type: "error", error: String(reason) })
    }
  }

  const startMicrophone = async () => {
    resetMicrophone()
    const id = uuid()
    setMicrophoneTest({ type: "starting", id })
    let stream: MediaStream | undefined
    try {
      if (!((await platform.requestMicrophone?.()) ?? true))
        throw new Error(language.t("voice.windows.microphone.denied"))
      const starting = microphoneTest()
      if (!packsView().open || starting.type !== "starting" || starting.id !== id) return
      stream = await navigator.mediaDevices.getUserMedia({
        audio: local.settings.microphone ? { deviceId: { exact: local.settings.microphone } } : true,
      })
      const current = microphoneTest()
      if (!packsView().open || current.type !== "starting" || current.id !== id) {
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
        if (!packsView().open || (state.type !== "recording" && state.type !== "stopping") || state.id !== id) return
        if (!chunks.length)
          return setMicrophoneTest({ type: "error", error: language.t("voice.windows.microphone.empty") })
        setMicrophoneTest({ type: "ready", url: URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType })) })
      }
      recorder.onerror = () => {
        recording.getTracks().forEach((track) => track.stop())
        const state = microphoneTest()
        if (packsView().open && (state.type === "recording" || state.type === "stopping") && state.id === id)
          setMicrophoneTest({ type: "error", error: language.t("voice.windows.microphone.failed") })
      }
      setMicrophoneTest({ type: "recording", id, recorder, stream })
      recorder.start()
      void refreshDevices().catch((reason: unknown) => {
        if (packsView().open) setError(String(reason))
      })
    } catch (reason) {
      stream?.getTracks().forEach((track) => track.stop())
      const current = microphoneTest()
      if (packsView().open && (current.type === "starting" || current.type === "recording") && current.id === id)
        setMicrophoneTest({ type: "error", error: String(reason) })
    }
  }

  const refreshPacks = async () => {
    const id = uuid()
    if (!dispatch({ type: "fetch", id })) return
    try {
      const packResult = await bounded(Promise.allSettled([props.voice.packs()])).then((results) => results[0])
      const packs = packResult.status === "fulfilled" ? packResult.value : undefined
      const changed = packs?.some((pack) =>
        packsView().packs.find((previous) => previous.id === pack.id)?.installed !== pack.installed,
      )
      const voiceResult =
        !voicesLoaded || changed
          ? await bounded(Promise.allSettled([props.voice.voices()])).then((results) => results[0])
          : undefined
      const voices = voiceResult?.status === "fulfilled" ? voiceResult.value : undefined
      if (voiceResult) voicesLoaded = voiceResult.status === "fulfilled"
      const completed = packs?.find((pack) =>
        packsView().packs.some((previous) => previous.id === pack.id && previous.download && !pack.download),
      )
      const progress = packs?.find((pack) => {
        if (!pack.download || pack.download.total <= 0) return false
        const previous = packsView().packs.find((item) => item.id === pack.id)?.download
        return (
          Math.floor((pack.download.received / pack.download.total) * 10) >
          (previous && previous.total > 0 ? Math.floor((previous.received / previous.total) * 10) : -1)
        )
      })
      const announcement = completed
        ? language.t(completed.installed ? "voice.windows.packs.completed" : "voice.windows.packs.stopped", {
            name: completed.name,
          })
        : progress?.download
          ? language.t("voice.windows.packs.progressStatus", {
              name: progress.name,
              percent: Math.min(100, Math.floor((progress.download.received / progress.download.total) * 100)),
            })
          : undefined
      const errors = [packResult, voiceResult].flatMap((result) =>
        result?.status === "rejected" ? [String(result.reason)] : [],
      )
      dispatch({ type: "fetched", id, packs, voices, announcement, error: errors.join("\n") })
    } catch (reason) {
      dispatch({ type: "fetchFailed", id, error: String(reason) })
    }
  }

  const operate = async (pack: Pack, action: "install" | "cancel" | "remove") => {
    const id = uuid()
    if (
      !dispatch({
        type: "operate",
        id,
        pack: pack.id,
        action,
        announcement: language.t("voice.windows.packs.working", { name: pack.name }),
      })
    )
      return
    try {
      const work =
        action === "install"
          ? props.voice.installPack(pack.id)
          : action === "cancel"
            ? props.voice.cancelPack(pack.id)
            : props.voice.removePack(pack.id)
      // A late completion may still have changed installed packs after the deadline.
      void work
        .finally(() => {
          if (packsView().open) void refreshPacks()
        })
        .catch(() => {})
      await bounded(work)
      dispatch({ type: "operated", id, announcement: language.t("voice.windows.packs.updated", { name: pack.name }) })
      if (packsView().open) {
        const timer = setTimeout(() => {
          timers.delete(timer)
          dispatch({ type: "operationFailed", id, error: language.t("voice.windows.packs.timeout") })
        }, 30_000)
        timers.add(timer)
      }
    } catch (reason) {
      dispatch({
        type: "operationFailed",
        id,
        error: language.t("voice.windows.packs.actionFailed", { name: pack.name, error: String(reason) }),
      })
    }
    if (packsView().open) void refreshPacks()
  }

  onMount(() => {
    void refreshPacks()
    const poll = setInterval(() => void refreshPacks(), 1000)
    onCleanup(() => clearInterval(poll))
    void refreshDevices().catch((reason: unknown) => {
      if (packsView().open) setError(String(reason))
    })
  })

  onCleanup(() => {
    dispatch({ type: "dispose" })
    timers.forEach(clearTimeout)
    timers.clear()
    const currentPreview = preview()
    if (currentPreview.type === "generating") void props.voice.cancel(currentPreview.id).catch(() => {})
    if (currentPreview.type === "ready") {
      previewPlayer?.pause()
      URL.revokeObjectURL(currentPreview.url)
    }
    const currentMicrophone = microphoneTest()
    if (currentMicrophone.type === "recording" || currentMicrophone.type === "stopping") {
      if (currentMicrophone.recorder.state !== "inactive") currentMicrophone.recorder.stop()
      currentMicrophone.stream.getTracks().forEach((track) => track.stop())
    }
    if (currentMicrophone.type === "ready") URL.revokeObjectURL(currentMicrophone.url)
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
            {language.t("voice.windows.recognizer")}
            <select
              ref={recognizerSelect}
              value={local.settings.recognizer}
              onChange={(event) => local.setSettings("recognizer", event.currentTarget.value)}
            >
              <option value="sapi">{language.t("voice.windows.recognizer.sapi")}</option>
              <Show
                when={
                  local.settings.recognizer !== "sapi" &&
                  !packsView().packs.some(
                    (pack) => pack.kind === "recognition" && pack.installed && pack.id === local.settings.recognizer,
                  )
                }
              >
                <option value={local.settings.recognizer}>
                  {language.t("voice.windows.recognizer.unavailable", { id: local.settings.recognizer })}
                </option>
              </Show>
              <For
                each={packsView().packs.filter(
                  (pack) => pack.kind === "recognition" && pack.installed && pack.id !== "sapi",
                )}
              >
                {(pack) => <option value={pack.id}>{pack.name}</option>}
              </For>
            </select>
          </label>
          <section aria-labelledby="windows-voice-packs-heading" class="flex flex-col gap-3">
            <h2 id="windows-voice-packs-heading" class="font-medium">
              {language.t("voice.windows.packs.title")}
            </h2>
            <p>{language.t("voice.windows.packs.about")}</p>
            <Index each={packsView().packs}>
              {(pack) => {
                const busy = () => packsView().operation
                const canCancel = () => {
                  const operation = busy()
                  return (
                    !!pack().download ||
                    (operation.type === "working" && operation.pack === pack().id && operation.action === "install")
                  )
                }
                const disabled = () => {
                  const operation = busy()
                  return (
                    operation.type === "working" &&
                    !(canCancel() && operation.action === "install" && operation.pack === pack().id)
                  )
                }
                const source = () => {
                  try {
                    const url = new URL(pack().source)
                    return url.protocol === "https:" ? url.href : undefined
                  } catch {
                    return undefined
                  }
                }
                return (
                  <article class="flex flex-col gap-1 rounded border border-border-weak-base p-3">
                    <h3 class="font-medium">{pack().name}</h3>
                    <p>
                      {pack().id === "whisper-tiny-en"
                        ? language.t("voice.windows.packs.whisper.description")
                        : pack().id === "moonshine-tiny-en"
                          ? language.t("voice.windows.packs.moonshine.description")
                          : pack().description}
                    </p>
                    <p>
                      {language.t(
                        pack().installed ? "voice.windows.packs.installed" : "voice.windows.packs.notInstalled",
                      )}
                    </p>
                    <p>
                      {language.t("voice.windows.packs.details", {
                        kind: language.t(
                          pack().kind === "recognition"
                            ? "voice.windows.packs.recognition"
                            : "voice.windows.packs.speech",
                        ),
                        size: (pack().size / 1_000_000).toFixed(1),
                        license: pack().license,
                      })}
                    </p>
                    <Show
                      when={source()}
                      fallback={<p>{language.t("voice.windows.packs.sourceText", { source: pack().source })}</p>}
                    >
                      {(url) => (
                        <a
                          class="text-text-interactive-base underline"
                          href={url()}
                          onClick={(event) => {
                            event.preventDefault()
                            platform.openExternal(url())
                          }}
                        >
                          {language.t("voice.windows.packs.sourceLink", { name: pack().name })}
                        </a>
                      )}
                    </Show>
                    <Show when={pack().download} keyed>
                      {(download) => (
                        <div class="flex flex-col gap-1">
                          <progress
                            max={download.total > 0 ? download.total : undefined}
                            value={download.total > 0 ? Math.min(download.received, download.total) : undefined}
                            aria-label={language.t("voice.windows.packs.progress", { name: pack().name })}
                          />
                          <p>
                            {download.total > 0
                              ? language.t("voice.windows.packs.percent", {
                                  percent: Math.min(100, Math.floor((download.received / download.total) * 100)),
                                })
                              : language.t("voice.windows.packs.downloading")}
                          </p>
                        </div>
                      )}
                    </Show>
                    <Show when={pack().error}>
                      {(message) => (
                        <p role="alert">
                          {language.t("voice.windows.packs.packFailed", { name: pack().name, error: message() })}
                        </p>
                      )}
                    </Show>
                    <div>
                      <Button
                        disabled={disabled()}
                        onClick={() =>
                          void operate(pack(), canCancel() ? "cancel" : pack().installed ? "remove" : "install")
                        }
                      >
                        {canCancel()
                          ? language.t("voice.windows.packs.cancel", { name: pack().name })
                          : pack().installed
                            ? language.t("voice.windows.packs.remove", { name: pack().name })
                            : language.t("voice.windows.packs.install", { name: pack().name })}
                      </Button>
                    </div>
                  </article>
                )
              }}
            </Index>
            <p role="status" aria-live="polite">
              {packsView().announcement}
            </p>
            <Show when={packsView().error}>{(message) => <p role="alert">{message()}</p>}</Show>
          </section>
          <label class="flex flex-col gap-1">
            {language.t("voice.windows.voice")}
            <select
              ref={voiceSelect}
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
          <Show when={previewError()}>{(message) => <p role="alert">{message()}</p>}</Show>
          <label class="flex flex-col gap-1">
            {language.t("voice.windows.microphone")}
            <select
              value={local.settings.microphone}
              disabled={
                microphoneTest().type === "recording" ||
                microphoneTest().type === "starting" ||
                microphoneTest().type === "stopping"
              }
              onChange={(event) => local.setSettings("microphone", event.currentTarget.value)}
            >
              <option value="">{language.t("voice.windows.microphone.default")}</option>
              <Show
                when={
                  local.settings.microphone &&
                  !devices().some((device) => device.deviceId === local.settings.microphone)
                }
              >
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
              disabled={
                microphoneTest().type === "recording" ||
                microphoneTest().type === "starting" ||
                microphoneTest().type === "stopping"
              }
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
            {(current) => (
              <audio controls src={current.url} aria-label={language.t("voice.windows.microphone.audio")} />
            )}
          </Show>
          <Show when={microphoneError()}>{(message) => <p role="alert">{message()}</p>}</Show>
          <label class="flex flex-col gap-1">
            {language.t("voice.windows.volume", { percent: Math.round(local.settings.volume * 100) })}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={local.settings.volume}
              onInput={(event) => {
                const volume = Number(event.currentTarget.value)
                local.setSettings("volume", volume)
                if (previewPlayer) previewPlayer.volume = volume
              }}
            />
          </label>
          <label class="flex flex-col gap-1">
            {language.t("voice.windows.speed", { speed: local.settings.speed })}
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={local.settings.speed}
              onInput={(event) => {
                const speed = Number(event.currentTarget.value)
                local.setSettings("speed", speed)
                if (previewPlayer) previewPlayer.playbackRate = speed
              }}
            />
          </label>
          <fieldset class="flex flex-col gap-1">
            <legend>{language.t("voice.windows.interruption")}</legend>
            <label>
              <input
                type="radio"
                name="voice-interruption"
                checked={local.settings.interruption === "steer"}
                onChange={() => local.setSettings("interruption", "steer")}
              />
              {language.t("voice.windows.interruption.steer")}
            </label>
            <label>
              <input
                type="radio"
                name="voice-interruption"
                checked={local.settings.interruption === "cancel"}
                onChange={() => local.setSettings("interruption", "cancel")}
              />
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
