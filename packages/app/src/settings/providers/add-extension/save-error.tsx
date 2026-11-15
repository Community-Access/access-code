import { Icon } from "@opencode/ui/icon"
import { Show } from "solid-js"

/** The last save's error. The machine announces it, so the text is not a live region too. */
export function SaveError(props: { error?: string }) {
  return (
    <Show when={props.error}>
      {(error) => (
        <p class="flex items-start gap-2 text-13-regular text-v2-text-text-critical-base">
          <Icon name="circle-exclamation" size="small" class="mt-0.5 shrink-0" />
          <span>{error()}</span>
        </p>
      )}
    </Show>
  )
}
