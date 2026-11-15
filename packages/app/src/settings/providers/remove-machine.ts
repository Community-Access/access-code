/** Removing one extension from the Extensions page: confirm, then remove, then close or show why it failed. */
export type RemoveState =
  | { status: "confirm"; attempt: number }
  | { status: "removing"; attempt: number }
  | { status: "failed"; attempt: number; error: string }
  | { status: "removed"; attempt: number }

export type RemoveEvent =
  | { type: "confirmed" }
  | { type: "succeeded"; attempt: number }
  | { type: "failed"; attempt: number; error: string }

export type RemoveEffect = { type: "remove"; attempt: number } | { type: "removed" } | { type: "failed"; error: string }

export function createRemoveState(): RemoveState {
  return { status: "confirm", attempt: 0 }
}

export function transitionRemove(
  state: RemoveState,
  event: RemoveEvent,
): { state: RemoveState; effects: RemoveEffect[] } {
  const same = { state, effects: [] }

  if (event.type === "confirmed") {
    if (state.status === "removing" || state.status === "removed") return same
    const attempt = state.attempt + 1

    return { state: { status: "removing", attempt }, effects: [{ type: "remove", attempt }] }
  }

  if (state.status !== "removing" || state.attempt !== event.attempt) return same

  if (event.type === "succeeded")
    return { state: { status: "removed", attempt: state.attempt }, effects: [{ type: "removed" }] }

  return {
    state: { status: "failed", attempt: state.attempt, error: event.error },
    effects: [{ type: "failed", error: event.error }],
  }
}

export function removeView(state: RemoveState) {
  return {
    busy: state.status === "removing",
    error: state.status === "failed" ? state.error : undefined,
  }
}
