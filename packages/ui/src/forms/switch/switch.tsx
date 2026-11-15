import { Control, Description, ErrorMessage, Input, Label, Root, Thumb } from "@kobalte/core/switch"
import { Show, splitProps } from "solid-js"
import type { ComponentProps, ParentProps } from "solid-js"
import { useClaimedControlLabel } from "../../components/control-label"
import "./switch.css"

export interface SwitchProps extends ParentProps<ComponentProps<typeof Root>> {
  // I think we should consolidate - ask designers.
  appearance?: "standard" | "compact"
  hideLabel?: boolean
  description?: string
}

export function Switch(props: SwitchProps) {
  const [local, others] = splitProps(props, ["children", "class", "appearance", "hideLabel", "description"])
  // Inside a settings row the row title names the switch, even when the switch shows its own label text.
  const row = useClaimedControlLabel(() => !!others["aria-label"])
  const rowNamed = () => !!row.labelledBy && !others["aria-label"]

  return (
    <Root
      {...others}
      class={local.class}
      data-component="switch"
      data-appearance={local.appearance ?? "compact"}
      // Kobalte makes the root an unnamed group around the one switch, which VoiceOver reads as an extra stop.
      role="presentation"
    >
      <Input
        data-slot="switch-input"
        aria-labelledby={rowNamed() || !local.children ? row.labelledBy : undefined}
        aria-describedby={local.description ? undefined : row.describedBy}
      />
      <Show when={local.children}>
        {(label) => (
          <Show
            when={!rowNamed()}
            // Kobalte adds its Label to the switch name, so inside a named row the text is plain and hidden from
            // screen readers; otherwise the row title and this text would both be read.
            fallback={
              <span data-slot="switch-label" classList={{ "sr-only": local.hideLabel }} aria-hidden="true">
                {label()}
              </span>
            }
          >
            <Label data-slot="switch-label" classList={{ "sr-only": local.hideLabel }}>
              {label()}
            </Label>
          </Show>
        )}
      </Show>
      <Show when={local.description}>
        <Description data-slot="switch-description">{local.description}</Description>
      </Show>
      <Control data-slot="switch-control">
        <Thumb data-slot="switch-thumb" />
      </Control>
      <ErrorMessage data-slot="switch-error" />
    </Root>
  )
}
