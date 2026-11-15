import { expect, test } from "bun:test"
import {
  createAddState,
  createSearchState,
  transitionAdd,
  transitionSearch,
  type AddEffect,
  type AddEvent,
  type AddState,
  type SearchEffect,
  type SearchEvent,
  type SearchState,
} from "./machine"

const plugin = { name: "opencode-pty", pkg: "opencode-pty", url: "https://github.com/shekohex/opencode-pty" }

const request = { type: "plugin" as const, label: "opencode-pty", pkg: "opencode-pty" }

function replay(events: AddEvent[], state: AddState = createAddState()) {
  return events.reduce<{ state: AddState; effects: AddEffect[] }>(
    (current, event) => {
      const result = transitionAdd(current.state, event)

      return { state: result.state, effects: [...current.effects, ...result.effects] }
    },
    { state, effects: [] },
  )
}

test("a confirmed install saves once and announces the name on success", () => {
  const result = replay([
    { type: "plugin.chosen", plugin },
    { type: "save.requested", request },
    { type: "save.requested", request },
    { type: "back" },
    { type: "save.succeeded", attempt: 1 },
  ])

  expect(result.effects).toEqual([
    { type: "step.shown", step: "confirm" },
    { type: "save", attempt: 1, request },
    { type: "saved", label: "opencode-pty" },
  ])
  expect(result.state.step.type).toBe("browse")
})

test("a failure stays on the step with the error, and a stale result is ignored", () => {
  const result = replay([
    { type: "plugin.chosen", plugin },
    { type: "save.requested", request },
    { type: "save.failed", attempt: 1, error: "nope" },
    { type: "save.requested", request },
    { type: "save.succeeded", attempt: 1 },
  ])

  expect(result.effects).toContainEqual({ type: "failed", error: "nope" })
  expect(result.state.step).toMatchObject({ type: "confirm", save: { status: "saving", attempt: 2 } })
})

function search(events: SearchEvent[], state: SearchState = createSearchState()) {
  return events.reduce<{ state: SearchState; effects: SearchEffect[] }>(
    (current, event) => {
      const result = transitionSearch(current.state, event)

      return { state: result.state, effects: [...current.effects, ...result.effects] }
    },
    { state, effects: [] },
  )
}

const server = (name: string) => ({ name })

test("a newer query drops the older query's late page, and Load more appends", () => {
  const result = search([
    { type: "query.committed", query: "git" },
    { type: "query.committed", query: "github" },
    { type: "page.loaded", attempt: 1, servers: [server("stale")] },
    { type: "page.loaded", attempt: 2, servers: [server("a")], cursor: "next" },
    { type: "more.requested" },
    { type: "page.loaded", attempt: 3, servers: [server("b")] },
  ])

  expect(result.effects.at(-1)).toEqual({ type: "fetch", attempt: 3, query: "github", cursor: "next" })
  expect(result.state).toMatchObject({ status: "ready", query: "github", cursor: undefined })
  expect(result.state.servers.map((item) => item.name)).toEqual(["a", "b"])
})

test("retrying a failed Load more keeps the loaded servers and the cursor", () => {
  const result = search([
    { type: "query.committed", query: "" },
    { type: "page.loaded", attempt: 1, servers: [server("a")], cursor: "next" },
    { type: "more.requested" },
    { type: "page.failed", attempt: 2 },
    { type: "retry.requested" },
  ])

  expect(result.effects.at(-1)).toEqual({ type: "fetch", attempt: 3, query: "", cursor: "next" })
  expect(result.state.servers.map((item) => item.name)).toEqual(["a"])
})
