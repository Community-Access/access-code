import { describe, expect, test } from "bun:test"
import { transition, type ModeState } from "./mode-machine"

describe("voice mode lifecycle", () => {
  test("does not activate a stopped or superseded microphone request", () => {
    const idle: ModeState<string, number> = { type: "idle" }
    const first = transition(idle, { type: "start", id: "first", options: "first session" })
    const stopped = transition(first, { type: "end" })
    const second = transition(stopped, { type: "start", id: "second", options: "second session" })

    expect(transition(second, { type: "started", id: "first", recorder: 1 })).toBe(second)
    expect(transition(second, { type: "failed", id: "first" })).toBe(second)
    expect(transition(second, { type: "started", id: "second", recorder: 2 })).toEqual({
      type: "active",
      id: "second",
      options: "second session",
      recorder: 2,
    })
  })

  test("claims startup synchronously and returns to idle on failure or stop", () => {
    const idle: ModeState<string, number> = { type: "idle" }
    const starting = transition(idle, { type: "start", id: "first", options: "session" })

    expect(transition(starting, { type: "start", id: "second", options: "other" })).toBe(starting)
    expect(transition(starting, { type: "failed", id: "first" })).toEqual(idle)
    const active = transition(starting, { type: "started", id: "first", recorder: 1 })
    expect(transition(active, { type: "end" })).toEqual(idle)
  })
})
