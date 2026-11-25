import { describe, expect, test } from "bun:test"
import { transition, type DictationState } from "./dictation-machine"

const recorder = { onSpeech() {}, stop() {} }

describe("dictation lifecycle", () => {
  test("ignores a microphone result after the composer is disposed", () => {
    const idle: DictationState = { type: "idle" }
    const starting = transition(idle, { type: "start", id: "first" })
    const disposed = transition(starting, { type: "dispose" })

    expect(transition(disposed, { type: "started", id: "first", recorder })).toBe(disposed)
    expect(transition(disposed, { type: "start", id: "second" })).toBe(disposed)
  })

  test("does not start again while final dictation is being transcribed", () => {
    const idle: DictationState = { type: "idle" }
    const starting = transition(idle, { type: "start", id: "first" })
    const recording = transition(starting, { type: "started", id: "first", recorder })
    const stopping = transition(recording, { type: "stop" })

    expect(transition(stopping, { type: "start", id: "second" })).toBe(stopping)
    expect(transition(stopping, { type: "finished", id: "old" })).toBe(stopping)
    expect(transition(stopping, { type: "finished", id: "first" })).toEqual(idle)
  })
})
