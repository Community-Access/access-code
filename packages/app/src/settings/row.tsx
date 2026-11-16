import { createSignal, createUniqueId, Show, type Component, type JSX } from "solid-js"
import { ControlLabelContext } from "@opencode/ui/control-label"
import "@/settings/settings.css"

export interface SettingsRowProps {
  title: string | JSX.Element
  description: string | JSX.Element
  children: JSX.Element
  align?: "start"
  /** Settings search reveals the row whose `data-action` is the entry it picked. */
  action?: string
}

export const SettingsRow: Component<SettingsRowProps> = (props) => {
  const id = createUniqueId()
  const titleId = `settings-row-title-${id}`
  const descriptionId = `settings-row-description-${id}`
  const [claimed, setClaimed] = createSignal(false)

  // Switches, pop-up buttons and segmented controls in the row take their name from the row title and their
  // description from the row description. Once a control does, the visible copy is hidden from screen readers so
  // VoiceOver reads each setting once, on its control. Rows whose control has its own name keep the copy readable.
  // A description with a link or button in it stays readable, so that control is never hidden while still focusable.
  let description: HTMLDivElement | undefined
  const interactive = () => !!description?.querySelector("a[href], button, input, select, textarea, [tabindex]")
  const hidden = (part: "title" | "description") =>
    claimed() && (part === "title" || !interactive()) ? "true" : undefined

  return (
    <div data-component="settings-row" data-align={props.align} data-action={props.action}>
      <div data-slot="settings-row-copy">
        <div data-slot="settings-row-title" id={titleId} aria-hidden={hidden("title")}>
          {props.title}
        </div>
        <Show when={props.description}>
          <div
            ref={description}
            data-slot="settings-row-description"
            id={descriptionId}
            aria-hidden={hidden("description")}
          >
            {props.description}
          </div>
        </Show>
      </div>
      <div data-slot="settings-row-control">
        <ControlLabelContext.Provider
          value={{
            labelledBy: titleId,
            get describedBy() {
              return props.description ? descriptionId : undefined
            },
            claim: () => setClaimed(true),
          }}
        >
          {props.children}
        </ControlLabelContext.Provider>
      </div>
    </div>
  )
}
