import { expect, test } from "bun:test"
import { createRemoveState, transitionRemove, type RemoveEffect, type RemoveEvent } from "./remove-machine"

function replay(events: RemoveEvent[]) {
  return events.reduce(
    (current, event) => {
      const result = transitionRemove(current.state, event)

      return { state: result.state, effects: [...current.effects, ...result.effects] }
    },
    { state: createRemoveState(), effects: [] as RemoveEffect[] },
  )
}

test("a second Remove while removing does nothing, and a late result of an old attempt is ignored", () => {
  const result = replay([
    { type: "confirmed" },
    { type: "confirmed" },
    { type: "failed", attempt: 1, error: "busy" },
    { type: "confirmed" },
    { type: "succeeded", attempt: 1 },
    { type: "succeeded", attempt: 2 },
  ])

  expect(result.effects).toEqual([
    { type: "remove", attempt: 1 },
    { type: "failed", error: "busy" },
    { type: "remove", attempt: 2 },
    { type: "removed" },
  ])
  expect(result.state).toEqual({ status: "removed", attempt: 2 })
})
