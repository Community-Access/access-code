import type { McpConfig, McpPlan, RegistryServer } from "./mcp-plan"

/** What one save sends to the server: a plugin package, or an MCP server with the keys it keeps in the Keychain. */
export type SaveRequest =
  | { type: "plugin"; label: string; pkg: string }
  | { type: "skill"; label: string; source: string; skill: string }
  | { type: "mcp"; label: string; name: string; config: McpConfig; keychain: Record<string, string> }

export type Save =
  | { status: "idle" }
  | { status: "saving"; attempt: number; label: string }
  | { status: "failed"; error: string }

export type PluginTarget = { name: string; pkg: string; url?: string }

/** A skill from skills.sh: `source` is its GitHub `owner/repo`, `skill` its name there, `url` its skills.sh page. */
export type SkillTarget = { name: string; source: string; skill: string; url: string }

/** What a confirm step installs. */
export type ConfirmTarget = ({ type: "plugin" } & PluginTarget) | ({ type: "skill" } & SkillTarget)

/** Browse shows the tabs; confirm and setup replace them until the person goes back or the save succeeds. */
export type Step =
  | { type: "browse"; save: Save }
  | { type: "confirm"; target: ConfirmTarget; save: Save }
  | { type: "setup"; server: RegistryServer; plan: McpPlan; save: Save }

export type AddState = { step: Step; attempt: number }

export type AddEvent =
  | { type: "plugin.chosen"; plugin: PluginTarget }
  | { type: "skill.chosen"; skill: SkillTarget }
  | { type: "server.chosen"; server: RegistryServer; plan: McpPlan }
  | { type: "back" }
  | { type: "save.requested"; request: SaveRequest }
  | { type: "save.succeeded"; attempt: number }
  | { type: "save.failed"; attempt: number; error: string }

export type AddEffect =
  | { type: "save"; attempt: number; request: SaveRequest }
  | { type: "saved"; label: string }
  | { type: "failed"; error: string }
  | { type: "step.shown"; step: Step["type"] }

const IDLE: Save = { status: "idle" }

export function createAddState(): AddState {
  return { step: { type: "browse", save: IDLE }, attempt: 0 }
}

export function transitionAdd(state: AddState, event: AddEvent): { state: AddState; effects: AddEffect[] } {
  const same = { state, effects: [] }
  const saving = state.step.save.status === "saving"

  if (event.type === "plugin.chosen" || event.type === "skill.chosen") {
    if (saving || state.step.type !== "browse") return same
    const target: ConfirmTarget =
      event.type === "plugin.chosen" ? { type: "plugin", ...event.plugin } : { type: "skill", ...event.skill }

    return {
      state: { ...state, step: { type: "confirm", target, save: IDLE } },
      effects: [{ type: "step.shown", step: "confirm" }],
    }
  }

  if (event.type === "server.chosen") {
    if (saving || state.step.type !== "browse") return same

    return {
      state: { ...state, step: { type: "setup", server: event.server, plan: event.plan, save: IDLE } },
      effects: [{ type: "step.shown", step: "setup" }],
    }
  }

  if (event.type === "back") {
    if (saving || state.step.type === "browse") return same

    return {
      state: { ...state, step: { type: "browse", save: IDLE } },
      effects: [{ type: "step.shown", step: "browse" }],
    }
  }

  if (event.type === "save.requested") {
    if (saving) return same
    const attempt = state.attempt + 1

    return {
      state: { step: { ...state.step, save: { status: "saving", attempt, label: event.request.label } }, attempt },
      effects: [{ type: "save", attempt, request: event.request }],
    }
  }

  const current = state.step.save

  if (current.status !== "saving" || current.attempt !== event.attempt) return same

  if (event.type === "save.succeeded")
    return {
      state: { ...state, step: { type: "browse", save: IDLE } },
      effects: [{ type: "saved", label: current.label }],
    }

  return {
    state: { ...state, step: { ...state.step, save: { status: "failed", error: event.error } } },
    effects: [{ type: "failed", error: event.error }],
  }
}

/** Whether the current step is saving, and the error of its last save. */
export function saveView(step: Step) {
  return {
    busy: step.save.status === "saving",
    error: step.save.status === "failed" ? step.save.error : undefined,
  }
}

/** The registry search: the first page for a query, then more pages appended while a cursor remains. */
export type SearchState =
  | {
      status: "loading"
      query: string
      attempt: number
      page: "first" | "more"
      servers: RegistryServer[]
      cursor?: string
    }
  | { status: "ready"; query: string; attempt: number; servers: RegistryServer[]; cursor?: string }
  | {
      status: "failed"
      query: string
      attempt: number
      page: "first" | "more"
      servers: RegistryServer[]
      cursor?: string
    }

export type SearchEvent =
  | { type: "query.committed"; query: string }
  | { type: "more.requested" }
  | { type: "retry.requested" }
  | { type: "page.loaded"; attempt: number; servers: RegistryServer[]; cursor?: string }
  | { type: "page.failed"; attempt: number }

export type SearchEffect = { type: "fetch"; attempt: number; query: string; cursor?: string }

export function createSearchState(): SearchState {
  return { status: "ready", query: "", attempt: 0, servers: [] }
}

export function transitionSearch(
  state: SearchState,
  event: SearchEvent,
): { state: SearchState; effects: SearchEffect[] } {
  const same = { state, effects: [] }

  if (event.type === "query.committed") {
    const attempt = state.attempt + 1

    return {
      state: { status: "loading", query: event.query, attempt, page: "first", servers: [] },
      effects: [{ type: "fetch", attempt, query: event.query }],
    }
  }

  if (event.type === "more.requested") {
    if (state.status !== "ready" || !state.cursor) return same

    return fetchMore(state, state.cursor)
  }

  if (event.type === "retry.requested") {
    if (state.status !== "failed") return same

    if (state.page === "more" && state.cursor) return fetchMore(state, state.cursor)

    return transitionSearch(state, { type: "query.committed", query: state.query })
  }

  if (state.status !== "loading" || state.attempt !== event.attempt) return same

  if (event.type === "page.failed") return { state: { ...state, status: "failed" }, effects: [] }

  return {
    state: {
      status: "ready",
      query: state.query,
      attempt: state.attempt,
      servers: state.page === "more" ? [...state.servers, ...event.servers] : event.servers,
      cursor: event.cursor,
    },
    effects: [],
  }
}

function fetchMore(state: SearchState, cursor: string): { state: SearchState; effects: SearchEffect[] } {
  const attempt = state.attempt + 1

  return {
    state: { status: "loading", query: state.query, attempt, page: "more", servers: state.servers, cursor },
    effects: [{ type: "fetch", attempt, query: state.query, cursor }],
  }
}
