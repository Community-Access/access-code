import { createContext, onMount, useContext } from "solid-js"

// Lets a surrounding layout, such as a settings row, name the form control inside it
// with its own visible title and description, so screen readers announce them.
export type ControlLabel = {
  labelledBy?: string
  describedBy?: string
  // A control that takes its name from the layout calls this, so the layout can hide its visible copy from screen
  // readers and the title and description are not read twice: once as text and again on the control.
  claim?: () => void
}

export const ControlLabelContext = createContext<ControlLabel>({})

export function useControlLabel() {
  return useContext(ControlLabelContext)
}

/** Names the control from the surrounding layout when the caller gave it no name of its own. */
export function useClaimedControlLabel(named: () => boolean) {
  const row = useContext(ControlLabelContext)

  onMount(() => {
    if (!named() && row.labelledBy) row.claim?.()
  })

  return row
}
