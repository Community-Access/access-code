import { For, Show, type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"

/**
 * One extension, laid out the same in every tab of the Add dialog and every list on the Extensions page: its name as a
 * heading, so heading navigation moves between items, then its description, where it comes from and where it runs,
 * then its actions, each named with the item's name.
 */
export function ResultRow(props: {
  name: string
  /** Shown under the name, such as the registry name or package when the title differs. */
  detail?: string
  description?: string
  lines?: (string | undefined)[]
  lead?: JSX.Element
  actions?: JSX.Element
  /** A list renders `li`; the Extensions page lists render `div` rows. */
  as?: "li" | "div"
  class?: string
}) {
  return (
    <Dynamic
      component={props.as ?? "li"}
      class={`flex items-start gap-3 border-b border-v2-border-border-weak py-3 last:border-b-0 ${props.class ?? ""}`}
    >
      <Show when={props.lead}>{props.lead}</Show>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h3 class="text-13-medium text-v2-text-text-base [overflow-wrap:anywhere]">{props.name}</h3>
        <Show when={props.detail}>
          {(detail) => <span class="text-12-regular text-v2-text-text-muted [overflow-wrap:anywhere]">{detail()}</span>}
        </Show>
        <Show when={props.description}>
          {(description) => (
            <span class="text-13-regular text-v2-text-text-muted [overflow-wrap:anywhere]">{description()}</span>
          )}
        </Show>
        <For each={(props.lines ?? []).filter((line): line is string => !!line)}>
          {(line) => <span class="text-12-regular text-v2-text-text-muted [overflow-wrap:anywhere]">{line}</span>}
        </For>
      </div>
      <Show when={props.actions}>
        <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">{props.actions}</div>
      </Show>
    </Dynamic>
  )
}
