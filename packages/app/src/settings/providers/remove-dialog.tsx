import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { createSignal, onCleanup, untrack } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { formatServerError } from "@/runtime/server/errors"
import { announce } from "@/session/announce"
import { ConfirmStep } from "./add-extension/confirm-step"
import { createRemoveState, removeView, transitionRemove, type RemoveEffect, type RemoveEvent } from "./remove-machine"

/**
 * Confirms removing one installed extension, in the same layout as confirming an install. After a removal the dialog
 * does not return focus to the Remove button, which goes away with the row; `onRemoved` moves it instead.
 */
export function DialogRemoveExtension(props: {
  name: string
  /** Replaces the usual explanation, for example when other apps share what is removed. */
  body?: string
  remove: () => Promise<void>
  onRemoved: () => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const [state, setState] = createSignal(createRemoveState())
  const live = { disposed: false }

  onCleanup(() => (live.disposed = true))

  const dispatch = (event: RemoveEvent) => {
    const previous = untrack(state)
    const result = transitionRemove(previous, event)

    if (result.state !== previous) setState(result.state)
    result.effects.forEach(run)
  }

  const run = (effect: RemoveEffect) => {
    if (effect.type === "failed") return announce(effect.error, "assertive")

    if (effect.type === "removed") {
      announce(language.t("settings.extensions.remove.done", { name: props.name }))
      dialog.close()

      return
    }

    const attempt = effect.attempt
    void props.remove().then(
      () => {
        if (live.disposed) return announce(language.t("settings.extensions.remove.done", { name: props.name }))
        dispatch({ type: "succeeded", attempt })
      },
      (error: unknown) => {
        if (live.disposed) return
        const reason =
          error instanceof RemoveFailed
            ? error.message
            : formatServerError(error, language.t, language.t("settings.extensions.add.failedUnknown"))
        dispatch({
          type: "failed",
          attempt,
          error: language.t("settings.extensions.remove.failed", { name: props.name, error: reason }),
        })
      },
    )
  }

  const view = () => removeView(state())

  return (
    <Dialog
      fit
      preventBackdropDismiss={view().busy}
      onCloseAutoFocus={(event) => {
        if (untrack(state).status !== "removed") return
        event.preventDefault()
        props.onRemoved()
      }}
    >
      <DialogHeader>
        <DialogTitle>{language.t("settings.extensions.remove.title", { name: props.name })}</DialogTitle>
      </DialogHeader>
      <DialogBody class="px-5 pb-5">
        <ConfirmStep
          body={props.body ?? language.t("settings.extensions.remove.body")}
          error={view().error}
          busy={view().busy}
          destructive
          action={language.t("settings.extensions.remove")}
          busyAction={language.t("settings.extensions.remove.removing")}
          actionLabel={language.t("settings.extensions.remove.label", { name: props.name })}
          onCancel={() => dialog.close()}
          onConfirm={() => dispatch({ type: "confirmed" })}
        />
      </DialogBody>
    </Dialog>
  )
}

/** A removal that failed with a message to show as is, such as the skills CLI's output. */
export class RemoveFailed extends Error {}
