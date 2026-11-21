import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { LocalVoice, LocalVoiceStatus } from "@/runtime/platform/platform"
import { useLanguage } from "@/runtime/i18n/language"
import { announce } from "@/session/announce"
import { voices, type VoiceName } from "./settings"

/**
 * First-run setup for dictation and voice mode, modeled on Perspective Chat's VoiceModeSetupView: it explains the
 * on-device model, lets the user pick a voice, and downloads the model. `onReady` runs once the model is installed.
 */
export function DialogVoiceSetup(props: {
  voice: LocalVoice
  current: VoiceName
  onVoice: (voice: VoiceName) => void
  onReady: () => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const [status, setStatus] = createSignal<LocalVoiceStatus>()
  const announced = { percent: 0 }

  const refresh = () =>
    props.voice.status().then((next) => {
      const previous = status()
      setStatus(next)
      const percent = next.download ? Math.floor((next.download.received / next.download.total) * 100) : 0

      // Spoken every 25 percent, like Perspective Chat, so VoiceOver is not flooded.
      if (next.download && percent >= announced.percent + 25) {
        announced.percent = percent - (percent % 25)
        announce(language.t("voice.local.setup.percent", { percent: announced.percent }))
      }

      if (previous?.download && !next.download && next.installed) announce(language.t("voice.local.setup.done"))

      if (previous?.download && !next.download && next.error)
        announce(language.t("voice.local.setup.failed", { error: next.error }), "assertive")
    })

  onMount(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 500)
    onCleanup(() => clearInterval(timer))
  })

  const percent = () => {
    const download = status()?.download

    return download ? Math.floor((download.received / download.total) * 100) : 0
  }

  const action = () => {
    if (status()?.download) return

    if (status()?.installed) {
      dialog.close()
      props.onReady()

      return
    }

    announced.percent = 0
    void props.voice.download().then(refresh)
  }

  return (
    <Dialog fit preventBackdropDismiss={!!status()?.download}>
      <DialogHeader>
        <DialogTitle>{language.t("voice.local.setup.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div class="flex flex-col gap-4 text-14-regular">
          <h3 class="text-14-medium">{language.t("voice.local.setup.welcome")}</h3>
          <p>{language.t("voice.local.setup.about")}</p>
          <fieldset class="flex flex-col gap-2" disabled={!!status()?.download}>
            <legend class="mb-1 text-14-medium">{language.t("voice.local.setup.voice")}</legend>
            <For each={voices}>
              {(voice) => (
                <label class="flex items-center gap-2">
                  <input
                    type="radio"
                    name="accesscode-voice"
                    value={voice.id}
                    checked={props.current === voice.id}
                    onChange={() => props.onVoice(voice.id)}
                  />
                  {language.t(voice.label)}
                </label>
              )}
            </For>
          </fieldset>
          <section class="flex flex-col gap-1">
            <h3 class="text-14-medium">{language.t("voice.local.setup.model")}</h3>
            <p>
              {status()?.installed ? language.t("voice.local.setup.installed") : language.t("voice.local.setup.size")}
            </p>
            <Show when={status()?.download}>
              <progress
                class="w-full"
                max={100}
                value={percent()}
                aria-label={language.t("voice.local.setup.progress")}
                aria-valuetext={`${percent()} percent`}
              />
            </Show>
            <Show when={status()?.error}>
              {(error) => <p role="alert">{language.t("voice.local.setup.failed", { error: error() })}</p>}
            </Show>
          </section>
          <p class="text-v2-text-text-faint">{language.t("voice.local.setup.footer")}</p>
          <div class="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                void props.voice.cancelDownload()
                dialog.close()
              }}
            >
              {language.t("voice.local.setup.cancel")}
            </Button>
            <Button
              variant="submit"
              disabled={!status()}
              // Stays focusable while downloading so VoiceOver focus is not lost when the download starts.
              aria-disabled={status()?.download ? "true" : undefined}
              onClick={action}
            >
              {status()?.installed
                ? language.t("voice.local.setup.continue")
                : status()?.error
                  ? language.t("voice.local.setup.retry")
                  : language.t("voice.local.setup.download")}
            </Button>
          </div>
        </div>
      </DialogBody>
    </Dialog>
  )
}
