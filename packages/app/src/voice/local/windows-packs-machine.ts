export type Pack = {
  id: string
  name: string
  kind: "recognition" | "speech"
  description: string
  license: string
  source: string
  size: number
  installed: boolean
  download: { received: number; total: number } | null
  error: string | null
}

type Operation =
  | { type: "idle" }
  | {
      type: "working"
      id: string
      pack: string
      action: "install" | "cancel" | "remove"
      phase: "request" | "confirm"
      ignoreFetch?: string
    }
type Fetch = { type: "idle" } | { type: "loading"; id: string }

export type State =
  | { type: "disposed" }
  | {
      type: "open"
      packs: Pack[]
      voices: Array<{ id: string; name: string }>
      fetch: Fetch
      operation: Operation
      error: string
      fetchError: string
      announcement: string
    }

export type Event =
  | { type: "dispose" }
  | { type: "fetch"; id: string }
  | {
      type: "fetched"
      id: string
      packs?: Pack[]
      voices?: Array<{ id: string; name: string }>
      error?: string
      announcement?: string
    }
  | { type: "fetchFailed"; id: string; error: string }
  | { type: "operate"; id: string; pack: string; action: "install" | "cancel" | "remove"; announcement: string }
  | { type: "operated"; id: string; announcement: string }
  | { type: "operationFailed"; id: string; error: string }

export function initial(): State {
  return {
    type: "open",
    packs: [],
    voices: [],
    fetch: { type: "idle" },
    operation: { type: "idle" },
    error: "",
    fetchError: "",
    announcement: "",
  }
}

export function transition(state: State, event: Event): State {
  if (state.type === "disposed") return state
  if (event.type === "dispose") return { type: "disposed" }
  if (event.type === "fetch") {
    if (state.fetch.type !== "idle") return state
    return { ...state, fetch: { type: "loading", id: event.id } }
  }
  if (event.type === "fetched" || event.type === "fetchFailed") {
    if (state.fetch.type !== "loading" || state.fetch.id !== event.id) return state
    if (event.type === "fetchFailed") return { ...state, fetch: { type: "idle" }, fetchError: event.error }
    const operation = state.operation
    const pack = operation.type === "working" && event.packs?.find((item) => item.id === operation.pack)
    const confirmed =
      operation.type === "working" &&
      operation.phase === "confirm" &&
      operation.ignoreFetch !== event.id &&
      pack &&
      (operation.action === "install"
        ? pack.installed || pack.download || pack.error
        : operation.action === "cancel"
          ? !pack.download
          : !pack.installed)
    return {
      ...state,
      fetch: { type: "idle" },
      packs: event.packs ?? state.packs,
      voices: event.voices ?? state.voices,
      fetchError: event.error ?? "",
      operation: confirmed ? { type: "idle" } : operation,
      announcement: event.announcement ?? state.announcement,
    }
  }
  if (event.type === "operate") {
    if (
      state.operation.type === "working" &&
      !(event.action === "cancel" && state.operation.action === "install" && state.operation.pack === event.pack)
    )
      return state
    return {
      ...state,
      operation: { type: "working", id: event.id, pack: event.pack, action: event.action, phase: "request" },
      error: "",
      announcement: event.announcement,
    }
  }
  if (state.operation.type !== "working" || state.operation.id !== event.id) return state
  if (event.type === "operationFailed")
    return { ...state, operation: { type: "idle" }, error: event.error, announcement: "" }
  return {
    ...state,
    operation: {
      ...state.operation,
      phase: "confirm",
      ignoreFetch: state.fetch.type === "loading" ? state.fetch.id : undefined,
    },
    announcement: event.announcement,
  }
}

export function view(state: State) {
  if (state.type === "disposed")
    return { open: false, packs: [], voices: [], error: "", announcement: "", operation: { type: "idle" } as Operation }
  return {
    open: true,
    packs: state.packs,
    voices: state.voices,
    error: state.error || state.fetchError,
    announcement: state.announcement,
    operation: state.operation,
  }
}
