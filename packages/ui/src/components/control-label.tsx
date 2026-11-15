import { createContext, useContext } from "solid-js"

// Lets a surrounding layout, such as a settings row, name the form control inside it
// with its own visible title and description, so screen readers announce them.
export type ControlLabel = {
  labelledBy?: string
  describedBy?: string
}

export const ControlLabelContext = createContext<ControlLabel>({})

export function useControlLabel() {
  return useContext(ControlLabelContext)
}
