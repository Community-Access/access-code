import { Button } from "@opencode/ui/button"
import { Show, type JSX } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { SaveError } from "./save-error"

/**
 * The one layout for confirming an install or a removal: what will happen, the details it depends on, the last error,
 * then Cancel and the action. The heading that names the item is the caller's, so it can be a step or a dialog title.
 */
export function ConfirmStep(props: {
  body: string
  details?: JSX.Element
  error?: string
  busy: boolean
  action: string
  busyAction: string
  /** The action's accessible name, such as "Remove opencode-pty". */
  actionLabel: string
  destructive?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const language = useLanguage()

  return (
    <div class="flex flex-col gap-4">
      <p class="text-13-regular text-v2-text-text-base [overflow-wrap:anywhere]">{props.body}</p>
      <Show when={props.details}>
        <div class="flex flex-col gap-1 text-13-regular text-v2-text-text-muted [overflow-wrap:anywhere]">
          {props.details}
        </div>
      </Show>
      <SaveError error={props.error} />
      <div class="flex justify-end gap-2">
        <Button variant="ghost" disabled={props.busy} onClick={() => props.onCancel()}>
          {language.t("settings.extensions.add.cancel")}
        </Button>
        <Button
          variant={props.destructive ? "danger" : "submit"}
          disabled={props.busy}
          aria-busy={props.busy}
          aria-label={props.busy ? undefined : props.actionLabel}
          onClick={() => props.onConfirm()}
        >
          {props.busy ? props.busyAction : props.action}
        </Button>
      </div>
    </div>
  )
}
