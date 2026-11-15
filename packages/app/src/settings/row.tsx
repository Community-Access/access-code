import { createUniqueId, type Component, type JSX } from "solid-js"
import { ControlLabelContext } from "@opencode/ui/control-label"
import "@/settings/settings.css"

export interface SettingsRowProps {
  title: string | JSX.Element
  description: string | JSX.Element
  children: JSX.Element
  align?: "start"
}

export const SettingsRow: Component<SettingsRowProps> = (props) => {
  const id = createUniqueId()
  const titleId = `settings-row-title-${id}`
  const descriptionId = `settings-row-description-${id}`

  // Switches, pop-up buttons and segmented controls in the row take their name from
  // the row title and their description from the row description.
  return (
    <div data-component="settings-row" data-align={props.align}>
      <div data-slot="settings-row-copy">
        <div data-slot="settings-row-title" id={titleId}>
          {props.title}
        </div>
        <div data-slot="settings-row-description" id={descriptionId}>
          {props.description}
        </div>
      </div>
      <div data-slot="settings-row-control">
        <ControlLabelContext.Provider
          value={{
            labelledBy: titleId,
            get describedBy() {
              return props.description ? descriptionId : undefined
            },
          }}
        >
          {props.children}
        </ControlLabelContext.Provider>
      </div>
    </div>
  )
}
