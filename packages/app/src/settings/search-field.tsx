import { createEffect, on } from "solid-js"
import { createStore } from "solid-js/store"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { Icon } from "@opencode/ui/icon"
import { TextInput } from "@opencode/ui/text-input"
import "@/settings/search.css"

export function SettingsSearchField(props: {
  value: string
  placeholder: string
  active: boolean
  onInput: (value: string) => void
}) {
  const [state, setState] = createStore({ overflow: { start: false, end: false } })
  let input: HTMLInputElement | undefined

  const updateOverflow = () => {
    if (!input) return
    const offset = Math.abs(input.scrollLeft)
    setState("overflow", {
      start: offset > 1,
      end: input.scrollWidth - input.clientWidth - offset > 1,
    })
  }

  const clear = () => {
    props.onInput("")
    input?.focus({ preventScroll: true })
  }

  createEffect(on(() => props.value, updateOverflow))
  // AccessCode: no type-to-search. Letters typed on a switch or tab used to jump focus into this field, which broke
  // keyboard and VoiceOver navigation. The field is still reachable with Tab.

  return (
    <div class="settings-tab-search settings-filter-search" data-component="settings-filter-search">
      <TextInput
        ref={(element) => {
          input = element
          createResizeObserver(element, updateOverflow)
        }}
        type="search"
        appearance="base"
        leadingIcon={<Icon name="magnifying-glass" />}
        value={props.value}
        data-overflow-start={state.overflow.start}
        data-overflow-end={state.overflow.end}
        onScroll={updateOverflow}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return
          event.preventDefault()
          event.stopPropagation()

          if (props.value) {
            clear()

            return
          }

          event.currentTarget.blur()
          event.currentTarget.closest<HTMLElement>(".settings-screen")?.focus({ preventScroll: true })
        }}
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        showClearButton={!!props.value}
        clearIcon="close"
        onClearClick={clear}
        spellcheck={false}
        autocorrect="off"
        autocomplete="off"
        autocapitalize="off"
      />
    </div>
  )
}
